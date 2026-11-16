import { describe, it, expect } from 'vitest';
import { makeFmt } from '../format';
import { rulesFor } from '../codes';
import { cirsocSlabDevelopment, slabRow, type SlabDemand } from '../slab-row';
import { ACI_SLAB_PLAN, CIRSOC_SLAB_PLAN, barPositions, planDrawing, slabPlan, type LevelGeometry, type PlanBeam } from '../slab-plan';
import { meshArea } from '../bars';
import { developedLength } from '../shape';
import { tieDiaFor, type ColumnDemand } from '../column-row';
import { punchingRow, type PunchingDemand } from '../punching-row';
import { slabJointPosition } from '../slab-punching';

const f = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, diameters: [6, 8, 10, 12, 16] };
const plan = { ...ctx, bent: false };
const cirsoc = rulesFor('cirsoc201-2025'), aci = rulesFor('aci318-19');
const ok = (r: { verifications: Array<{ label: string; ok: boolean }> }, label: string) => r.verifications.find((v) => v.label === label)?.ok;

const demand = (key: string, x0: number, x1: number, y0: number, y1: number, m: [number, number, number, number], h = 0.15): SlabDemand => ({
  key, name: key, level: 'N1', lx: x1 - x0, ly: y1 - y0, h, bounds: { x0, x1, y0, y1, z: 3 },
  m: { bottomX: { value: m[0] }, bottomY: { value: m[1] }, topX: { value: m[2] }, topY: { value: m[3] } },
});
const beam = (x1: number, y1: number, x2: number, y2: number): PlanBeam => ({ x1, y1, x2, y2, b: 0.2, kind: 'beam' });
const frame = (xs: number[], ys: number[]): PlanBeam[] => [
  ...xs.map((x) => beam(x, ys[0]!, x, ys[ys.length - 1]!)),
  ...ys.map((y) => beam(xs[0]!, y, xs[xs.length - 1]!, y)),
];

describe('one-way slab distribution steel (FIUBA notes §13.1–13.2)', () => {
  const oneWay = demand('L1', 0, 3, 0, 7, [40, 2, 0, 0], 0.12);

  it('under CIRSOC the secondary bottom face carries max(0.0018·b·h; As,main/5)', () => {
    const r = cirsoc.slabRow(oneWay, ctx, undefined, f);
    expect(r.oneWay).toBe(true);
    const main = meshArea(r.adopted.bottomX);
    expect(r.faces.bottomY.asDistribution).toBeCloseTo(0.2 * main, 9);
    expect(r.faces.bottomY.asReq).toBeCloseTo(Math.max(r.faces.bottomY.asMin, r.faces.bottomY.asStrength, 0.2 * main), 9);
    expect(main * 0.2).toBeGreaterThan(r.faces.bottomY.asMin);
    expect(meshArea(r.adopted.bottomY)).toBeGreaterThanOrEqual(0.2 * main - 1e-9);
    expect(ok(r, 'rcSheets.v.slabDistribution.bottomY')).toBe(true);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.slabDistribution.bottomY')!.clause).toContain('FIUBA');
  });

  it('fails a distribution mesh under a fifth of the main steel, and ACI 318 keeps only the minimum', () => {
    const r = cirsoc.slabRow(oneWay, ctx, undefined, f);
    const thin = cirsoc.slabRow(oneWay, ctx, { ...r.adopted, bottomY: { dia: 6, spacing: 0.25 } }, f);
    expect(ok(thin, 'rcSheets.v.slabDistribution.bottomY')).toBe(false);
    expect(thin.status).toBe('fail');
    const a = aci.slabRow(oneWay, ctx, undefined, f);
    expect(a.faces.bottomY.asDistribution ?? 0).toBe(0);
    expect(a.faces.bottomY.asReq).toBeCloseTo(a.faces.bottomY.asMin, 9);
  });

  it('a two-way panel has no distribution face', () => {
    const r = cirsoc.slabRow(demand('L2', 0, 5, 0, 6, [12, 9, 0, 0]), ctx, undefined, f);
    expect(r.oneWay).toBe(false);
    expect(r.verifications.some((v) => v.label.startsWith('rcSheets.v.slabDistribution'))).toBe(false);
  });

  it('shows each face\'s ld by §25.4.2.4 under CIRSOC only', () => {
    const r = cirsoc.slabRow(oneWay, ctx, undefined, f);
    const g = r.steps.find((s) => s.title === 'rcSheets.g.slabAnchorage')!;
    const bx = g.steps.find((s) => s.label === 'rcSheets.face.bottomX')!;
    const ld = cirsocSlabDevelopment(ctx.mat, r.adopted.bottomX.dia, false, 0.12, { cover: 0.025, spacing: r.adopted.bottomX.spacing }).ldM;
    expect(bx.value).toBe(`ℓd = ${f(ld * 100, 0)} cm`);
    expect(slabRow(oneWay, ctx, undefined, f).steps.some((s) => s.title === 'rcSheets.g.slabAnchorage')).toBe(false);
  });
});

