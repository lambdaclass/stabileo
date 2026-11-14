import { describe, it, expect } from 'vitest';
import { makeFmt } from '../format';
import type { SlabDemand } from '../slab-row';
import { planDrawing, slabPlan, slabSpanKind, type LevelGeometry, type PlanBeam, type SlabPackage } from '../slab-plan';
import { rulesFor } from '../codes';
import { CIRSOC_LINE } from '../beam-line';
import { meshArea } from '../bars';
import { SHEET_CODE_LIST, type SheetCode } from '../types';

const f = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.02, diameters: [6, 8, 10, 12, 16] };
const plan = { ...ctx, bent: false };
const bctx = { mat: ctx.mat, cover: ctx.cover, stirrupDia: 0, diameters: ctx.diameters, torsion: 'equilibrium' as const };

const demand = (key: string, x0: number, x1: number, y0: number, y1: number, m: [number, number, number, number]): SlabDemand => ({
  key, name: key, level: 'N1', lx: x1 - x0, ly: y1 - y0, h: 0.15, bounds: { x0, x1, y0, y1, z: 3 },
  m: { bottomX: { value: m[0] }, bottomY: { value: m[1] }, topX: { value: m[2] }, topY: { value: m[3] } },
});
const beam = (x1: number, y1: number, x2: number, y2: number): PlanBeam => ({ x1, y1, x2, y2, b: 0.2, kind: 'beam' });
const frame = (xs: number[], ys: number[]): PlanBeam[] => [
  ...xs.map((x) => beam(x, ys[0]!, x, ys[ys.length - 1]!)),
  ...ys.map((y) => beam(xs[0]!, y, xs[xs.length - 1]!, y)),
];

const twoPanels = (code: SheetCode = 'cirsoc201-2025') => {
  const rules = rulesFor(code);
  const rows = [demand('A', 0, 4, 0, 5, [8, 5, 12, 6]), demand('B', 4, 9, 0, 5, [10, 6, 14, 7])].map((d) => rules.slabRow(d, ctx, undefined, f));
  const geom: LevelGeometry = { level: 'N1', beams: frame([0, 4, 9], [0, 5]), columns: [] };
  return { rows, geom, rules };
};

const crossing = (pk: SlabPackage, at: number) => pk.runs.some((r) => r.face === 'top' && r.from < at && r.to > at);

