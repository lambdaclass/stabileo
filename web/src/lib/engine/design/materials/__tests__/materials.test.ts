/**
 * The member checkers of the other materials, against hand values: timber by the adjustment
 * factors (KF, φ, λ, CP, CL), aluminium by EN 1999-1-1 (class, χ, resistances), composite columns
 * and beams by AISC 360-10 Chapter I. Every row names its clause and its inequality.
 */
import { describe, expect, it } from 'vitest';
import { beamStability, columnStability, timeEffectFactor, timberCheckRows, timberSection, KF, PHI } from '../timber';
import { aluminiumCheckRows, bucklingClass, chi, sectionClass } from '../aluminium';
import { compositeBeamMoment, compositeCheckRows, compositeColumnStrength, columnCurve, ecOf } from '../composite';

const dm = (o: Partial<{ n: number; vStrong: number; vWeak: number; mStrong: number; mWeak: number }>, caseTypes: string[] = ['D']) =>
  ({ n: 0, vStrong: 0, vWeak: 0, mStrong: 0, mWeak: 0, comboName: 'U1', x: 1, caseTypes, ...o });

describe('timber', () => {
  const ref = { fb: 10, ft: 6, fc: 8, fv: 1, e: 10000, kind: 'sawn' as const };
  const sec = timberSection({ b: 0.1, h: 0.2, a: 0.02 })!;

  it('λ from the kinds of load in the combination', () => {
    expect(timeEffectFactor(['D'])).toBe(0.6);
    expect(timeEffectFactor(['D', 'L'])).toBe(0.8);
    expect(timeEffectFactor(['D', 'L', 'W'])).toBe(1);
  });

  it('bending: Fb′ = Fb·KF·φb·λ, braced (CL = 1)', () => {
    const rows = timberCheckRows(ref, sec, { wet: false }, { L: 3, Lb: 0 }, [dm({ mStrong: 5 })]);
    const r = rows.find((x) => x.titleKey === 'check.timber.bendingStrong')!;
    const fbP = 10 * KF.b * PHI.b * 0.6, mn = (fbP * (0.1 * 0.2 ** 2)) / 6 * 1000;
    expect(r.capacity).toBeCloseTo(mn, 2);
    expect(r.ratio).toBeCloseTo(5 / mn, 3);
    expect(r.clause).toBe('3.3');
  });

  it('compression: CP from the weaker slenderness, by hand', () => {
    const rows = timberCheckRows(ref, sec, { wet: false }, { L: 3, Lb: 3 }, [dm({ n: -50 }, ['D', 'L'])]);
    const r = rows.find((x) => x.titleKey === 'check.timber.compression')!;
    const eminP = 0.365 * 10000 * KF.emin * PHI.emin, fcStar = 8 * KF.c * PHI.c * 0.8;
    const { cp } = columnStability(fcStar, eminP, 30, 'sawn');
    expect(cp).toBeCloseTo(0.3286, 3);
    expect(r.capacity).toBeCloseTo(fcStar * cp * 0.02 * 1000, 1);
  });

  it('beam stability lowers a deep unbraced beam; a wet service lowers Fb', () => {
    const b = beamStability(20, 5000, 4, 0.05, 0.3);
    expect(b.cl).toBeLessThan(1);
    expect(b.le).toBeCloseTo(1.63 * 4 + 3 * 0.3, 9);
    const dry = timberCheckRows(ref, sec, { wet: false }, { L: 3, Lb: 0 }, [dm({ mStrong: 5 })])[0]!;
    const wet = timberCheckRows(ref, sec, { wet: true }, { L: 3, Lb: 0 }, [dm({ mStrong: 5 })])[0]!;
    expect(wet.capacity! / dry.capacity!).toBeCloseTo(0.85, 3);
  });

  it('every row names its clause and inequality', () => {
    const rows = timberCheckRows(ref, sec, { wet: false }, { L: 3, Lb: 3 }, [dm({ n: -20, mStrong: 3, mWeak: 0.5, vStrong: 4 }, ['D', 'L']), dm({ n: 10, mStrong: 2 })]);
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.filter((r) => !r.clause || !r.formula)).toEqual([]);
  });
});