describe('slab plan under CIRSOC 201-2025 and the FIUBA criteria', () => {
  const single = (code = cirsoc) => {
    const rows = [demand('A', 0, 5, 0, 6, [12, 9, 0, 0])].map((d) => code.slabRow(d, ctx, undefined, f));
    const geom: LevelGeometry = { level: 'N1', beams: frame([0, 5], [0, 6]), columns: [] };
    return { rows, geom };
  };

  it('develops slab bars by the general expression, with cb from the cover and spacing', () => {
    const { rows, geom } = single();
    const p = slabPlan('N1', rows, geom, plan, CIRSOC_SLAB_PLAN);
    for (const a of p.anchorage) {
      const s = Math.min(...p.packages.filter((pk) => pk.bars.dia === a.dia).map((pk) => pk.bars.spacing));
      expect(a.ld).toBeCloseTo(cirsocSlabDevelopment(ctx.mat, a.dia, false, 0.15, { cover: 0.025, spacing: s }).ldM, 9);
      expect(a.ld).toBeLessThan(ACI_SLAB_PLAN.line.development({ mat: ctx.mat, cover: 0.025, stirrupDia: 0, diameters: ctx.diameters, torsion: 'equilibrium' }, a.dia, false, 0.15) + 1e-9);
    }
  });

  it('adds a corner package top and bottom both ways at each exterior corner held by beams: a square of ln,max/5 with the largest bottom steel', () => {
    const { rows, geom } = single();
    const p = slabPlan('N1', rows, geom, plan, CIRSOC_SLAB_PLAN);
    const corners = p.checks.filter((c) => c.kind === 'corner');
    expect(corners).toHaveLength(4 * 2 * 2);
    expect(corners.every((c) => c.ok)).toBe(true);
    const largest = Math.max(meshArea(rows[0]!.adopted.bottomX), meshArea(rows[0]!.adopted.bottomY));
    expect(corners.every((c) => Math.abs(c.required - largest) < 1e-9)).toBe(true);
    const top = p.packages.filter((pk) => pk.kind === 'corner' && pk.layer === 'top');
    expect(top).toHaveLength(8);
    const side = Math.ceil(((6 - 0.2) / 5) / 0.05 - 1e-9) * 0.05;
    const sw = top.find((pk) => pk.dir === 'x' && pk.band.from < 1)!;
    expect(sw.band.from).toBeCloseTo(0.1, 9);
    expect(sw.band.to).toBeCloseTo(0.1 + side, 9);
    expect(sw.to).toBeCloseTo(0.1 + side, 9);
    expect(sw.from).toBeCloseTo(-0.1 + 0.025, 9);
    expect(sw.bars).toEqual(meshArea(rows[0]!.adopted.bottomX) >= meshArea(rows[0]!.adopted.bottomY) ? rows[0]!.adopted.bottomX : rows[0]!.adopted.bottomY);
    expect(sw.anchor).toBeDefined();
    expect(p.ok).toBe(true);
    expect(planDrawing(p, { bottom: true, top: true }, f).filter((b) => b.kind === 'corner').length).toBeGreaterThanOrEqual(8);
  });

  it('puts no corner bars where a panel continues past the corner, in a one-way panel, nor under EC2', () => {
    const rows = [demand('A', 0, 5, 0, 6, [12, 9, 6, 6]), demand('B', 5, 10, 0, 6, [12, 9, 6, 6])].map((d) => cirsoc.slabRow(d, ctx, undefined, f));
    const p = slabPlan('N1', rows, { level: 'N1', beams: frame([0, 5, 10], [0, 6]), columns: [] }, plan, CIRSOC_SLAB_PLAN);
    expect(p.checks.filter((c) => c.kind === 'corner')).toHaveLength(2 * 4 * 2);
    expect(p.packages.filter((pk) => pk.kind === 'corner').every((pk) => pk.from < 4.5 || pk.to > 5.5)).toBe(true);
    const narrow = [demand('N', 0, 3, 0, 7, [2, 22, 0, 0])].map((d) => cirsoc.slabRow(d, ctx, undefined, f));
    expect(slabPlan('N1', narrow, { level: 'N1', beams: frame([0, 3], [0, 7]), columns: [] }, plan, CIRSOC_SLAB_PLAN).checks.some((c) => c.kind === 'corner')).toBe(false);
    const ec2 = rulesFor('en1992-1-1');
    const e = slabPlan('N1', [demand('A', 0, 5, 0, 6, [12, 9, 0, 0])].map((d) => ec2.slabRow(d, ctx, undefined, f)), { level: 'N1', beams: frame([0, 5], [0, 6]), columns: [] }, plan, ec2.slabPlan);
    expect(e.packages.some((pk) => pk.kind === 'corner')).toBe(false);
  });

  it('bends slab bars at ln/8 in a two-way panel and ln/7 in a one-way one, on a 9·db mandrel that the cut length reads', () => {
    const { rows, geom } = single();
    const p = slabPlan('N1', rows, geom, { ...plan, bent: true }, CIRSOC_SLAB_PLAN);
    const b = p.packages.find((pk) => pk.kind === 'bent' && pk.dir === 'x')!;
    expect(b.runs[1]!.from).toBeCloseTo(0.1 + 4.8 / 8, 9);
    expect(b.shape.mandrel).toBeCloseTo(9 * b.bars.dia / 1000, 12);
    expect(b.length).toBeCloseTo(developedLength(b.shape), 12);
    expect(b.length).toBeLessThan(developedLength({ ...b.shape, mandrel: 6 * b.bars.dia / 1000 }));
    const span = p.packages.find((pk) => pk.kind === 'span' && pk.dir === 'x')!;
    expect(span.shape.mandrel).toBeCloseTo(6 * span.bars.dia / 1000, 12);
    const narrow = [demand('N', 0, 3, 0, 7, [22, 2, 0, 0])].map((d) => cirsoc.slabRow(d, ctx, undefined, f));
    const q = slabPlan('N1', narrow, { level: 'N1', beams: frame([0, 3], [0, 7]), columns: [] }, { ...plan, bent: true }, CIRSOC_SLAB_PLAN);
    expect(q.packages.find((pk) => pk.kind === 'bent' && pk.dir === 'x')!.runs[1]!.from).toBeCloseTo(0.1 + 2.8 / 7, 9);
    const a = slabPlan('N1', single(aci).rows, geom, { ...plan, bent: true }, ACI_SLAB_PLAN);
    const ab = a.packages.find((pk) => pk.kind === 'bent' && pk.dir === 'x')!;
    expect(ab.runs[1]!.from).toBeCloseTo(0.1 + 0.2 * 4.8, 9);
    expect(ab.shape.mandrel).toBeCloseTo(6 * ab.bars.dia / 1000, 12);
  });

  it('carries two bottom bars each way continuous through the core of a column with no beam', () => {
    const rows = [demand('P', 0, 6, 0, 6, [12, 12, 0, 0], 0.2), demand('Q', 6, 12, 0, 6, [12, 12, 0, 0], 0.2)].map((d) => cirsoc.slabRow(d, ctx, undefined, f));
    const columns = [0, 6, 12].flatMap((x) => [0, 6].map((y) => ({ x, y, b: 0.4, h: 0.4 })));
    const p = slabPlan('N1', rows, { level: 'N1', beams: [], columns }, { ...plan, columnInset: 0.05 }, CIRSOC_SLAB_PLAN);
    expect(p.integrity).toHaveLength(12);
    expect(p.integrity.every((k) => k.bars >= 2 && k.required === 2)).toBe(true);
    const checks = p.checks.filter((c) => c.kind === 'integrity');
    expect(checks).toHaveLength(12);
    expect(checks.every((c) => c.ok)).toBe(true);
    const bars = p.packages.filter((pk) => pk.kind === 'integrity');
    expect(bars.length).toBeGreaterThan(0);
    for (const pk of bars) {
      expect(pk.count).toBe(2);
      expect(barPositions(pk)).toEqual([pk.band.from, pk.band.to]);
      expect(pk.band.to - pk.band.from).toBeCloseTo(0.3, 9);
    }
    const mid = bars.find((pk) => pk.dir === 'y' && Math.abs((pk.band.from + pk.band.to) / 2 - 6) < 1e-9 && pk.from > 1)!;
    expect(mid).toBeUndefined();
    expect(planDrawing(p, { bottom: true, top: true }, f).find((b) => b.kind === 'integrity')!.label).toMatch(/^2Ø\d+ L=/);
    const withBeams = slabPlan('N1', rows, { level: 'N1', beams: frame([0, 6, 12], [0, 6]), columns }, plan, CIRSOC_SLAB_PLAN);
    expect(withBeams.integrity).toHaveLength(0);
  });
});

