import { describe, it, expect } from 'vitest';
import { designPressure, kz, velocityPressure, wallCp, G_RIGID } from '../wind';
import { roofSnow7 } from '../snow';
import { designCategory, distributionExponent, responseCoefficient, upperLimitCu, verticalDistribution, PERIOD_PARAMETERS } from '../seismic';
import { FT, MPH, PSF } from '../refs';

const psf = (nm2: number) => nm2 / 1000 / PSF;

/**
 * StructSuite, "ASCE 7-22 Wind Load Calculation Example (Ch. 27 Directional)":
 * https://structsuite.com/guides/wind-load-calculation-example-asce7-22-chapter-27-gable-roof-house
 * V = 100 mph, exposure C, Kzt = Ke = 1, Kd = 0,85, G = 0,85, enclosed (±0,18), h = 22 ft, L/B = 0,67.
 */
describe('ASCE 7-22 velocity pressure and MWFRS wall pressures', () => {
  const w = { V: 100 * MPH, exposure: 'C' as const, kzt: 1, ke: 1 };

  it('Kz of Table 26.10-1 from Eq. 26.10-1 with the 7-22 constants', () => {
    expect(kz(15 * FT, 'C')).toBeCloseTo(0.85, 2);
    expect(kz(20 * FT, 'C')).toBeCloseTo(0.90, 2);
    expect(kz(25 * FT, 'C')).toBeCloseTo(0.94, 2);
    expect(kz(60 * FT, 'C')).toBeCloseTo(1.13, 2);
    expect(kz(2 * FT, 'C')).toBe(kz(15 * FT, 'C'));
    expect(kz(15 * FT, 'B')).toBeCloseTo(0.57, 2);
    expect(Math.abs(kz(15 * FT, 'D') - 1.03)).toBeLessThan(0.006);
  });

  it('qz = 0,613 Kz Kzt Ke V² without Kd: 21,76 psf at 15 ft', () => {
    expect(psf(velocityPressure(15 * FT, w))).toBeCloseTo(21.76, 1);
  });

  it('qh at 22 ft within 0,6 % of the example, which interpolates the table (Kz 0,916 against 0,920 by the equation)', () => {
    expect(psf(velocityPressure(22 * FT, w)) / 23.45).toBeCloseTo(1, 2);
  });

  it('Eq. 27.3-1 with the example q = 23,45 psf: windward +9,97/+17,14, leeward −12,06/−4,88, side −15,45/−8,27 psf', () => {
    const q = 23.45, cp = wallCp(32 / 48);
    expect(cp.leeward).toBe(-0.5);
    expect(designPressure(q, q, cp.windward, 0.18)).toBeCloseTo(9.97, 1);
    expect(designPressure(q, q, cp.windward, -0.18)).toBeCloseTo(17.14, 1);
    expect(designPressure(q, q, cp.leeward, 0.18)).toBeCloseTo(-12.06, 1);
    expect(designPressure(q, q, cp.leeward, -0.18)).toBeCloseTo(-4.88, 1);
    expect(designPressure(q, q, cp.side, 0.18)).toBeCloseTo(-15.45, 0);
    expect(G_RIGID).toBe(0.85);
  });
});

describe('ASCE 7-22 roof snow, Eq. 7.3-1 and 7.4-1 (hand calculations)', () => {
  it('pf = 0,7 Ce Ct pg with no Is: pg = 30 psf, Ce = Ct = 1 → 21 psf; pm = 30 psf governs a low-slope roof (RC II)', () => {
    const r = roofSnow7({ pg: 30 * PSF, ce: 1, ct: 1, riskCategory: 'II', slopeDeg: 2, slippery: false });
    expect(r.pf / PSF).toBeCloseTo(21, 6);
    expect(r.pm! / PSF).toBeCloseTo(30, 6);
    expect(r.balanced / PSF).toBeCloseTo(30, 6);
  });

  it('pm = pg below pm,max, and none on a roof of 15° or more', () => {
    expect(roofSnow7({ pg: 20 * PSF, ce: 1, ct: 1, riskCategory: 'IV', slopeDeg: 0, slippery: false }).pm! / PSF).toBeCloseTo(20, 6);
    expect(roofSnow7({ pg: 30 * PSF, ce: 1, ct: 1, riskCategory: 'II', slopeDeg: 20, slippery: false }).pm).toBeNull();
  });

  it('Cs of a warm non-slippery roof at 40°: (70 − 40)/40 = 0,75', () => {
    const r = roofSnow7({ pg: 50 * PSF, ce: 0.9, ct: 1, riskCategory: 'II', slopeDeg: 40, slippery: false });
    expect(r.cs).toBeCloseTo(0.75, 9);
    expect(r.ps / PSF).toBeCloseTo(0.75 * 0.7 * 0.9 * 50, 6);
  });
});

