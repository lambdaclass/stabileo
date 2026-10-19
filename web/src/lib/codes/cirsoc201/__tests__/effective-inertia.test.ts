/**
 * Effective inertia and the long-term multiplier against a hand calculation.
 *
 * A 0.30 × 0.60 m beam, H-25 (Ec = 4700√25 = 23 500 MPa), 4Ø20 (12.57 cm²) at d = 0.54 m, no
 * compression steel, n = 200 000 / 23 500 = 8.511. By hand:
 *   kd: 0.15·x² + 0.010698·x − 0.005777 = 0 → x = 0.16380 m
 *   Icr = 0.30·0.16380³/3 + 8.511·12.57e−4·(0.54 − 0.16380)² = 4.395e−4 + 1.5140e−3 = 1.9535e−3 m⁴
 *   Ig = 0.30·0.60³/12 = 5.4e−3 m⁴; Mcr = 0.62·5·1000·5.4e−3/0.30 = 55.8 kN·m
 *   Ma = 150 kN·m: Ie = 1.9535e−3 / (1 − (37.2/150)²·(1 − 0.36176)) = 2.0333e−3 m⁴
 */
import { describe, it, expect } from 'vitest';
import { crackedInertia, crackingMoment, effectiveInertia, longTermMultiplier } from '../effective-inertia';

describe('effective inertia (Table 24.2.3.5) and λΔ (§24.2.4.1)', () => {
  const sec = { b: 0.3, h: 0.6, d: 0.54, dPrime: 0.06, As: 12.57e-4, AsPrime: 0, n: 200000 / 23500 };
  it('cracked inertia by hand', () => {
    const r = crackedInertia(sec);
    expect(r.kd).toBeCloseTo(0.16380, 4);
    expect(r.Icr).toBeCloseTo(1.9535e-3, 6);
  });
  it('cracking moment and effective inertia by hand', () => {
    const Mcr = crackingMoment(0.3, 0.6, 25);
    expect(Mcr).toBeCloseTo(55.8, 6);
    const Ig = 0.3 * 0.6 ** 3 / 12;
    expect(effectiveInertia(Ig, crackedInertia(sec).Icr, Mcr, 150)).toBeCloseTo(2.0333e-3, 6);
    // Under ⅔·Mcr the section is uncracked.
    expect(effectiveInertia(Ig, crackedInertia(sec).Icr, Mcr, 30)).toBe(Ig);
  });
  it('compression steel cuts the long-term multiplier', () => {
    expect(longTermMultiplier(0)).toBe(2);
    expect(longTermMultiplier(0.005)).toBeCloseTo(1.6, 9);
  });
});