describe('column rows per code', () => {
  const base: ColumnDemand = {
    key: 'column:1:0', name: 'C1', b: 0.3, h: 0.3, length: 3, lu: 2.7, psiTop: 1.5, psiBot: 0.2,
    cases: [{ combo: 'U', pu: 900, mxTop: 40, mxBot: -20, myTop: 10, myBot: -5, vx: 20, vy: 10 }],
  };
  const cctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [12, 16, 20, 25, 32] };

  it('CIRSOC proposes the ties of Table 25.7.2.2 and ACI 318-19 No. 10 ties', () => {
    expect([12, 16, 20, 25, 32, 40].map(tieDiaFor)).toEqual([6, 6, 8, 8, 10, 12]);
    const c = cirsoc.columnRow(base, cctx, undefined, f);
    const a = aci.columnRow(base, cctx, undefined, f);
    const longest = (r: typeof c) => Math.max(r.adopted.corner, r.adopted.dx, r.adopted.dy);
    expect(c.adopted.tieDia).toBeGreaterThanOrEqual(tieDiaFor(longest(c)));
    expect(a.adopted.tieDia).toBeGreaterThanOrEqual(10);
    expect(ok(aci.columnRow(base, cctx, { ...a.adopted, tieDia: 8 }, f), 'rcSheets.v.tieDia')).toBe(false);
    expect(ok(cirsoc.columnRow(base, cctx, { ...a.adopted, corner: 16, dx: 16, dy: 16, tieDia: 6 }, f), 'rcSheets.v.tieDia')).toBe(true);
  });

  it('CIRSOC fails a column under 200 mm or with bars under Ø12 (§10.3.1); ACI 318-19 has no such check', () => {
    const thin = { ...base, b: 0.18, cases: [{ combo: 'U', pu: 200, mxTop: 5, mxBot: -2, myTop: 1, myBot: 0 }] };
    const r = cirsoc.columnRow(thin, cctx, undefined, f);
    expect(ok(r, 'rcSheets.v.colMinSide')).toBe(false);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.colMinSide')!.clause).toBe('§10.3.1');
    expect(r.status).toBe('fail');
    expect(aci.columnRow(thin, cctx, undefined, f).verifications.some((v) => v.label === 'rcSheets.v.colMinSide')).toBe(false);
    const fine = cirsoc.columnRow(base, cctx, undefined, f);
    expect(ok(fine, 'rcSheets.v.colMinSide')).toBe(true);
    expect(ok(cirsoc.columnRow(base, cctx, { ...fine.adopted, corner: 10, dx: 10, dy: 10, nx: 4, ny: 4 }, f), 'rcSheets.v.colMinBar')).toBe(false);
  });
});

