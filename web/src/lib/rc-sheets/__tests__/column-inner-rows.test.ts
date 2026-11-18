import { describe, it, expect } from 'vitest';
import { barClearance, columnLayout, growColumn, innerTies, rowClear } from '../column-layout';
import { columnArea, columnBars, confinedTies, type ColumnDemand } from '../column-row';
import { rulesFor } from '../codes';
import { minClear as ec2MinClear } from '../ec2/basis';
import { columnSection } from '../drawing';
import { makeFmt } from '../format';
import { SHEET_CODES, type ColumnAdopted, type SheetCode } from '../types';

const fmt = makeFmt('.');
const CODES = Object.keys(SHEET_CODES) as SheetCode[];
const aciClear = (dia: number) => Math.max((1.5 * dia) / 1000, 0.04);
const codeClear = (code: SheetCode) => (code === 'en1992-1-1' || code === 'bs-en1992-1-1' ? ec2MinClear : aciClear);

/** The smallest clear spacing between two bars less what `min` asks of the larger, m; and every bar inside the tie. */
function geometry(d: { b: number; h: number }, a: ColumnAdopted, cover: number, min: (dia: number) => number) {
  const bars = columnLayout(d, a, cover).bars;
  let slack = Infinity;
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) {
    const p = bars[i]!, q = bars[j]!;
    slack = Math.min(slack, Math.hypot(p.x - q.x, p.y - q.y) - (p.dia + q.dia) / 2000 - min(Math.max(p.dia, q.dia)));
  }
  const edge = (side: number) => side / 2 - cover - a.tieDia / 1000;
  return { slack, inside: bars.every((p) => Math.abs(p.x) + p.dia / 2000 <= edge(d.b) + 1e-9 && Math.abs(p.y) + p.dia / 2000 <= edge(d.h) + 1e-9), bars };
}

const demand = (b: number, h: number, pu: number, mx: number, my: number): ColumnDemand => ({
  key: 'column:1:0', name: 'C1', b, h, length: 3, lu: 2.6, psiTop: 1, psiBot: 1,
  cases: [{ combo: 'U', pu, puD: 0.6 * pu, mxTop: mx, mxBot: -0.5 * mx, myTop: my, myBot: -0.5 * my, vx: 20, vy: 20 }],
});