describe('aluminium', () => {
  it('class A for heat-treated tempers, B otherwise', () => {
    expect(bucklingClass('6061-T6')).toBe('A');
    expect(bucklingClass('5083-H111')).toBe('B');
  });

  it('χ of a class A column, by hand', () => {
    expect(chi(2.5826, 'A')).toBeCloseTo(0.13801, 4);
    expect(chi(0.05, 'A')).toBe(1);
  });

  it('tension and buckling of a solid bar, by hand', () => {
    const s = { kind: 'rect' as const, b: 0.05, h: 0.1, a: 0.005, iy: (0.05 * 0.1 ** 3) / 12, iz: (0.1 * 0.05 ** 3) / 12, j: 0 };
    const g = { fo: 240, fu: 260, designation: '6061-T6' };
    const t = aluminiumCheckRows(s, g, { L: 2, Lb: 2 }, [{ n: 100, vStrong: 0, vWeak: 0, mStrong: 0, mWeak: 0, comboName: 'U', x: 0 }])[0]!;
    expect(t.capacity).toBeCloseTo(936, 1);
    const c = aluminiumCheckRows(s, g, { L: 2, Lb: 2 }, [{ n: -100, vStrong: 0, vWeak: 0, mStrong: 0, mWeak: 0, comboName: 'U', x: 0 }])[0]!;
    expect(c.titleKey).toBe('check.alu.buckling');
    expect(c.capacity).toBeCloseTo(0.13801 * 1090.909, 0);
  });

  it('a slender I section is class 4 and is not evaluated, a stocky one is', () => {
    const slender = { kind: 'I' as const, b: 0.2, h: 0.3, tw: 0.002, tf: 0.004, a: 0.002, iy: 1e-5, iz: 1e-6, j: 1e-9 };
    expect(sectionClass(slender, 240, 'A').compression).toBe(4);
    expect(aluminiumCheckRows(slender, { fo: 240, fu: 260, designation: '6061-T6' }, { L: 3, Lb: 3 }, [])[0]!.status).toBe('unsupported');
    const stocky = { ...slender, tw: 0.015, tf: 0.016 };
    expect(sectionClass(stocky, 240, 'A').compression).toBeLessThan(4);
  });
});

describe('composite', () => {
  const rhs = { kind: 'RHS' as const, b: 0.2, h: 0.2, t: 0.008, a: 0.2 ** 2 - 0.184 ** 2, iy: (0.2 ** 4 - 0.184 ** 4) / 12, iz: (0.2 ** 4 - 0.184 ** 4) / 12, fy: 355 };

  it('a filled tube: Pno, EIeff with C3 ≤ 0,9, and the column curve', () => {
    const st = compositeColumnStrength(rhs, { kind: 'filled', fc: 30 }, { y: 4, z: 4 });
    expect(st.compact).toBe(true);
    expect(st.pno).toBeCloseTo(355 * rhs.a * 1000 + 0.85 * 30 * 0.184 ** 2 * 1000, 3);
    const ei = 200000 * rhs.iy + 0.9 * ecOf(30) * 0.184 ** 4 / 12;
    expect(st.eiEff).toBeCloseTo(ei, 6);
    expect(st.pn).toBeCloseTo(columnCurve(st.pno, (Math.PI ** 2 * ei) / 16 * 1000), 6);
    expect(ecOf(30)).toBeCloseTo(26318, -1);
  });

  it('a column row by row: compression at 0,75·Pn, interaction by I5', () => {
    const rows = compositeCheckRows(rhs, { kind: 'filled', fc: 30 }, { L: 4 }, [{ n: -1000, v: 20, mStrong: 40, mWeak: 0, comboName: 'U', x: 0 }]);
    const c = rows.find((r) => r.titleKey === 'check.composite.compression')!;
    expect(c.ratio).toBeLessThan(1);
    expect(rows.find((r) => r.titleKey === 'check.composite.interaction')!.formula).toMatch(/8\/9/);
    expect(rows.filter((r) => !r.clause || !r.formula)).toEqual([]);
  });

  const ipe = { kind: 'I' as const, b: 0.15, h: 0.3, tw: 0.0071, tf: 0.0107, a: 0.00538, iy: 8.356e-5, iz: 6.04e-6, fy: 235 };

  it('a composite beam with the PNA in the slab, by hand', () => {
    const r = compositeBeamMoment(ipe, { kind: 'beam', fc: 25, bEff: 1.5, tc: 0.12 }, Infinity);
    expect(r.pnaInSlab).toBe(true);
    const C = 0.00538 * 235 * 1000, a = C / (0.85 * 25 * 1000 * 1.5);
    expect(r.mn).toBeCloseTo(C * (0.3 + 0.12 - a / 2 - 0.15), 6);
  });

  it('with no slab force left, the steel alone: Mn = Fy·Z', () => {
    const r = compositeBeamMoment(ipe, { kind: 'beam', fc: 25, bEff: 1.5, tc: 0.12 }, 0);
    const z = 0.15 * 0.0107 * (0.3 - 0.0107) + (0.0071 * (0.3 - 2 * 0.0107) ** 2) / 4;
    // The section's own area, not the catalogue's (with root fillets).
    const zFromParts = z, a = 2 * 0.15 * 0.0107 + 0.0071 * (0.3 - 2 * 0.0107);
    const r2 = compositeBeamMoment({ ...ipe, a }, { kind: 'beam', fc: 25, bEff: 1.5, tc: 0.12 }, 0);
    expect(r2.mn).toBeCloseTo(235 * 1000 * zFromParts, 3);
    expect(r.pnaInSlab).toBe(false);
  });

  it('partial composite: studs limit the slab force and the moment falls between the two', () => {
    const full = compositeBeamMoment(ipe, { kind: 'beam', fc: 25, bEff: 1.5, tc: 0.12 }, Infinity).mn;
    const part = compositeBeamMoment(ipe, { kind: 'beam', fc: 25, bEff: 1.5, tc: 0.12 }, 600).mn;
    const none = compositeBeamMoment(ipe, { kind: 'beam', fc: 25, bEff: 1.5, tc: 0.12 }, 0).mn;
    expect(part).toBeLessThan(full);
    expect(part).toBeGreaterThan(none);
  });
});