describe('punching sheet: integrity bars (§8.7.4.2.2)', () => {
  const pts = (x: number, y: number) => ({ x, y, z: 3 });
  const adjoining = [
    { elementId: 1, nodeIds: [1, 2, 5, 4], points: [pts(0, 0), pts(3, 0), pts(3, 3), pts(0, 3)] },
    { elementId: 2, nodeIds: [2, 3, 6, 5], points: [pts(3, 0), pts(6, 0), pts(6, 3), pts(3, 3)] },
    { elementId: 3, nodeIds: [5, 6, 9, 8], points: [pts(3, 3), pts(6, 3), pts(6, 6), pts(3, 6)] },
    { elementId: 4, nodeIds: [4, 5, 8, 7], points: [pts(0, 3), pts(3, 3), pts(3, 6), pts(0, 6)] },
  ];
  const d: PunchingDemand = {
    key: 'punching:1:0', name: 'C5', level: 'N1', thickness: 0.22, adjoining,
    joint: { nodeId: 5, at: { x: 3, y: 3 }, columnElementId: 101, b: 0.4, h: 0.4, elementBelow: 101, elementAbove: 102, forces: [{ combinationId: 1, combinationName: 'U', axialBelow: 600, axialAbove: 400, directlyDelivered: 0, unbalancedMomentX: 0, unbalancedMomentY: 0 }] },
  };
  const pctx = { fc: 25, fy: 420, cover: 0.025, topBarDia: 12 };

  it('proposes two bottom bars each way and draws them; checks them against what the slab plan carries', () => {
    expect(slabJointPosition(5, adjoining).position).toBe('interior');
    const r = punchingRow(d, pctx, f);
    expect(r.figure?.integrity).toEqual({ bars: 2, dia: 12 });
    expect(r.steps[0]!.steps.some((s) => s.label === 'rcSheets.s.punchIntegrity')).toBe(true);
    expect(r.verifications.some((v) => v.label === 'rcSheets.v.punchingIntegrity')).toBe(false);
    const held = punchingRow(d, { ...pctx, integrity: { x: 3, y: 2, required: 2, dia: 10 } }, f);
    expect(ok(held, 'rcSheets.v.punchingIntegrity')).toBe(true);
    expect(held.figure?.integrity).toEqual({ bars: 2, dia: 10 });
    const short = punchingRow(d, { ...pctx, integrity: { x: 3, y: 1, required: 2, dia: 10 } }, f);
    expect(ok(short, 'rcSheets.v.punchingIntegrity')).toBe(false);
    expect(short.verifications.find((v) => v.label === 'rcSheets.v.punchingIntegrity')!.clause).toBe('§8.7.4.2.2');
  });
});

