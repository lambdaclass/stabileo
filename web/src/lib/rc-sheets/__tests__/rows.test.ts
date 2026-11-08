import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand } from '../beam-row';
import { columnRow, columnArea, type ColumnDemand } from '../column-row';
import { slabRow } from '../slab-row';
import { makeFmt } from '../format';

const f = makeFmt('.');
const beamCtx = { mat: { fc: 30, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const v0001: BeamDemand = {
  key: 'beam:1:0', name: 'V0001', length: 9.8, b: 0.3, h: 0.8,
  mPos: { value: 216.265 }, mNegStart: { value: 309.248 }, mNegEnd: { value: 100 },
  nAtPos: 21.752, nAtNegStart: 21.752, nAtNegEnd: 0, vu: { value: 162.874 }, nAtV: 21.752, tu: { value: 50.707 },
};

describe('beam row', () => {
  it('reduces the moment to the tension steel and floors it at 1.4/fy·bw·d', () => {
    const r = beamRow(v0001, beamCtx, undefined, f);
    const mus = r.steps[1]!.steps.find((s) => s.label === 'rcSheets.s.mus')!;
    expect(Number(mus.value!.split(' ')[0])).toBeCloseTo(216.265 + 21.752 * (0.759 - 0.4), 1);
    expect(r.req.bottom).toBeCloseTo((1.4 / 420) * 30 * 75.9, 1);
    expect(r.req.top).toBeGreaterThan(r.req.bottom);
  });

  it('takes the torsion threshold with √f\'c in MPa, so 50.7 kN·m on a 30×80 needs torsion steel', () => {
    const r = beamRow(v0001, beamCtx, undefined, f);
    const th = r.steps[4]!.steps[0]!;
    const expected = 0.75 * 0.33 / 4 * Math.sqrt(30) * 1000 * (0.24 ** 2) / 2.2;
    expect(Number(th.value!.split(' ')[0])).toBeCloseTo(expected, 1);
    expect(expected).toBeLessThan(10);
    expect(r.req.torsionNeglected).toBe(false);
    expect(r.req.al).toBeGreaterThan(0);
  });

  it('reduces compatibility torsion to φ·Tcr', () => {
    const r = beamRow(v0001, { ...beamCtx, torsion: 'compatibility' }, undefined, f);
    expect(r.req.tuDesign).toBeCloseTo(0.75 * 0.33 * Math.sqrt(30) * 1000 * (0.24 ** 2) / 2.2, 1);
    expect(r.req.tuDesign).toBeLessThan(50.707);
  });

  it('proposes bars that verify, and fails the bars a person adopts short', () => {
    const ok = beamRow(v0001, beamCtx, undefined, f);
    expect(ok.status).not.toBe('fail');
    expect(ok.checks.sag.phiMn).toBeGreaterThanOrEqual(216.265);
    const short = beamRow(v0001, beamCtx, { ...ok.proposed, top: [{ count: 2, dia: 16 }] }, f);
    expect(short.checks.hogStart.ok).toBe(false);
    expect(short.status).toBe('fail');
    expect(short.isAdopted).toBe(true);
  });

  it('fails bars under the minimum steel even where they carry the moment', () => {
    const light: BeamDemand = { ...v0001, mPos: { value: 40 }, mNegStart: { value: 30 }, mNegEnd: { value: 30 }, tu: { value: 1 } };
    const ok = beamRow(light, beamCtx, undefined, f);
    const under = beamRow(light, beamCtx, { ...ok.proposed, bottom: [{ count: 1, dia: 16 }] }, f);
    expect(under.checks.sag.phiMn).toBeGreaterThan(40);
    expect(under.checks.areaBottom).toBe(false);
    expect(under.status).toBe('fail');
  });

  it('refuses bars that do not fit across the web', () => {
    const ok = beamRow(v0001, beamCtx, undefined, f);
    const crammed = beamRow(v0001, beamCtx, { ...ok.proposed, bottom: [{ count: 8, dia: 25 }] }, f);
    expect(crammed.checks.fitBottom).toBe(false);
    expect(crammed.status).toBe('fail');
  });
});

describe('column row', () => {
  const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [12, 16, 20, 25, 32] };
  const base: ColumnDemand = {
    key: 'column:1:0', name: 'C1', b: 0.3, h: 0.3, length: 3, lu: 2.7, psiTop: 1.5, psiBot: 0.2,
    cases: [{ combo: 'U', pu: 1400, mxTop: 80, mxBot: -40, myTop: 25, myBot: -10 }],
  };

  it('finds the steel ratio on the interaction surface instead of a chart, between 1 % and 8 %', () => {
    const r = columnRow(base, ctx, undefined, f);
    expect(r.req.rho).toBeGreaterThan(0.01);
    expect(r.req.rho).toBeLessThan(0.08);
    expect(r.checks.ratio).toBeLessThanOrEqual(1);
    expect(columnArea(r.proposed)).toBeGreaterThanOrEqual(r.req.ast - 1e-6);
  });

  it('floors a lightly loaded column at 1 %', () => {
    const r = columnRow({ ...base, cases: [{ combo: 'U', pu: 100, mxTop: 2, mxBot: -1, myTop: 0, myBot: 0 }] }, ctx, undefined, f);
    expect(r.req.rho).toBeCloseTo(0.01, 6);
  });

  it('fails an adopted layout under the demand', () => {
    const r = columnRow(base, ctx, undefined, f);
    const thin = columnRow(base, ctx, { corner: 12, nx: 0, dx: 12, ny: 0, dy: 12, tieDia: 6, tieSpacing: 0.15 }, f);
    expect(thin.checks.ratio).toBeGreaterThan(1);
    expect(thin.status).toBe('fail');
    expect(r.status).not.toBe('fail');
  });

  it('magnifies the moment of a slender column, in single curvature more than in double', () => {
    const slender = { ...base, lu: 6, length: 6.3, psiTop: 5, psiBot: 5 };
    const single = columnRow({ ...slender, cases: [{ combo: 'U', pu: 600, mxTop: 40, mxBot: 40, myTop: 0, myBot: 0 }] }, ctx, undefined, f);
    const double = columnRow({ ...slender, cases: [{ combo: 'U', pu: 600, mxTop: 40, mxBot: -40, myTop: 0, myBot: 0 }] }, ctx, undefined, f);
    expect(single.req.ast).toBeGreaterThan(double.req.ast);
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
});
