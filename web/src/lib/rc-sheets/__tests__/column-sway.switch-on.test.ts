import { describe, it, expect } from 'vitest';
import { aciDeltaS, swayFactor, swayMagnified } from '../column-sway';
import { columnRow, columnRowFor, ACI_COLUMN, type ColumnCase, type ColumnDemand, type ColumnRow } from '../column-row';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import type { ColumnAdopted } from '../types';

const fmt = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [16, 20, 25] };
const bars: ColumnAdopted = { corner: 20, nx: 1, dx: 20, ny: 1, dy: 20, tieDia: 8, tieSpacing: 0.15 };
const wind: ColumnCase = { combo: 'W', pu: 900, puD: 500, mxTop: 60, mxBot: -70, myTop: 5, myBot: -5, vx: 40, vy: 4, sway: { mxTop: 50, mxBot: -60, myTop: 0, myBot: 0 } };
const column = (o: Partial<ColumnDemand> = {}): ColumnDemand => ({
  key: 'column:1:0', name: 'C1', b: 0.35, h: 0.35, length: 4.2, lu: 3.8, psiTop: 2, psiBot: 2, cases: [wind], ...o,
});
const swaying = (Q: number, sumPu = 3000, sumPc = 30000, secondOrder = false): ColumnDemand['sway'] => ({ Q, combo: 'W', byCombo: { W: { Q, sumPu, sumPc } }, ...(secondOrder ? { secondOrder: true as const } : {}) });
const check = (r: ColumnRow, label: string) => r.verifications.find((v) => v.label === label);
const step = (r: ColumnRow, label: string) => r.steps.flatMap((g) => g.steps).find((s) => s.label === label);