describe('main bars\' cover (Table 20.5.1.3.1)', () => {
  const cctx = { mat: { fc: 30, fy: 420 }, cover: 0.025, tieDia: 8, diameters: [12, 16, 20, 25] };
  const col: ColumnDemand = {
    key: 'column:1:0', name: 'C1', b: 0.3, h: 0.3, length: 3, lu: 2.7, psiTop: 1.5, psiBot: 0.2,
    cases: [{ combo: 'U', pu: 900, mxTop: 40, mxBot: -20, myTop: 10, myBot: -5, vx: 20, vy: 10 }],
  };
  const line = (r: { verifications: Array<{ label: string; ok: boolean; demand?: string; capacity?: string; clause?: string }> }) => r.verifications.find((v) => v.label === 'rcSheets.v.mainCover');

  it('checks cover + Øst ≥ max(35; db + 5) under control and max(40; db + 10) without, only when asked', () => {
    const a = { corner: 16, nx: 1, dx: 16, ny: 1, dy: 16, tieDia: 8, tieSpacing: 0.15 };
    expect(line(cirsoc.columnRow(col, cctx, a, f))).toBeUndefined();
    const under = line(cirsoc.columnRow(col, { ...cctx, coverTable: { control: true } }, a, f))!;
    expect(under.ok).toBe(false);
    expect(under.demand).toBe('33 mm');
    expect(under.capacity).toBe('≥ max(35; db + 5) = 35 mm');
    expect(under.clause).toBe('Tabla 20.5.1.3.1');
    expect(line(cirsoc.columnRow(col, { ...cctx, cover: 0.03, coverTable: { control: true } }, a, f))!.ok).toBe(true);
    expect(line(cirsoc.columnRow(col, { ...cctx, cover: 0.03, coverTable: { control: false } }, a, f))!.ok).toBe(false);
    expect(line(cirsoc.columnRow(col, { ...cctx, cover: 0.03, coverTable: { control: true } }, { ...a, corner: 32, dx: 32, dy: 32 }, f))!.capacity).toBe('≥ max(35; db + 5) = 37 mm');
  });

  it('a beam row reads its largest bar at any section', () => {
    const env = (x: number, pos: number, neg: number) => ({ x, pos: { value: pos }, neg: { value: neg }, nPos: 0, nNeg: 0 });
    const d = { key: 'beam:1:0', name: 'V1', length: 5, b: 0.25, h: 0.5, start: env(0, 0, 60), span: env(2.5, 50, 0), end: env(5, 0, 60), negAny: { value: 0 }, nNegAny: 0, vu: { value: 60 }, nAtV: 0, tu: { value: 0 }, combos: [] };
    const bctx = { mat: { fc: 25, fy: 420 }, cover: 0.03, stirrupDia: 8, diameters: [12, 16, 20, 25], torsion: 'equilibrium' as const, coverTable: { control: true } };
    const r = cirsoc.beamRow(d, bctx, undefined, f);
    const thin = { ...r.adopted.stirrups, dia: 6 };
    expect(line(cirsoc.beamRow(d, bctx, { ...r.adopted, stirrups: thin, top: [{ count: 2, dia: 25 }] }, f))!.ok).toBe(true);
    const big = cirsoc.beamRow(d, bctx, { ...r.adopted, stirrups: thin, at: { start: { top: [{ count: 2, dia: 32 }], bottom: r.adopted.bottom } } }, f);
    expect(line(big)!.ok).toBe(false);
    expect(line(big)!.demand).toBe('36 mm');
  });
});
