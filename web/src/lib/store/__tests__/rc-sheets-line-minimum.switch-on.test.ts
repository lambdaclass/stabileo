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
    const v15 = lines.find((l) => l.name === 'V15')!;
    expect(v15.adopted.spanBottom[2]!.count).toBeGreaterThan(0);
    expect(v15.adopted.spanBottom.slice(0, 2).every((g) => g.count === 0)).toBe(true);

    setAdopted(v15.key, { ...v15.adopted, spanBottom: v15.adopted.spanBottom.map((g) => ({ ...g, count: 0 })) });
    const short = buildSheetRows().line.find((l) => l.key === v15.key)!;
    expect(check(short).ok).toBe(false);
    expect(short.status).toBe('fail');

    setLocale('es');
    const html = render(RcLineEditor, { props: { line: short } }).body;
    const order = [...html.matchAll(/data-testid="(rc-line-(?:support|span)-\d+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['rc-line-support-0', 'rc-line-span-0', 'rc-line-support-1', 'rc-line-span-1', 'rc-line-support-2', 'rc-line-span-2', 'rc-line-support-3']);
    expect(html).toContain('Refuerzos a lo largo de la viga');
    setLocale('en');
  }, 600_000);
});