describe('level plan of slab bars', () => {
  it('lays one top package across the beam two panels share, reaching past each face by max(ld; 0.30·ln)', () => {
    const { rows, geom } = twoPanels();
    const p = slabPlan('N1', rows, geom, plan);
    const over = p.packages.filter((pk) => pk.layer === 'top' && pk.dir === 'x' && crossing(pk, 4));
    expect(over).toHaveLength(1);
    const pk = over[0]!;
    expect(pk.kind).toBe('support');
    expect(pk.panels.sort()).toEqual(['A', 'B']);
    const ld = CIRSOC_LINE.development(bctx, pk.bars.dia, true, 0.15);
    const lnA = 4 - 0.1 - 0.1, lnB = 5 - 0.1 - 0.1;
    const leftReach = 3.9 - pk.from, rightReach = pk.to - 4.1;
    expect(leftReach).toBeGreaterThanOrEqual(Math.max(ld, 0.3 * lnA) - 1e-9);
    expect(rightReach).toBeGreaterThanOrEqual(Math.max(ld, 0.3 * lnB) - 1e-9);
    expect(leftReach).toBeLessThan(Math.max(ld, 0.3 * lnA) + 0.05 + 1e-9);
    expect(pk.reach.map((r) => r.needed)).toEqual([Math.max(ld, 0.3 * lnA), Math.max(ld, 0.3 * lnB)].map((x) => expect.closeTo(x, 9)));
    expect(pk.band).toEqual({ from: 0, to: 5 });
    expect(pk.shape.pts).toHaveLength(4);
    expect(pk.shape.pts[0]![1]).toBeLessThan(pk.shape.pts[1]![1]);
    expect(pk.length).toBeGreaterThan(pk.to - pk.from);
    expect(pk.count).toBe(Math.floor((5 - 2 * Math.min(0.05, pk.bars.spacing / 2)) / pk.bars.spacing + 1e-9) + 1);
  });

  it('runs each bottom package into the beams it rests on, to the far face less the cover, with its ends turned up; edge top bars hook inside the edge beam', () => {
    const { rows, geom } = twoPanels();
    const p = slabPlan('N1', rows, geom, plan);
    const bx = p.packages.filter((pk) => pk.layer === 'bottom' && pk.dir === 'x');
    expect(bx).toHaveLength(2);
    const a = bx.find((pk) => pk.panels[0] === 'A')!;
    expect(a.from).toBeCloseTo(-0.1 + 0.02, 9);
    expect(a.to).toBeCloseTo(4.1 - 0.02, 9);
    const ys = a.shape.pts.map((q) => q[1]);
    expect(a.shape.pts).toHaveLength(4);
    expect(ys[0]).toBeGreaterThan(ys[1]!);
    expect(ys[3]).toBeGreaterThan(ys[2]!);
    expect(a.length).toBeGreaterThan(a.to - a.from);
    const edge = p.packages.find((pk) => pk.kind === 'edge' && pk.dir === 'x' && pk.from < 0.5)!;
    expect(edge.from).toBeCloseTo(-0.1 + 0.02, 9);
    expect(edge.anchor?.available).toBeCloseTo(0.18, 9);
  });

  it('folds the bars of each direction as the plan is turned: X legs drawn down from the bar, Y legs to its right, for a top bar', () => {
    const { rows, geom } = twoPanels();
    const p = slabPlan('N1', rows, geom, plan);
    const draw = planDrawing(p, { bottom: true, top: true }, makeFmt('.'));
    const top = (d: 'x' | 'y') => draw.find((b) => b.layer === 'top' && b.dir === d && b.pts.length >= 4);
    const tx = top('x'), ty = top('y');
    if (tx) expect(tx.pts[0]![1]).toBeLessThan(tx.pts[1]![1]);
    if (ty) expect(ty.pts[0]![0]).toBeGreaterThan(ty.pts[1]![0]);
    expect(tx ?? ty).toBeDefined();
  });

  it('provides at least the area each panel row requires, in every strip', () => {
    for (const code of SHEET_CODE_LIST) {
      for (const bent of [false, true]) {
        const { rows, geom, rules } = twoPanels(code);
        const p = slabPlan('N1', rows, geom, { ...plan, bent }, rules.slabPlan);
        expect(p.checks.length).toBeGreaterThanOrEqual(4);
        for (const c of p.checks) {
          expect(c.provided, `${code} ${bent} ${c.where} ${c.layer}${c.dir}`).toBeGreaterThanOrEqual(c.required - 1e-6);
          expect(c.spacing).toBeLessThanOrEqual(c.sMax + 1e-6);
        }
        for (const r of rows) for (const d of ['X', 'Y'] as const) {
          expect(p.checks.find((c) => c.where === r.name && c.layer === 'bottom' && c.dir === d.toLowerCase())!.required).toBeCloseTo(r.faces[`bottom${d}`].asReq, 9);
        }
        const shared = p.supports.find((s) => s.dir === 'x' && s.at === 4 && s.below && s.above)!;
        const top = p.checks.find((c) => c.where === shared.id)!;
        expect(top.required).toBeCloseTo(Math.max(rows[0]!.faces.topX.asReq, rows[1]!.faces.topX.asReq), 9);
        expect(p.ok).toBe(true);
      }
    }
  });

  it('anchors a balcony top bar, beside the columns of the beam it hangs from, into the back span at least the balcony length, and takes it to the free edge with a leg', () => {
    const rules = rulesFor('cirsoc201-2025');
    const rows = [demand('L1', 0, 5, 0, 4, [8, 6, 10, 8]), demand('B1', 0, 5, 4, 5.8, [1, 1, 3, 22])].map((d) => rules.slabRow(d, ctx, undefined, f));
    const columns = [0, 5].flatMap((x) => [0, 4].map((y) => ({ x, y, b: 0.3, h: 0.3 })));
    const geom: LevelGeometry = { level: 'N1', beams: frame([0, 5], [0, 4]), columns };
    const p = slabPlan('N1', rows, geom, plan);
    expect(p.cantilevers).toEqual([{ panel: 'B1', dir: 'y', length: expect.closeTo(1.7, 9) }]);
    const pk = p.packages.find((x) => x.kind === 'cantilever')!;
    expect(pk.dir).toBe('y');
    expect(pk.to).toBeCloseTo(5.8 - 0.02, 9);
    const back = 3.9 - pk.from;
    expect(back).toBeGreaterThanOrEqual(1.7 - 1e-9);
    expect(back).toBeGreaterThanOrEqual(CIRSOC_LINE.development(bctx, pk.bars.dia, true, 0.15) - 1e-9);
    expect(meshArea(pk.bars)).toBeGreaterThanOrEqual(rows[1]!.faces.topY.asReq - 1e-6);
    expect(pk.shape.pts[3]![1]).toBeLessThan(pk.shape.pts[2]![1]);
    expect(p.packages.filter((x) => x.layer === 'top' && x.dir === 'y' && crossing(x, 4))).toHaveLength(1);
    expect(p.ok).toBe(true);
  });

  it('with bent bars on, half the span bars rise over both supports, and the top over a shared beam is made up by them', () => {
    const { rows, geom } = twoPanels();
    const p = slabPlan('N1', rows, geom, { ...plan, bent: true });
    const bent = p.packages.filter((pk) => pk.kind === 'bent' && pk.dir === 'x');
    expect(bent).toHaveLength(2);
    const a = bent.find((pk) => pk.panels[0] === 'A')!;
    const straight = p.packages.find((pk) => pk.kind === 'span' && pk.dir === 'x' && pk.panels[0] === 'A')!;
    expect(a.bars.spacing).toBeCloseTo(rows[0]!.adopted.bottomX.spacing * 2, 9);
    expect(straight.bars.spacing).toBeCloseTo(rows[0]!.adopted.bottomX.spacing * 2, 9);
    expect(a.runs.map((r) => r.face)).toEqual(['top', 'bottom', 'top']);
    expect(a.runs[2]!.to).toBeGreaterThan(4.1);
    expect(a.runs[0]!.from).toBeLessThan(0);
    expect(a.shape.pts).toHaveLength(8);
    const ln = 3.8;
    expect(a.runs[1]!.from).toBeCloseTo(0.1 + 0.2 * ln, 9);
    expect(p.packages.filter((pk) => pk.dir === 'x' && (pk.layer === 'top' || pk.kind === 'bent') && crossing(pk, 4)).length).toBeGreaterThanOrEqual(2);
    expect(p.baseMesh).toBeUndefined();
  });

  it('draws one bar for each package, folded, with its label and band', () => {
    const { rows, geom } = twoPanels();
    const p = slabPlan('N1', rows, geom, { ...plan, bent: true });
    const all = planDrawing(p, { bottom: true, top: true, base: true }, f, 2);
    expect(all.map((b) => b.id)).toEqual(p.packages.map((pk) => pk.id));
    const keys = all.map((b) => `${b.layer}|${b.dir}|${b.kind}|${b.mark}`);
    expect(new Set(keys).size).toBe(keys.length);
    const pk = p.packages.find((x) => x.kind === 'support')!;
    const d = all.find((b) => b.id === pk.id)!;
    expect(d.label).toBe(`Ø${pk.bars.dia} c/${Math.round(pk.bars.spacing * 100)} L=${f(pk.length, 2)}`);
    expect(d.pts).toHaveLength(pk.shape.pts.length);
    const leg = pk.shape.pts[1]![1] - pk.shape.pts[0]![1];
    expect(Math.abs(d.pts[1]![1] - d.pts[0]![1])).toBeCloseTo(leg * 2, 9);
    expect(d.band).toEqual([[expect.any(Number), 0], [expect.any(Number), 5]]);
    expect(d.legs.map((l) => l.length)).toEqual([leg, pk.to - pk.from, leg].map((x) => expect.closeTo(x, 9)));
    expect(planDrawing(p, { bottom: false, top: true }, f).every((b) => b.layer === 'top')).toBe(true);
    expect(planDrawing(p, { bottom: true, top: false }, f).every((b) => b.layer === 'bottom')).toBe(true);
  });

  it('says a bottom mesh the same in every panel both ways as a note, not drawn', () => {
    const rules = rulesFor('cirsoc201-2025');
    const rows = [demand('A', 0, 4, 0, 4, [3, 3, 6, 6]), demand('B', 4, 8, 0, 4, [3, 3, 6, 6])].map((d) => rules.slabRow(d, ctx, undefined, f));
    const p = slabPlan('N1', rows, { level: 'N1', beams: frame([0, 4, 8], [0, 4]), columns: [] }, plan);
    expect(p.baseMesh).toEqual(rows[0]!.adopted.bottomX);
    expect(p.packages.filter((pk) => pk.kind === 'span').every((pk) => pk.base)).toBe(true);
    expect(planDrawing(p, { bottom: true, top: true }, f).some((b) => b.kind === 'span')).toBe(false);
    expect(planDrawing(p, { bottom: true, top: true, base: true }, f).filter((b) => b.kind === 'span')).toHaveLength(4);
  });

  it('on a flat slab, a column line inside a panel gets column-strip and middle-strip top bars', () => {
    const rules = rulesFor('aci318-19');
    const rows = [demand('P', 0, 12, 0, 6, [12, 10, 20, 18])].map((d) => rules.slabRow(d, ctx, undefined, f));
    const columns = [0, 6, 12].flatMap((x) => [0, 6].map((y) => ({ x, y, b: 0.4, h: 0.4 })));
    const p = slabPlan('N1', rows, { level: 'N1', beams: [], columns }, plan, rules.slabPlan);
    const inner = p.supports.find((s) => s.dir === 'x' && s.at === 6)!;
    expect(inner.kind).toBe('columns');
    const strips = p.packages.filter((pk) => pk.layer === 'top' && pk.dir === 'x' && crossing(pk, 6));
    expect(strips.length).toBe(3);
    const cs = strips.find((pk) => pk.band.from === 0)!, ms = strips.find((pk) => pk.band.from > 0 && pk.band.to < 6)!;
    expect(cs.band.to).toBeCloseTo(1.5, 9);
    expect(6 - cs.from).toBeGreaterThan(6 - ms.from);
    expect(p.checks.every((c) => c.provided >= c.required - 1e-6)).toBe(true);
  });

  it('names how a panel spans: a cantilever its plan finds, one-way past 2:1, two-way otherwise', () => {
    const plans = [{ level: 'N1', cantilevers: [{ panel: 'L4', dir: 'x' as const, length: 1.85 }] }];
    expect(slabSpanKind({ name: 'L4', level: 'N1', oneWay: true }, plans)).toBe('cantilever');
    expect(slabSpanKind({ name: 'L4', level: 'N2', oneWay: true }, plans)).toBe('oneWay');
    expect(slabSpanKind({ name: 'L1', level: 'N1', oneWay: false }, plans)).toBe('twoWay');
  });
});
