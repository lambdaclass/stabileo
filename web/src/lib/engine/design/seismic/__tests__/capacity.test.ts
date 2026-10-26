/**
 * Capacity design by hand.
 *
 *   Probable moment, 30 × 60, d = 0,55, 3Ø20 (9,42 cm²) alone, f'c 25, fy 420, λo 1,25:
 *     T = 9,42·525/10 = 494,6 kN, a = 494,6/(0,85·25 000·0,30) = 0,0776 m,
 *     Mpr = 494,6·(0,55 − 0,0388) = 252,8 kN·m.
 *   Column confinement, 50 × 50, cover 4 cm, lu 2,6 m, Ø20, hx 0,20 m:
 *     lo = max(0,50; 0,433; 0,45) = 0,50 m; so = min(0,125; 0,12; 0,15) = 0,12 m;
 *     Ash at s = 0,10: 0,3·(0,10·0,42·25/420)·(0,25/0,1764 − 1) = 3,13 cm² > 0,09·… = 2,25 cm².
 *   Joint: T = 1,25·420·(9,42 + 6,03)/10 = 811,1 kN, Vj = 811,1 − 150 = 661,1 kN,
 *     φVn = 0,85·1,7·√25·0,25 = 1806 kN.
 */
import { describe, it, expect } from 'vitest';
import { beamCapacityShear, columnCapacityShear, columnConfinement, hoopSpacingFor, probableMoment, seismicJointShear, strongColumn } from '../capacity';

describe('capacity design', () => {
  it('reads a probable moment off the bars with λo·fy and no φ', () => {
    expect(probableMoment(0.3, 0.55, 0.05, 25, 420, 1.25, 9.42, 0)).toBeCloseTo(252.8, 0);
  });

  it('builds a beam capacity shear from the probable moments and the gravity shear', () => {
    const r = beamCapacityShear({
      b: 0.3, h: 0.6, d: 0.55, dPrime: 0.05, fc: 25, fy: 420, fyt: 420,
      ends: [{ top: 9.42, bottom: 6.03 }, { top: 9.42, bottom: 6.03 }], ln: 5.5, vg: [30, 25],
      hoops: { diameter: 8, legs: 2, spacing: 0.1, length: 1.2 }, longMinDiaMm: 16, overstrength: 1.25,
    });
    expect(r.ve).toBeCloseTo((r.mprNeg[0] + r.mprPos[1]) / 5.5 + 30, 9);
    expect(r.mprNeg[0]).toBeGreaterThan(r.mprPos[0]);
    // The earthquake's part is more than half: no concrete in the shear.
    expect(r.vcZero).toBe(true);
    expect(r.phiVn).toBeCloseTo(0.75 * (2 * 0.5027e-4 * 420000 * 0.55) / 0.1, 0);
    expect(r.hoops.spacing).toBeCloseTo(0.096, 9);
    expect(r.hoops.spacingOk).toBe(false);
    expect(r.hoops.lengthOk).toBe(true);
    // A spacing that carries it.
    const s = hoopSpacingFor(r.ve, true, 0.3, 0.55, 25, 420, 10, 2)!;
    expect(0.75 * (2 * 0.7854e-4 * 420000 * 0.55) / s).toBeGreaterThanOrEqual(r.ve);
  });

  it('asks the columns at a joint for the strong-column ratio over the beams', () => {
    const r = strongColumn({ columns: [300, 280], beams: [252.8, 170], ratio: 1.2 });
    expect(r.required).toBeCloseTo(507.36, 6);
    expect(r.ok).toBe(true);
    expect(strongColumn({ columns: [200, 200], beams: [252.8, 170], ratio: 1.2 }).ok).toBe(false);
  });

  it('caps a column capacity shear at what the beams can deliver', () => {
    const r = columnCapacityShear({ b: 0.5, h: 0.5, d: 0.45, fc: 25, fyt: 420, mpr: [500, 500], fromBeams: [300, 300], lu: 2.6, vu: 80, pu: 200, ties: { diameter: 10, legs: 4, spacing: 0.1 } });
    expect(r.ve).toBeCloseTo(600 / 2.6, 9);
    expect(r.vcZero).toBe(true);
  });

  it('confines a column over lo at so with Ash in both directions', () => {
    const r = columnConfinement({ b: 0.5, h: 0.5, cover: 0.04, lu: 2.6, fc: 25, fyt: 420, longMinDiaMm: 20, tieDiaMm: 10, legsB: 4, legsH: 4, hx: 0.2, provided: { length: 0.5, spacing: 0.1 } });
    expect(r.lo).toBeCloseTo(0.5, 9);
    expect(r.so).toBeCloseTo(0.12, 9);
    expect(r.ashRequired.acrossB).toBeCloseTo(3.129, 2);
    expect(r.ashOk).toBe(true);
    expect(columnConfinement({ b: 0.5, h: 0.5, cover: 0.04, lu: 2.6, fc: 25, fyt: 420, longMinDiaMm: 20, tieDiaMm: 10, legsB: 3, legsH: 3, hx: 0.2, provided: { length: 0.5, spacing: 0.1 } }).ashOk).toBe(false);
  });

  it('checks a joint with the beams yielding at λo·fy', () => {
    const r = seismicJointShear({ fc: 25, fy: 420, overstrength: 1.25, topOneSide: 9.42, bottomOtherSide: 6.03, columnShear: 150, aj: 0.25, confinement: 'fourFaces' });
    expect(r.T).toBeCloseTo(811.1, 1);
    expect(r.vj).toBeCloseTo(661.1, 1);
    expect(r.phiVn).toBeCloseTo(1806.25, 2);
  });
});
