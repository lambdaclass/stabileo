import { describe, it, expect } from 'vitest';
import { roofLiveLoad, roofWeightClass } from '../roof-live';

describe('CIRSOC 101-2025 §4.8.1 roof live load', () => {
  it('light roofs reproduce Tabla C 4.8.3', () => {
    // p < 3 %, p = 3 %, 10 %, 55 %, with R1 = 1 (At < 20 m²) and R1 = 0,75 (At > 60 m²).
    const rows: Array<[number, number, number, number]> = [
      [0, 1.7, 0.765, 0.574], [3, 1.016, 0.457, 0.343], [10, 0.96, 0.432, 0.324], [55, 0.6, 0.270, 0.203],
    ];
    for (const [p, r2, small, large] of rows) {
      const a = roofLiveLoad({ weight: 'light', atM2: 10, slopePercent: p });
      expect(a.r2).toBeCloseTo(r2, 3);
      expect(a.lr).toBeCloseTo(small, 3);
      expect(roofLiveLoad({ weight: 'light', atM2: 80, slopePercent: p }).lr).toBeCloseTo(large, 3);
    }
  });

  it('heavy roofs: 0,96 R1 R2 within 0,58 and 0,96', () => {
    expect(roofLiveLoad({ weight: 'heavy', atM2: 10, slopePercent: 0 }).lr).toBeCloseTo(0.96, 6);
    // At = 40 m²: R1 = 1,2 − 0,4304 = 0,7696; flat: R2 = 1 → 0,7388.
    const mid = roofLiveLoad({ weight: 'heavy', atM2: 40, slopePercent: 0 });
    expect(mid.r1).toBeCloseTo(0.7696, 4);
    expect(mid.lr).toBeCloseTo(0.96 * 0.7696, 4);
    // 60 % slope: F = 7,2 → R2 = 0,84; with At > 60 m², 0,96·0,6·0,84 = 0,484 → the 0,58 floor.
    expect(roofLiveLoad({ weight: 'heavy', atM2: 80, slopePercent: 60 }).lr).toBeCloseTo(0.58, 6);
  });

  it('a roof is heavy above 0,5 kN/m²', () => {
    expect(roofWeightClass(0.5)).toBe('light');
    expect(roofWeightClass(0.51)).toBe('heavy');
  });
});
