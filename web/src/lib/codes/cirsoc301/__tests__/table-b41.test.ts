/**
 * Every row of Tabla B.4.1 at E = 200 000 MPa and Fy = 250 MPa (√(E/Fy) = 28,284), against its
 * coefficient worked by hand; then the classification of rolled shapes.
 */
import { describe, it, expect } from 'vitest';
import { TABLE_B41, b41Case, classifySection, kcOf } from '../table-b41';

const I = { E: 200000, Fy: 250 };
const r = Math.sqrt(200000 / 250);

describe('Tabla B.4.1, row by row', () => {
  const lambdaR: Record<number, number> = {
    1: 0.56 * r, 3: 0.45 * r, 4: 0.75 * r, 5: 1.49 * r, 6: 1.40 * r, 7: 1.40 * r, 8: 1.49 * r, 9: 1.86 * r, 10: 0.11 * 800,
    11: 1.0 * r, 13: 0.91 * r, 14: 1.0 * r, 15: 1.03 * r, 16: 5.70 * r, 17: 5.70 * r, 18: 1.40 * r, 19: 1.40 * r, 20: 5.70 * r, 21: 5.70 * r, 22: 1.49 * r, 23: 0.31 * 800,
  };
  const lambdaP: Record<number, number> = {
    11: 0.38 * r, 12: 0.38 * r, 13: 0.54 * r, 14: 0.38 * r, 15: 0.84 * r, 16: 3.76 * r, 17: 3.76 * r, 18: 1.12 * r, 19: 1.12 * r, 20: 2.42 * r, 21: 2.42 * r, 22: 1.12 * r, 23: 0.07 * 800,
  };
  for (const c of TABLE_B41) {
    if (lambdaR[c.case] !== undefined) it(`case ${c.case}: λr`, () => expect(c.lambdaR(I)).toBeCloseTo(lambdaR[c.case]!, 6));
    if (lambdaP[c.case] !== undefined) it(`case ${c.case}: λp`, () => expect(c.lambdaP!(I)).toBeCloseTo(lambdaP[c.case]!, 6));
  }
  it('case 2 and 12 take kc, and case 12 FL', () => {
    expect(b41Case(2).lambdaR({ ...I, kc: 0.5 })).toBeCloseTo(0.64 * Math.sqrt(0.5 * 800), 6);
    expect(b41Case(12).lambdaR({ ...I, kc: 0.5, FL: 175 })).toBeCloseTo(0.95 * Math.sqrt((0.5 * 200000) / 175), 6);
    expect(kcOf(400, 4)).toBeCloseTo(0.4, 9);
    // The upper bound of kc is 0,763 in Tabla B.4.1 Observación (a), E.7.1(b) and F.3.2; it read 0,76.
    expect(kcOf(100, 10)).toBe(0.763);
  });
  it('covers 23 cases, 10 in compression and 13 in flexure', () => {
    expect(TABLE_B41.filter((c) => c.table === 'a')).toHaveLength(10);
    expect(TABLE_B41.filter((c) => c.table === 'b')).toHaveLength(13);
  });
});

describe('classifying rolled shapes', () => {
  it('an IPE 300 is compact in flexure and nonslender in compression', () => {
    const c = classifySection('I', { h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107 }, { E: 200000, Fy: 235 });
    expect(c.flangeFlexure!.ratio).toBeCloseTo(7.01, 2);
    expect(c.flangeFlexure!.class).toBe('compact');
    expect(c.webCompression!.class).toBe('nonslender');
  });
  it('a wide thin flange is noncompact, then slender', () => {
    const nc = classifySection('I', { h: 0.3, b: 0.3, tw: 0.008, tf: 0.012 }, { E: 200000, Fy: 345 });
    // b/t = 12,5 against λp = 0,38·√(200000/345) = 9,15 and λr = 24,08.
    expect(nc.flangeFlexure!.class).toBe('noncompact');
    const sl = classifySection('I', { h: 0.3, b: 0.4, tw: 0.008, tf: 0.006 }, { E: 200000, Fy: 345 });
    expect(sl.flangeFlexure!.class).toBe('slender');
  });
});
