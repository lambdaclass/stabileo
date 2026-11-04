/**
 * §22.7 torsion on a 0.30 × 0.60 m H-25 beam, ADN 420, cover 25 mm to Ø10 stirrups, d = 0.54 m,
 * Vu = 120 kN, Tu = 25 kN·m. By hand:
 *   Acp = 0.18 m², pcp = 1.80 m; Tth = 0.083·5·1000·0.0324/1.8 = 7.47 kN·m; φTth = 5.60 → not neglected
 *   x1 = 0.24, y1 = 0.54 m; Aoh = 0.1296 m², ph = 1.56 m, Ao = 0.11016 m²
 *   section: √((120/0.162)² + (25·1.56/(1.7·0.1296²))²) = √(740.7² + 1365.8²) = 1553.7 kN/m²
 *            φ(0.17·5·1000 + 0.66·5·1000) = 0.75·4150 = 3112.5 → 0.499
 *   At/s = 25/(0.75·2·0.11016·420 000) = 3.602e−4 m²/m
 *   Vs = 120/0.75 − 850·0.162 = 22.3 kN → Av/s = 22.3/(420 000·0.54) = 9.83e−5 m²/m
 *   (Av + 2At)/s = 8.187e−4 m²/m; 2 legs Ø10 c/15: 2·7.854e−5/0.15 = 1.047e−3 → 0.782
 *   one leg: 5.236e−4 ≥ At/s → 0.688; sMax = min(1.56/8, 0.30) = 0.195 → 0.15/0.195 = 0.769
 *   Al = 3.602e−4·1.56 = 5.62e−4 m²
 */
import { describe, it, expect } from 'vitest';
import { checkTorsion2025 } from '../torsion';

const base = { b: 0.3, h: 0.6, d: 0.54, cover: 0.025, stirrupDiaMm: 10, fc: 25, fy: 420, fyt: 420, Vu: 120, Tu: 25, stirrup: { diameter: 10, legs: 2, spacing: 0.15 } };

describe('torsion §22.7, by hand', () => {
  it('threshold, cross-section, transverse and longitudinal', () => {
    const r = checkTorsion2025(base);
    expect(r.phiTth).toBeCloseTo(5.6025, 3);
    expect(r.neglect).toBe(false);
    expect(r.sectionRatio).toBeCloseTo(0.4992, 3);
    expect(r.AtOverS).toBeCloseTo(3.602e-4, 7);
    expect(r.transverseRequired).toBeCloseTo(8.187e-4, 6);
    expect(r.sMax).toBeCloseTo(0.195, 9);
    expect(r.Al).toBeCloseTo(5.62e-4, 6);
    expect(r.ratio).toBeCloseTo(0.782, 2);
  });
  it('a small torque is neglected', () => {
    expect(checkTorsion2025({ ...base, Tu: 4 }).neglect).toBe(true);
    expect(checkTorsion2025({ ...base, Tu: 4 }).ratio).toBe(0);
  });
  it('closer stirrups are needed for a larger torque', () => {
    expect(checkTorsion2025({ ...base, Tu: 40 }).ratio).toBeGreaterThan(1);
  });
});
