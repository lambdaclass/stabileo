/**
 * "Exportar vista" when things go wrong:
 * - a PNG the browser cannot encode (`toBlob` gives null) is told, rather than nothing
 *   downloading and nothing said;
 * - "Copy image" of a model that cannot be solved says so once, and a clipboard that refuses
 *   before the picture is ready leaves no unhandled rejection behind.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const downloads = vi.hoisted(() => [] as Array<{ blob: Blob; name: string }>);
const encodes = vi.hoisted(() => ({ ok: [] as boolean[] }));
const solve = vi.hoisted(() => ({ result: { ok: true } as { ok: true } | { ok: false; error: string }, effect: null as null | (() => void) }));
vi.mock('../../actions/solve', async (orig) => ({
  ...(await orig<typeof import('../../actions/solve')>()),
  ensureResults: async () => { solve.effect?.(); return solve.result; },
}));
const painted = vi.hoisted(() => [] as Array<string[] | undefined>);
vi.mock('../containment', async (orig) => ({
  ...(await orig<typeof import('../containment')>()),
  warningCanvas: (c: HTMLCanvasElement, w?: string[]) => { painted.push(w); return c; },
}));
vi.mock('../../store/file', async (orig) => ({
  ...(await orig<typeof import('../../store/file')>()),
  downloadBlob: (blob: Blob, name: string) => { downloads.push({ blob, name }); },
}));
vi.mock('../view-figure', async (orig) => ({
  ...(await orig<typeof import('../view-figure')>()),
  toCanvas: () => ({}),
  canvasToBlob: async () => ((encodes.ok.shift() ?? false) ? new Blob(['png'], { type: 'image/png' }) : null),
}));
import { resultsStore, uiStore } from '../../store';
import { DEFAULT_FIGURE_OPTIONS, registerFigure2D } from '../view-figure';
import { copyView, exportView } from '../view-export';

describe('a PNG the browser cannot encode', () => {
  let unregister: () => void = () => {};
  beforeEach(() => {
    downloads.length = 0;
    uiStore.analysisMode = '2d';
    unregister = registerFigure2D({
      nodes: () => [{ x: 0, y: 0 }, { x: 4, y: 0 }],
      render(ctx, _w, _h, _frame, view) {
        ctx.beginPath(); ctx.moveTo(view.panX, view.panY); ctx.lineTo(view.panX + 4 * view.zoom, view.panY); ctx.stroke();
      },
    });
  });
  afterEach(() => { unregister(); vi.restoreAllMocks(); });

  it('says so, and downloads nothing', async () => {
    const toast = vi.spyOn(uiStore, 'toast');
    encodes.ok = [false];
    const ok = await exportView({ format: 'png', contents: ['model'], options: { ...DEFAULT_FIGURE_OPTIONS }, sheet: false });
    expect(ok).toBe(false);
    expect(downloads).toHaveLength(0);
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('one of two figures failing still downloads the other, and says so', async () => {
    const toast = vi.spyOn(uiStore, 'toast');
    encodes.ok = [true, false];
    const ok = await exportView({ format: 'png', contents: ['model', 'model'], options: { ...DEFAULT_FIGURE_OPTIONS }, sheet: false });
    expect(ok).toBe(true);
    expect(downloads).toHaveLength(1);
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'error');
  });
});

describe('copy image', () => {
  class FakeClipboardItem {
    constructor(readonly items: Record<string, Promise<Blob>>) {}
  }
  beforeEach(() => {
    uiStore.analysisMode = '2d';
    solve.result = { ok: false, error: 'singular' };
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); solve.result = { ok: true }; });

  it('a model that cannot be solved is told once, not twice', async () => {
    // The clipboard waits for the picture, and fails with it.
    vi.stubGlobal('navigator', { clipboard: { write: async (items: FakeClipboardItem[]) => { await items[0]!.items['image/png']; } } });
    const toast = vi.spyOn(uiStore, 'toast');
    expect(await copyView({ format: 'png', contents: ['moment'], options: { ...DEFAULT_FIGURE_OPTIONS }, sheet: true })).toBe(false);
    expect(toast.mock.calls.filter((c) => c[1] === 'error')).toHaveLength(1);
  });

  it.each(['warning', 'error'] as const)('a %s produced by the solve the copy runs is what the picture carries', (severity) => {
    return (async () => {
      resultsStore.clear();
      const unregister = registerFigure2D({
        nodes: () => [{ x: 0, y: 0 }, { x: 4, y: 0 }],
        render(ctx, _w, _h, _frame, view) { ctx.beginPath(); ctx.moveTo(view.panX, view.panY); ctx.stroke(); },
      });
      painted.length = 0;
      encodes.ok = [true];
      solve.result = { ok: true };
      solve.effect = () => resultsStore.setResults({
        displacements: [], reactions: [], elementForces: [],
        structuredDiagnostics: [{ code: 'known_issue', severity, phase: 'BU-BOUND', value: 741, message: 'ENGINE' }],
      } as never);
      let copied: Blob | null = null;
      vi.stubGlobal('navigator', { clipboard: { write: async (items: FakeClipboardItem[]) => { copied = await items[0]!.items['image/png']; } } });
      const toast = vi.spyOn(uiStore, 'toast');
      try {
        const ok = await copyView({ format: 'png', contents: ['moment'], options: { ...DEFAULT_FIGURE_OPTIONS }, sheet: true });
        if (severity === 'warning') {
          expect(ok).toBe(true);
          expect(copied).not.toBeNull();
          expect(painted).toHaveLength(1);
          expect(painted[0]!.join()).toContain('#741');
        } else {
          expect(ok).toBe(false);
          expect(copied).toBeNull();
          expect(painted).toHaveLength(0);
          const errors = toast.mock.calls.filter((c) => c[1] === 'error');
          expect(errors).toHaveLength(1);
          expect(errors[0]![0]).toContain('#741');
        }
      } finally {
        unregister();
        solve.effect = null;
        resultsStore.clear();
      }
    })();
  });

  it('a clipboard that refuses first leaves no unhandled rejection', async () => {
    vi.stubGlobal('navigator', { clipboard: { write: async () => { throw new Error('NotAllowedError'); } } });
    const seen: unknown[] = [];
    const onUnhandled = (r: unknown) => { seen.push(r); };
    process.on('unhandledRejection', onUnhandled);
    try {
      expect(await copyView({ format: 'png', contents: ['moment'], options: { ...DEFAULT_FIGURE_OPTIONS }, sheet: true })).toBe(false);
      await new Promise((r) => setTimeout(r, 30));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(seen).toHaveLength(0);
  });
});