describe('a column in a sway storey', () => {
  it('takes δs = 1/(1 − Q) up to 1.5, ΣPu/(0.75·ΣPc) past it, and is unstable where ΣPu reaches 0.75·ΣPc (§6.6.4.6.2)', () => {
    expect(aciDeltaS(column({ sway: swaying(0.2) }), 'W')).toMatchObject({ method: 'Q', deltaS: 1.25 });
    const pc = aciDeltaS(column({ sway: swaying(0.4, 1000, 4000) }), 'W');
    expect(pc.method).toBe('Pc');
    expect(pc.deltaS).toBeCloseTo(1 / (1 - 1000 / 3000), 12);
    expect(aciDeltaS(column({ sway: swaying(0.4, 3000, 4000) }), 'W').method).toBe('unstable');
    expect(aciDeltaS(column({ sway: swaying(0.4, 3000, 4000, true) }), 'W')).toMatchObject({ method: 'secondOrder', deltaS: 1 });
    expect(aciDeltaS(column({ sway: swaying(0.2) }), 'D')).toMatchObject({ method: 'none', deltaS: 1 });
  });

  it('magnifies only the part the lateral cases give, M = Mns + δs·Ms, about the axes slender in the sway frame', () => {
    const m = swayMagnified(wind, 1.25, { x: true, y: false });
    expect(m.mxTop).toBeCloseTo(60 + 0.25 * 50, 12);
    expect(m.mxBot).toBeCloseTo(-70 - 0.25 * 60, 12);
    expect(m.myTop).toBe(5);
  });

  it('designs for the magnified moments where the storey sways, and as before where Q stays under 0.05', () => {
    const braced = columnRow(column({ sway: swaying(0.03) }), ctx, bars, fmt);
    const plain = columnRow(column(), ctx, bars, fmt);
    const sway = columnRow(column({ sway: swaying(0.2) }), ctx, bars, fmt);
    expect(braced.checks.ratio).toBeCloseTo(plain.checks.ratio, 12);
    expect(step(braced, 'rcSheets.s.storeyBraced')!.value).toContain('0.030');
    expect(step(plain, 'rcSheets.s.nonSway')).toBeDefined();
    expect(sway.checks.ratio).toBeGreaterThan(plain.checks.ratio + 0.02);
    expect(step(sway, 'rcSheets.s.storeySway')!.value).toContain('δs = 1.250');
  });

  it('keeps the sway moments of a column no more slender than 22 in the sway frame (§6.2.5.1(a))', () => {
    const stocky = column({ lu: 1.2, length: 1.6, sway: swaying(0.2) });
    expect(columnRow(stocky, ctx, bars, fmt).checks.ratio).toBeCloseTo(columnRow({ ...stocky, sway: undefined }, ctx, bars, fmt).checks.ratio, 12);
  });

  it('takes the FIUBA course\'s k ≥ 1.20 in CIRSOC, the chart\'s k ≥ 1 in ACI 318', () => {
    const stiff = column({ psiTop: 0.2, psiBot: 0.2, sway: swaying(0.2) });
    expect(swayFactor(stiff, 1)).toBeLessThan(1.2);
    expect(swayFactor(stiff, 1.2)).toBe(1.2);
    const cirsoc = columnRow(stiff, ctx, bars, fmt), aci = columnRowFor(ACI_COLUMN)(stiff, ctx, bars, fmt);
    expect(check(cirsoc, 'rcSheets.v.slenderMax')!.demand).toContain(fmt((1.2 * 3.8) / (0.3 * 0.35), 1));
    expect(cirsoc.checks.ratio).toBeGreaterThanOrEqual(aci.checks.ratio - 1e-9);
  });

  it('reads a P-Delta solve\'s moments as they are and fails them where they pass 1.4 times the first-order ones (§6.2.6)', () => {
    const second = { ...wind, mxTop: 100, mxBot: -112, first: { mxTop: 60, mxBot: -70, myTop: 5, myBot: -5 } };
    const r = columnRow(column({ cases: [second], sway: swaying(0.2, 3000, 30000, true) }), ctx, bars, fmt);
    expect(step(r, 'rcSheets.s.storeySecondOrder')).toBeDefined();
    const limit = check(r, 'rcSheets.v.secondOrderLimit')!;
    expect(limit.ok).toBe(false);
    expect(limit.ratio).toBeCloseTo(112 / 70 / 1.4, 3);
    const mild = columnRow(column({ cases: [{ ...second, mxTop: 80, mxBot: -84 }], sway: swaying(0.2, 3000, 30000, true) }), ctx, bars, fmt);
    expect(check(mild, 'rcSheets.v.secondOrderLimit')!.ok).toBe(true);
  });

  it('fails an unstable storey and says by how much', () => {
    const r = columnRow(column({ sway: swaying(0.45, 30000, 32000) }), ctx, bars, fmt);
    expect(r.status).toBe('fail');
    expect(check(r, 'rcSheets.v.swayStable')!.ok).toBe(false);
  });

  it('in EN 1992 reads a storey past Q = 1/11 as unbraced (5.8.2(6)): l0 by Eq. 5.16 and a weaker column; braced with a P-Delta solve', () => {
    const ec2 = rulesFor('en1992-1-1').columnRow;
    const braced = ec2(column({ sway: swaying(0.05) }), ctx, bars, fmt);
    const unbraced = ec2(column({ sway: swaying(0.2) }), ctx, bars, fmt);
    const pdelta = ec2(column({ sway: swaying(0.2, 3000, 30000, true) }), ctx, bars, fmt);
    expect(step(unbraced, 'rcSheets.ec2.s.unbraced')).toBeDefined();
    expect(unbraced.checks.ratio).toBeGreaterThan(braced.checks.ratio + 0.02);
    expect(pdelta.checks.ratio).toBeCloseTo(braced.checks.ratio, 9);
  });

  it('in TS 500 magnifies the sway part by βs = 1/(1 − 1.3·ΣNd/ΣNk)', () => {
    const ts = rulesFor('ts500-2000').columnRow;
    const plain = ts(column(), ctx, bars, fmt), sway = ts(column({ sway: swaying(0.2, 3000, 13000) }), ctx, bars, fmt);
    expect(sway.checks.ratio).toBeGreaterThan(plain.checks.ratio);
    expect(step(sway, 'rcSheets.ts500.u.storeySway')!.value).toContain(fmt(1 / (1 - (1.3 * 3000) / 13000), 3));
  });
});

describe('the FIUBA course\'s layout of a CIRSOC column (§15.8)', () => {
  it('puts the thickest bars at the corners and keeps bars 30 cm apart at most, but for a 40 cm face with its corner bars alone', () => {
    const d = column({ b: 0.4, h: 0.7 });
    expect(check(columnRow(d, ctx, { ...bars, corner: 16, dx: 20 }, fmt), 'rcSheets.v.colCornerLargest')!.ok).toBe(false);
    expect(check(columnRow(d, ctx, bars, fmt), 'rcSheets.v.colCornerLargest')!.ok).toBe(true);
    expect(check(columnRow(d, ctx, { ...bars, nx: 0, ny: 0 }, fmt), 'rcSheets.v.colMaxPitch')!.ok).toBe(false);
    expect(check(columnRow(d, ctx, { ...bars, nx: 0, ny: 1 }, fmt), 'rcSheets.v.colMaxPitch')!.ok).toBe(false);
    expect(check(columnRow(d, ctx, { ...bars, nx: 0, ny: 2 }, fmt), 'rcSheets.v.colMaxPitch')!.ok).toBe(true);
    expect(check(columnRowFor(ACI_COLUMN)(d, ctx, { ...bars, nx: 0, ny: 0 }, fmt), 'rcSheets.v.colMaxPitch')).toBeUndefined();
  });
});