/**
 * Hand calculation, §12.8: 4-storey steel special moment frame, storeys of 4 m (hn = 16 m),
 * S_DS = 1,0, S_D1 = 0,6, S1 = 0,5, Risk Category II (Ie = 1), R = 8, T_L = 8 s, 1000 kN per level.
 *   Ta = 0,0724·16^0,8 = 0,6653 s (Eq. 12.8-7, Table 12.8-2 SI)
 *   Cs = min(1,0/8 = 0,125 ; 0,6/(0,6653·8) = 0,11273) = 0,11272; ≥ 0,044 (Eq. 12.8-2, -3, -5)
 *   V = 0,11273·4000 = 450,9 kN; k = 1 + (0,6653 − 0,5)/2 = 1,0827 (§12.8.3)
 *   hx^k = 4,486; 9,500; 14,736; 20,120 (Σ 48,842)
 *   Fx = V·wx·hx^k/Σ wi·hi^k: 41,4; 87,7; 136,0; 185,8 kN (Eq. 12.8-11, -12)
 */
describe('ASCE 7-22 equivalent lateral force procedure', () => {
  const p = PERIOD_PARAMETERS.steelMRF!;
  const ta = p.ct * 16 ** p.x;
  it('Ta, Cs, V, k and Fx', () => {
    expect(ta).toBeCloseTo(0.6653, 4);
    const cs = responseCoefficient({ sds: 1, sd1: 0.6, s1: 0.5, r: 8, ie: 1, t: ta, tl: 8 });
    expect(cs.cs).toBeCloseTo(0.11273, 5);
    expect(cs.governs).toBe('period');
    const V = cs.cs * 4000;
    expect(V).toBeCloseTo(450.9, 1);
    const k = distributionExponent(ta);
    expect(k).toBeCloseTo(1.0827, 4);
    const f = verticalDistribution([4, 8, 12, 16].map((h) => ({ h, w: 1000 })), V, k);
    expect(f.map((x) => +x.toFixed(1))).toEqual([41.4, 87.7, 136.0, 185.8]);
    expect(f.reduce((a, b) => a + b, 0)).toBeCloseTo(V, 9);
  });

  it('the lower limits of Eq. 12.8-5 and 12.8-6', () => {
    expect(responseCoefficient({ sds: 0.2, sd1: 0.05, r: 8, ie: 1, t: 3, tl: 4 }).cs).toBeCloseTo(0.01, 9);
    const s1 = responseCoefficient({ sds: 1, sd1: 0.6, s1: 0.8, r: 8, ie: 1, t: 3, tl: 8 });
    expect(s1.governs).toBe('s1');
    expect(s1.cs).toBeCloseTo(0.05, 9);
  });

  it('Cu of Table 12.8-1 and the Seismic Design Category of §11.6', () => {
    expect(upperLimitCu(0.6)).toBe(1.4);
    expect(upperLimitCu(0.05)).toBe(1.7);
    expect(upperLimitCu(0.175)).toBeCloseTo(1.55, 9);
    expect(designCategory(1, 0.6, 0.5, 'II')).toBe('D');
    expect(designCategory(0.3, 0.1, 0.1, 'II')).toBe('B');
    expect(designCategory(0.3, 0.1, 0.1, 'IV')).toBe('C');
    expect(designCategory(1.2, 0.8, 0.8, 'IV')).toBe('F');
  });
});
