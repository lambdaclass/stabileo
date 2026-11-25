/**
 * A line's bars never fall short of the steel its chart asks for, the strength or the minimum
 * (§9.6.1.1 unless 4/3 of the strength's): the proposal adds a span's or a support's own bars
 * where they are short, the check fails a line adopted short, and the editor offers each support
 * and span its own extras, along the beam.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from 'svelte/server';
import { initSolver } from '../../engine/wasm-solver';
import { solvedExample } from './rc-rebar-3d-fixture';
import { buildSheetRows, setAdopted } from '../rc-sheets.svelte';
import { shortStretches } from '../../rc-sheets/line-steel';
import { setLocale } from '../../i18n';
import RcLineEditor from '../../../components/pro/rc-sheets/RcLineEditor.svelte';

beforeAll(async () => { await initSolver(); });

const check = (l: { verifications: Array<{ label: string; ok: boolean }> }) => l.verifications.find((v) => v.label === 'rcSheets.v.lineMinimum')!;

describe('the steel of a line against its chart', () => {
  it('is never short in a proposal, a short span given its own bars; adopted short, it fails', async () => {
    await solvedExample('pro-rc-party-wall');
    const lines = buildSheetRows().line;
    for (const l of lines) {
      expect(check(l).ok, l.name).toBe((['top', 'bottom'] as const).every((f) => shortStretches(l.steel ?? [], f).length === 0));
      if (!l.isAdopted) expect(check(l).ok, l.name).toBe(true);
    }
    const extra = lines.find((l) => !l.isAdopted && l.adopted.spanBottom.some((g) => g.count > 0))!;
    expect(extra, 'a line given a span\'s own bottom bars').toBeDefined();
    setAdopted(extra.key, { ...extra.adopted, spanBottom: extra.adopted.spanBottom.map((g) => ({ ...g, count: 0 })) });
    const short = buildSheetRows().line.find((l) => l.key === extra.key)!;
    expect(check(short).ok).toBe(false);
    expect(short.status).toBe('fail');

    setLocale('es');
    const html = render(RcLineEditor, { props: { line: short } }).body;
    const order = [...html.matchAll(/data-testid="(rc-line-(?:support|span)-\d+)"/g)].map((m) => m[1]);
    expect(order).toEqual(short.adopted.supportTop.flatMap((_, j) => [`rc-line-support-${j}`, ...(j < short.adopted.spanBottom.length ? [`rc-line-span-${j}`] : [])]));
    expect(html).toContain('Refuerzos a lo largo de la viga');
    setLocale('en');
  }, 600_000);
});
