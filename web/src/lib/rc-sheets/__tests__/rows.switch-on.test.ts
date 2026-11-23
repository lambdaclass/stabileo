import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type SectionEnv } from '../beam-row';
import { beamLine } from '../beam-line';
import { columnRow, columnArea, columnSplice, type ColumnDemand } from '../column-row';
import { slabRow } from '../slab-row';
import { wallRow, type WallDemand } from '../wall-row';
import { makeFmt } from '../format';

const f = makeFmt('.');
const env = (x: number, pos: number, neg: number, n = 0, combo = 'U'): SectionEnv => ({ x, pos: { value: pos, source: { combo, x } }, neg: { value: neg, source: { combo, x } }, nPos: n, nNeg: n });
const beamCtx = { mat: { fc: 30, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const v0001: BeamDemand = {
  key: 'beam:1:0', name: 'V0001', length: 9.8, b: 0.3, h: 0.8,
  start: env(0, 0, 309.248, 21.752), span: env(4.9, 216.265, 0, 21.752), end: env(9.8, 0, 100),
  negAny: { value: 0 }, nNegAny: 0, vu: { value: 162.874 }, nAtV: 21.752, tu: { value: 50.707 }, combos: [],
};
const ok = (r: { verifications: Array<{ label: string; ok: boolean }> }, label: string) => r.verifications.find((v) => v.label === label)?.ok;

describe('beam row', () => {
  it('reduces the moment to the tension steel and floors it at 1.4/fy·bw·d', () => {
    const r = beamRow(v0001, beamCtx, undefined, f);
    const mus = r.steps[1]!.steps.find((s) => s.label === 'rcSheets.s.mus')!;
    expect(Number(mus.value!.split(' ')[0])).toBeCloseTo(216.265 + 21.752 * (0.759 - 0.4), 1);
    expect(r.req.bottom).toBeCloseTo((1.4 / 420) * 30 * 75.9, 1);
    expect(r.req.top).toBeGreaterThan(r.req.bottom);
    expect(r.req.topAt).toBe('start');
  });

  it('takes the torsion threshold with √f\'c in MPa, so 50.7 kN·m on a 30×80 needs torsion steel', () => {
    const r = beamRow(v0001, beamCtx, undefined, f);
    const th = r.steps.find((g) => g.title === 'rcSheets.g.torsion')!.steps[0]!;
    const expected = 0.75 * 0.33 / 4 * Math.sqrt(30) * 1000 * (0.24 ** 2) / 2.2;
    expect(Number(th.value!.split(' ')[0])).toBeCloseTo(expected, 1);
    expect(expected).toBeLessThan(10);
    expect(r.req.torsionNeglected).toBe(false);
    expect(r.req.al).toBeGreaterThan(0);
  });

  it('reduces compatibility torsion to φ·Tcr', () => {
    const r = beamRow(v0001, { ...beamCtx, torsion: 'compatibility' }, undefined, f);
    expect(r.req.tuDesign).toBeCloseTo(0.75 * 0.33 * Math.sqrt(30) * 1000 * (0.24 ** 2) / 2.2, 1);
  });

  it('designs the bottom steel for a sagging moment at a support, not only at midspan', () => {
    const lateral: BeamDemand = { ...v0001, start: env(0, 280, 309.248, 0, 'W'), tu: { value: 1 } };
    const r = beamRow(lateral, beamCtx, undefined, f);
    expect(r.req.bottomAt).toBe('start');
    expect(r.flexure.find((x) => x.section === 'start' && x.sign === 'pos')!.phiMn).toBeGreaterThanOrEqual(280);
    expect(r.verifications.map((v) => v.label)).toEqual(expect.arrayContaining(['rcSheets.v.flexPos.start', 'rcSheets.v.flexNeg.start', 'rcSheets.v.flexPos.span']));
  });

  it('proposes bars that verify every check, and fails bars a person adopts short', () => {
    const good = beamRow(v0001, beamCtx, undefined, f);
    expect(good.status).not.toBe('fail');
    expect(good.verifications.every((v) => v.ok)).toBe(true);
    const short = beamRow(v0001, beamCtx, { ...good.proposed, top: [{ count: 2, dia: 16 }] }, f);
    expect(ok(short, 'rcSheets.v.flexNeg.start')).toBe(false);
    expect(short.status).toBe('fail');
  });

  it('fails bars under the minimum steel even where they carry the moment', () => {
    const light: BeamDemand = { ...v0001, start: env(0, 0, 30), span: env(4.9, 40, 0), end: env(9.8, 0, 30), tu: { value: 1 } };
    const good = beamRow(light, beamCtx, undefined, f);
    const under = beamRow(light, beamCtx, { ...good.proposed, bottom: [{ count: 1, dia: 16 }] }, f);
    expect(under.flexure.find((x) => x.section === 'span' && x.sign === 'pos')!.phiMn).toBeGreaterThan(40);
    expect(ok(under, 'rcSheets.v.minBottom')).toBe(false);
    expect(under.status).toBe('fail');
  });

  it('iterates the proposal until it verifies: a wide beam gets finer bars for crack control', () => {
    const wide: BeamDemand = { ...v0001, b: 0.8, h: 0.5, start: env(0, 0, 150), span: env(4.9, 180, 0), end: env(9.8, 0, 150), tu: { value: 1 } };
    const r = beamRow(wide, beamCtx, undefined, f);
    expect(ok(r, 'rcSheets.v.crack')).toBe(true);
    expect(r.status).not.toBe('fail');
    const coarse = beamRow(wide, beamCtx, { ...r.proposed, bottom: [{ count: 2, dia: 25 }, { count: 2, dia: 25 }] }, f);
    expect(ok(coarse, 'rcSheets.v.crack')).toBe(false);
  });

  it('checks the longitudinal torsion bars for spacing and diameter', () => {
    const r = beamRow(v0001, beamCtx, undefined, f);
    expect(ok(r, 'rcSheets.v.alSpacing')).toBe(true);
    const few = beamRow(v0001, beamCtx, { ...r.proposed, torsionLong: { count: 4, dia: 20 } }, f);
    expect(ok(few, 'rcSheets.v.alSpacing')).toBe(false);
  });

  it('asks skin reinforcement past 90 cm of depth', () => {
    const deep = beamRow({ ...v0001, h: 1.0 }, beamCtx, undefined, f);
    expect(deep.req.skin).not.toBeNull();
    expect(beamRow(v0001, beamCtx, undefined, f).req.skin).toBeNull();
  });

  it('caps the stirrup spacing at d/2 and 40 cm (Table 9.7.6.2.2)', () => {
    const deep: BeamDemand = { ...v0001, h: 1.2, vu: { value: 60 }, tu: { value: 0.5 } };
    const r = beamRow(deep, beamCtx, undefined, f);
    expect(r.req.sMax).toBeCloseTo(0.4, 6);
    expect(r.adopted.stirrups.spacing).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it('breaks the adopted bars down by combination', () => {
    const combos = [
      { combo: 'A', mStart: -309, mSpan: 216, mEnd: -100, mPos: 216, mNeg: 309, nStart: 0, nSpan: 0, nEnd: 0, v: 160, nV: 0, t: 50 },
      { combo: 'B', mStart: -10, mSpan: 20, mEnd: -10, mPos: 20, mNeg: 10, nStart: 0, nSpan: 0, nEnd: 0, v: 20, nV: 0, t: 1 },
    ];
    const r = beamRow({ ...v0001, combos }, beamCtx, undefined, f);
    expect(r.combos.rows).toHaveLength(2);
    expect(r.combos.rows[0]!.ratio).toBeGreaterThan(r.combos.rows[1]!.ratio);
    expect(r.combos.rows.every((x) => x.ok)).toBe(true);
  });
});

describe('beam line', () => {
  const L = 6;
  const stations = Array.from({ length: 33 }, (_, i) => { const x = (i / 32) * L; return { x, pos: 260 * (1 - (2 * x / L - 1) ** 2), neg: 0, v: 420 * Math.abs(1 - 2 * x / L) + 260 }; });
  const d: BeamDemand = { ...v0001, length: L, h: 0.6, start: env(0, 0, 0), span: env(3, 260, 0), end: env(L, 0, 0), vu: { value: 680 }, tu: { value: 0 }, env: stations, line: { group: 1, index: 0, spans: 1, startNode: 1, endNode: 2, lineName: 'V' } };
  const row = beamRow(d, beamCtx, undefined, f);
  const adopted = { bottom: { count: 3, dia: 20 }, top: { count: 2, dia: 12 }, supportTop: [{ count: 0, dia: 12 }, { count: 0, dia: 12 }], spanBottom: [{ count: 3, dia: 20 }] };

  it('runs a span bar on to the supports where §9.7.3.5 allows no cut-off', () => {
    const open = beamLine([row], beamCtx, { ...adopted, stirrups: [{ dia: 8, legs: 2, spacing: 0.3 }] }, f);
    const bar = open.bars.find((b) => b.kind === 'span')!;
    expect([bar.from, bar.to]).toEqual([0, L]);
    expect(open.cutoffs.filter((x) => x.mark === bar.mark)).toEqual([]);
  });

  it('cuts it where the stirrups give (c)', () => {
    const dense = beamLine([row], beamCtx, { ...adopted, stirrups: [{ dia: 10, legs: 2, spacing: 0.06 }] }, f);
    const bar = dense.bars.find((b) => b.kind === 'span')!;
    expect(bar.from).toBeGreaterThan(0);
    expect(bar.to).toBeLessThan(L);
    expect(dense.cutoffs.filter((x) => x.mark === bar.mark).map((x) => x.legality)).toEqual(['extraStirrups', 'extraStirrups']);
  });
});

describe('seismic provisions', () => {
  it('a beam proposal meets chapter 18: capacity shear, hoops in 2h, the half and quarter rules', () => {
    const combos = [{ combo: 'U2', mStart: -309, mSpan: 216, mEnd: -100, mPos: 216, mNeg: 309, nStart: 0, nSpan: 0, nEnd: 0, v: 160, nV: 0, t: 5 }];
    const r = beamRow({ ...v0001, combos, tu: { value: 5 } }, { ...beamCtx, seismic: { overstrength: 1.25 } }, undefined, f);
    const labels = r.verifications.map((v) => v.label);
    expect(labels).toEqual(expect.arrayContaining(['rcSheets.v.seisBeamVe', 'rcSheets.v.seisBeamHoops', 'rcSheets.v.seisBeamHalf', 'rcSheets.v.seisBeamQuarter']));
    expect(r.verifications.filter((v) => v.label.startsWith('rcSheets.v.seis')).every((v) => v.ok)).toBe(true);
    expect(r.adopted.stirrups.spacing).toBeLessThanOrEqual(Math.min(0.759 / 4, 0.15) + 1e-9);
  });

  it('takes the gravity shear from the combinations without an earthquake case, whatever their names', () => {
    const base = { mStart: -309, mSpan: 216, mEnd: -100, mPos: 216, mNeg: 309, nStart: 0, nSpan: 0, nEnd: 0, nV: 0, t: 5 };
    const combos = [{ ...base, combo: 'ELU 1', v: 100 }, { ...base, combo: 'U2', seismic: true, v: 160 }];
    const r = beamRow({ ...v0001, combos, tu: { value: 5 } }, { ...beamCtx, seismic: { overstrength: 1.25 } }, undefined, f);
    const ve = r.steps.find((g) => g.title === 'rcSheets.g.seismic')!.steps.find((s) => s.label === 'rcSheets.s.seisVe')!;
    expect(ve.value).toContain(`+ ${f(100)} =`);
  });

  it('a column proposal meets chapter 18: confinement spacing and Ash', () => {
    const col: ColumnDemand = { key: 'column:1:0', name: 'C1', b: 0.4, h: 0.4, length: 3, lu: 2.7, psiTop: 1.5, psiBot: 0.2, cases: [{ combo: 'U', pu: 1400, mxTop: 80, mxBot: -40, myTop: 25, myBot: -10, vx: 40, vy: 12 }] };
    const r = columnRow(col, { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [12, 16, 20, 25], seismic: { overstrength: 1.25 } }, undefined, f);
    for (const l of ['rcSheets.v.seisColSo', 'rcSheets.v.seisColAsh', 'rcSheets.v.seisColDim', 'rcSheets.v.seisColRho']) expect(ok(r, l)).toBe(true);
    expect(r.confinement!.lo).toBeCloseTo(0.45, 9);
    expect(r.confinement!.so).toBeGreaterThanOrEqual(r.adopted.tieSpacing - 1e-9);
  });

  it('a column on a storey below laps its bars as a tension splice under chapter 18 (§18.7.4.3), in compression without it', () => {
    const col: ColumnDemand = { key: 'column:1:1', name: 'C1', b: 0.4, h: 0.4, length: 3, lu: 2.7, psiTop: 1.5, psiBot: 1.5, cases: [{ combo: 'U', pu: 1400, mxTop: 80, mxBot: -40, myTop: 25, myBot: -10, vx: 40, vy: 12 }] };
    const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [12, 16, 20, 25] };
    const seis = columnRow(col, { ...ctx, seismic: { overstrength: 1.25 } }, undefined, f, { fromBelow: true });
    const plain = columnRow(col, ctx, undefined, f, { fromBelow: true });
    expect(seis.lap!.tension).toBe(true);
    expect(plain.lap!.tension).toBe(false);
    expect(seis.verifications.some((v) => v.label === 'rcSheets.v.colSpliceT')).toBe(true);
    expect(columnRow(col, ctx, undefined, f).lap).toBeUndefined();
  });
});

describe('column row', () => {
  const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [12, 16, 20, 25, 32] };
  const base: ColumnDemand = {
    key: 'column:1:0', name: 'C1', b: 0.3, h: 0.3, length: 3, lu: 2.7, psiTop: 1.5, psiBot: 0.2,
    cases: [{ combo: 'U', pu: 1400, mxTop: 80, mxBot: -40, myTop: 25, myBot: -10, vx: 40, vy: 12 }],
  };

  it('finds the steel ratio on the interaction surface instead of a chart, between 1 % and 8 %', () => {
    const r = columnRow(base, ctx, undefined, f);
    expect(r.req.rho).toBeGreaterThan(0.01);
    expect(r.req.rho).toBeLessThan(0.08);
    expect(r.checks.ratio).toBeLessThanOrEqual(1);
    expect(columnArea(r.proposed)).toBeGreaterThanOrEqual(r.req.ast - 1e-6);
    expect(r.status).not.toBe('fail');
  });

  it('floors a lightly loaded column at 1 %', () => {
    const r = columnRow({ ...base, cases: [{ combo: 'U', pu: 100, mxTop: 2, mxBot: -1, myTop: 0, myBot: 0 }] }, ctx, undefined, f);
    expect(r.req.rho).toBeCloseTo(0.01, 6);
  });

  it('fails an adopted layout under the demand', () => {
    const thin = columnRow(base, ctx, { corner: 12, nx: 0, dx: 12, ny: 0, dy: 12, tieDia: 6, tieSpacing: 0.15 }, f);
    expect(thin.checks.ratio).toBeGreaterThan(1);
    expect(thin.status).toBe('fail');
  });

  it('magnifies the moment of a slender column, in single curvature more than in double', () => {
    const slender = { ...base, lu: 6, length: 6.3, psiTop: 5, psiBot: 5 };
    const single = columnRow({ ...slender, cases: [{ combo: 'U', pu: 600, mxTop: 40, mxBot: 40, myTop: 0, myBot: 0 }] }, ctx, undefined, f);
    const double = columnRow({ ...slender, cases: [{ combo: 'U', pu: 600, mxTop: 40, mxBot: -40, myTop: 0, myBot: 0 }] }, ctx, undefined, f);
    expect(single.req.ast).toBeGreaterThan(double.req.ast);
  });

  it('checks shear, and tightens the ties of the proposal for it', () => {
    const sheared = { ...base, cases: [{ ...base.cases[0]!, vx: 260 }] };
    const r = columnRow(sheared, ctx, undefined, f);
    expect(r.checks.shearX).toBeLessThanOrEqual(1);
    const open = columnRow(sheared, ctx, { ...r.proposed, tieDia: 6, tieSpacing: 0.25 }, f);
    expect(open.checks.shearX).toBeGreaterThan(1);
    expect(open.status).toBe('fail');
  });

  it('keeps the bar pattern of the storey below and only steps the diameter down', () => {
    const below = columnRow(base, ctx, undefined, f);
    const light = { ...base, cases: [{ combo: 'U', pu: 500, mxTop: 20, mxBot: -10, myTop: 5, myBot: -2, vx: 10, vy: 5 }] };
    const above = columnRow(light, ctx, undefined, f, { pattern: { nx: below.adopted.nx, ny: below.adopted.ny, maxDia: below.adopted.corner }, fromBelow: true });
    expect([above.adopted.nx, above.adopted.ny]).toEqual([below.adopted.nx, below.adopted.ny]);
    expect(above.adopted.corner).toBeLessThanOrEqual(below.adopted.corner);
    expect(above.verifications.some((v) => v.label === 'rcSheets.v.colSpliceC' || v.label === 'rcSheets.v.colSpliceT')).toBe(true);
  });

  it('laps column bars 0.071·fy·db in compression, and as a class B tension splice otherwise', () => {
    expect(columnSplice(ctx, 16, false).length).toBeCloseTo(0.071 * 420 * 16 / 1000, 6);
    expect(columnSplice(ctx, 16, true).length).toBeGreaterThan(columnSplice(ctx, 16, false).length);
  });

  it('braces every bar more than min(15·dbe; 150 mm) clear from a braced one', () => {
    const wide = { ...base, b: 0.5, h: 0.5 };
    const layout = { corner: 16, nx: 2, dx: 16, ny: 2, dy: 16, tieSpacing: 0.15 };
    expect(columnRow(wide, ctx, { ...layout, tieDia: 6 }, f).checks.crossties.x).toBe(2);
    expect(columnRow(wide, ctx, { ...layout, tieDia: 10 }, f).checks.crossties.x).toBe(0);
  });

  it('refuses the approximate method past k·lu/r = 100', () => {
    const r = columnRow({ ...base, lu: 12, length: 12.3, psiTop: 10, psiBot: 10 }, ctx, undefined, f);
    expect(ok(r, 'rcSheets.v.slenderMax')).toBe(false);
  });
});

describe('slab row', () => {
  const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.025, diameters: [6, 8, 10, 12, 16] };
  const m = (bx: number, by: number, tx: number, ty: number) => ({ bottomX: { value: bx }, bottomY: { value: by }, topX: { value: tx }, topY: { value: ty } });

  it('designs the support (top) steel for its moment, not for the minimum', () => {
    const r = slabRow({ key: 'slab:1', name: 'L1', lx: 8.45, ly: 5.38, h: 0.15, m: m(5.4, 12.2, 6.9, 34.1) }, ctx, undefined, f);
    expect(r.faces.bottomX.asMin).toBeCloseTo(0.0018 * 100 * 15, 2);
    expect(r.faces.topY.asReq).toBeGreaterThan(2 * r.faces.topY.asMin);
    expect(r.faces.topY.phiMn).toBeGreaterThanOrEqual(34.1);
    expect(r.status).not.toBe('fail');
  });

  it('asks no top steel where no face moment needs it', () => {
    const r = slabRow({ key: 'slab:1', name: 'L1', lx: 4, ly: 4, h: 0.12, m: m(6, 6, 0, 0) }, ctx, undefined, f);
    expect(r.faces.topX.asReq).toBe(0);
    expect(r.proposed.topX.dia).toBe(0);
  });

  it('checks spacing against the two-way limit and fails a mesh too open', () => {
    const r = slabRow({ key: 'slab:1', name: 'L1', lx: 4, ly: 4, h: 0.12, m: m(6, 6, 0, 0) }, ctx, undefined, f);
    const open = slabRow({ key: 'slab:1', name: 'L1', lx: 4, ly: 4, h: 0.12, m: m(6, 6, 0, 0) }, ctx, { ...r.proposed, bottomX: { dia: 12, spacing: 0.35 } }, f);
    expect(r.oneWay).toBe(false);
    expect(open.faces.bottomX.ok).toBe(false);
  });

  it('checks one-way shear per metre against φ·Vc', () => {
    const q = (v: number) => ({ x: { value: v }, y: { value: 10 } });
    const r = slabRow({ key: 'slab:1', name: 'L1', lx: 4, ly: 4, h: 0.12, m: m(6, 6, 0, 0), q: q(30) }, ctx, undefined, f);
    expect(ok(r, 'rcSheets.v.slabShearX')).toBe(true);
    const high = slabRow({ key: 'slab:1', name: 'L1', lx: 4, ly: 4, h: 0.12, m: m(6, 6, 0, 0), q: q(200) }, ctx, undefined, f);
    expect(ok(high, 'rcSheets.v.slabShearX')).toBe(false);
  });
});

describe('wall row', () => {
  const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.025, barDia: 12, diameters: [10, 12, 16, 20, 25] };
  const wall: WallDemand = { key: 'wall:1:0', name: 'M1', length: 4, height: 3, thickness: 0.2, combos: [{ combo: 'U', pu: 1200, mu: 5000, vu: 450, muV: 4, muH: 2 }] };

  it('proposes web steel at the minimum ratios and boundary bars for the in-plane moment, and it verifies', () => {
    const r = wallRow(wall, ctx, undefined, f);
    expect(r.status).not.toBe('fail');
    expect(r.adopted.boundary?.count ?? 0).toBeGreaterThan(0);
    expect(ok(r, 'rcSheets.v.wallShear')).toBe(true);
    expect(ok(r, 'rcSheets.v.wallRhoL')).toBe(true);
    expect(r.adopted.curtains).toBe(1);
  });

  it('fails a wall without boundary bars under that moment', () => {
    const r = wallRow(wall, ctx, undefined, f);
    const bare = wallRow(wall, ctx, { ...r.proposed, boundary: { count: 0, diameter: 16 } }, f);
    expect(ok(bare, 'rcSheets.v.wallPM')).toBe(false);
  });

  it('asks two curtains past 25 cm and horizontal steel for a large in-plane shear', () => {
    const thick = wallRow({ ...wall, thickness: 0.3, combos: [{ ...wall.combos[0]!, vu: 2500 }] }, ctx, undefined, f);
    expect(thick.adopted.curtains).toBe(2);
    expect(thick.req.rhoT).toBeGreaterThan(0.0025);
    expect(ok(thick, 'rcSheets.v.wallShear')).toBe(true);
  });
});