describe('a column\'s rows inside its faces', () => {
  it('stand behind the face bars, a bar and §25.2.3\'s clear spacing inside the row outside them', () => {
    const a: ColumnAdopted = { corner: 20, nx: 3, dx: 20, ny: 3, dy: 20, tieDia: 8, tieSpacing: 0.15, inner: { nx: 1, ny: 1, dia: 20 } };
    const { bars, rows } = columnLayout({ b: 0.5, h: 0.5 }, a, 0.03);
    const face = bars.filter((p) => p.row === 'b').map((p) => +p.x.toFixed(9));
    expect(rows[0]!.aligned).toBe(true);
    for (const x of rows[0]!.xs) expect(face).toContain(+x.toFixed(9));
    expect(0.25 - 0.03 - 0.008 - 0.01 - rows[0]!.yIn).toBeCloseTo(0.02 + rowClear(20), 9);
  });

  it('keep the rows along b clear of those along h at the inner corners, where spreading them along the whole face put two bars 5 mm apart', () => {
    const a: ColumnAdopted = { corner: 16, nx: 4, dx: 16, ny: 4, dy: 16, tieDia: 8, tieSpacing: 0.15, inner: { nx: 4, ny: 4, dia: 16 } };
    const g = geometry({ b: 0.6, h: 0.6 }, a, 0.03, aciClear);
    const { rows } = columnLayout({ b: 0.6, h: 0.6 }, a, 0.03);
    expect(Math.max(...rows[0]!.xs)).toBeLessThanOrEqual(rows[0]!.xIn - 0.016 - rowClear(16) + 1e-9);
    expect(g.slack).toBeGreaterThanOrEqual(-1e-4);
  });

  it('never overlap nor come closer than the code asks once the layout passes its spacing check, across sections, bars and rows, in every code', { timeout: 60_000 }, () => {
    let checked = 0, refused = 0;
    for (const code of CODES) {
      const rules = rulesFor(code), min = codeClear(code);
      for (const [b, h] of [[0.25, 0.25], [0.3, 0.5], [0.4, 0.4], [0.5, 0.8], [0.7, 0.7]] as const) {
        for (const dia of [12, 20, 32]) for (const n of [0, 2, 5]) for (const inn of [[1, 0], [2, 0], [1, 1], [2, 2], [3, 3], [4, 2]] as const) for (const rows of [1, 2]) {
          const a: ColumnAdopted = { corner: dia, nx: n, dx: dia, ny: n, dy: dia, tieDia: dia > 25 ? 10 : 8, tieSpacing: 0.15, inner: { nx: inn[0], ny: inn[1], dia, rows } };
          const row = rules.columnRow({ ...demand(b, h, 800, 60, 30), cases: [] }, { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: a.tieDia, diameters: [dia] }, a, fmt);
          const g = geometry({ b, h }, a, 0.03, min);
          if (row.checks.spacingOk) { expect(g.slack, `${code} ${b}×${h} ${JSON.stringify(a)}`).toBeGreaterThanOrEqual(-1e-4); expect(g.inside).toBe(true); checked++; }
          else { expect(g.slack < -1e-4 || !g.inside || outerTight({ b, h }, a, min)).toBe(true); refused++; }
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(refused).toBeGreaterThan(300);
  });

  it('are proposed only when the faces alone cannot carry the demand, in every code, and the proposal keeps every bar clear of every other', () => {
    for (const code of CODES) {
      const rules = rulesFor(code), min = codeClear(code);
      const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [16, 20, 25] };
      const light = rules.columnRow(demand(0.4, 0.4, 900, 40, 20), ctx, undefined, fmt);
      expect(light.proposed.inner, code).toBeUndefined();
      for (const [b, h, pu, mx, my] of [[0.35, 0.35, 3800, 160, 90], [0.4, 0.6, 5200, 420, 150], [0.45, 0.45, 6000, 300, 200]] as const) {
        const r = rules.columnRow(demand(b, h, pu, mx, my), ctx, undefined, fmt);
        const g = geometry({ b, h }, r.proposed, 0.03, min);
        expect(g.slack, `${code} ${b}×${h}`).toBeGreaterThanOrEqual(-1e-4);
        expect(g.inside).toBe(true);
        expect(r.checks.spacingOk).toBe(true);
      }
    }
  });

  it('let a heavily loaded column verify without a larger section in every code, where the bars of the list fill the faces', () => {
    const scenarios: Array<[SheetCode, number, number, number]> = [
      ['cirsoc201-2025', 0.5, 4800, 0.08], ['aci318-19', 0.5, 4800, 0.08], ['bs-en1992-1-1', 0.5, 5800, 0.08], ['en1992-1-1', 0.5, 6400, 0.08], ['ts500-2000', 0.6, 6000, 0.16],
    ];
    for (const [code, b, pu, e] of scenarios) {
      const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [16] };
      const rules = rulesFor(code), d = demand(b, b, pu, e * pu * b, (e / 2) * pu * b);
      const r = rules.columnRow(d, ctx, undefined, fmt);
      expect(r.status, `${code}: ${r.verifications.filter((v) => !v.ok).map((v) => v.label).join(', ')}`).not.toBe('fail');
      expect((r.proposed.inner?.nx ?? 0) + (r.proposed.inner?.ny ?? 0), code).toBeGreaterThan(0);
      const { inner: _drop, ...faces } = r.proposed;
      expect(rules.columnRow(d, ctx, faces, fmt).status, code).toBe('fail');
      expect(geometry(d, r.proposed, 0.03, codeClear(code)).slack).toBeGreaterThanOrEqual(-1e-4);
    }
  });

  it('are held by crossties, two hooks round each facing pair, counted and drawn, and leave chapter 18\'s hx to the perimeter bars', () => {
    const a: ColumnAdopted = { corner: 20, nx: 3, dx: 20, ny: 3, dy: 20, tieDia: 8, tieSpacing: 0.1, inner: { nx: 1, ny: 1, dia: 20, rows: 2 } };
    const t = innerTies({ b: 0.6, h: 0.6 }, a, 0.03);
    expect([t.x, t.y]).toEqual([2, 2]);
    expect(columnSection(0.6, 0.6, 0.03, a).crossties!.length).toBeGreaterThanOrEqual(t.x + t.y);
    const { inner: _drop, ...outer } = a;
    expect(confinedTies({ b: 0.6, h: 0.6 }, a, { cover: 0.03 }).hx).toBeCloseTo(confinedTies({ b: 0.6, h: 0.6 }, outer, { cover: 0.03 }).hx, 12);
  });

  it('weigh in the capacity where they stand: in EN 1992 a row inside reads less than the same bars on the face, and more than none', () => {
    const d = demand(0.5, 0.5, 2500, 380, 0);
    const ctx = { mat: { fc: 30, fy: 500 }, cover: 0.03, tieDia: 8, diameters: [20] };
    const base: ColumnAdopted = { corner: 20, nx: 2, dx: 20, ny: 0, dy: 20, tieDia: 8, tieSpacing: 0.15 };
    const rules = rulesFor('en1992-1-1');
    const none = rules.columnRow(d, ctx, base, fmt).checks.ratio;
    const inside = rules.columnRow(d, ctx, { ...base, inner: { nx: 2, ny: 0, dia: 20 } }, fmt).checks.ratio;
    const face = rules.columnRow(d, ctx, { ...base, nx: 4 }, fmt).checks.ratio;
    expect(columnArea({ ...base, inner: { nx: 2, ny: 0, dia: 20 } })).toBeCloseTo(columnArea({ ...base, nx: 4 }), 9);
    expect(inside).toBeLessThan(none);
    expect(face).toBeLessThan(inside);
  });

  it('grow one or two at a time so that each stays behind a face bar', () => {
    const d = { b: 0.5, h: 0.5 };
    const a: ColumnAdopted = { corner: 20, nx: 4, dx: 20, ny: 4, dy: 20, tieDia: 8, tieSpacing: 0.15 };
    const fits = (x: ColumnAdopted) => barClearance(d, columnLayout(d, x, 0.03).bars, 0.03, 8, aciClear).ok && columnBars(d, x, { cover: 0.03 }).length < 40;
    let x: ColumnAdopted | null = a;
    for (let k = 0; k < 3 && x; k++) {
      x = growColumn(d, x, 0.03, 20, fits, true);
      if (x?.inner) expect(columnLayout(d, x, 0.03).rows.every((r) => r.aligned)).toBe(true);
    }
    expect(x?.inner).toBeDefined();
  });
});

/** The outer row alone fails its spacing: no inner row is to blame. */
function outerTight(d: { b: number; h: number }, a: ColumnAdopted, min: (dia: number) => number): boolean {
  const { inner: _x, ...outer } = a;
  return geometry(d, outer, 0.03, min).slack < -1e-4 || !geometry(d, outer, 0.03, min).inside;
}
