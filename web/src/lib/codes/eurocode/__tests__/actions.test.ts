/**
 * EN 1991-1-4, EN 1991-1-3, EN 1991-1-1 and EN 1998-1 formulas against hand calculations from the
 * code's own expressions, and against a published chart where one exists:
 *   - ce(z) = qp(z)/qb for terrain category II at 10 m reads about 2,35 on EN 1991-1-4 Figure 4.2
 *     (c0 = kI = 1); (1 + 7·0,1887)·1,0067² = 2,352.
 */
import { describe, expect, it } from 'vitest';
import { altitudeFactor, correlationFactor, peakPressure, roughness, terrainFactor, turbulence, wallCoefficients, windwardReferenceHeight } from '../wind';
import { mu1, roofSnowLoad, ukGroundSnow } from '../snow';
import { alphaA, alphaN, reduceImposed, ukAlphaA, ukAlphaN } from '../imposed';
import { SPECTRUM, approximatePeriod, correctionLambda, designSpectrum, phiFactor, storeyForces } from '../seismic';

describe('EN 1991-1-4 peak velocity pressure', () => {
  it('terrain II at z = 10 m, vb = 26 m/s', () => {
    expect(terrainFactor('II')).toBeCloseTo(0.19, 12);
    const cr = 0.19 * Math.log(10 / 0.05);
    expect(roughness(10, 'II')).toBeCloseTo(cr, 12);
    const iv = 1 / Math.log(10 / 0.05);
    expect(turbulence(10, 'II')).toBeCloseTo(iv, 12);
    const qb = 0.5 * 1.25 * 26 ** 2 / 1000;
    const qp = peakPressure(10, { vb: 26, terrain: 'II', c0: 1, rho: 1.25 });
    expect(qp).toBeCloseTo((1 + 7 * iv) * cr ** 2 * qb, 10);
    expect(qp / qb).toBeCloseTo(2.35, 2);
  });

  it('terrain III: kr = 0,19·(0,3/0,05)^0,07 = 0,2154; below zmin = 5 m it reads z = zmin', () => {
    expect(terrainFactor('III')).toBeCloseTo(0.2154, 4);
    expect(roughness(2, 'III')).toBeCloseTo(roughness(5, 'III'), 12);
  });

  it('Table 7.1 by h/d, and the lack of correlation of 7.2.2(3)', () => {
    expect(wallCoefficients(0.1)).toEqual({ D: 0.7, E: -0.3 });
    const half = wallCoefficients(0.5);
    expect(half.D).toBeCloseTo(0.7 + 0.1 / 3, 12);
    expect(half.E).toBeCloseTo(-0.3 - 0.2 / 3, 12);
    expect(wallCoefficients(3).E).toBeCloseTo(-0.6, 12);
    expect(correlationFactor(0.5)).toBe(0.85);
    expect(correlationFactor(3)).toBeCloseTo(0.925, 12);
    expect(correlationFactor(6)).toBe(1);
  });

  it('Figure 7.4 reference height and the UK altitude factor', () => {
    expect(windwardReferenceHeight(4, 9, 12)).toBe(9);
    expect(windwardReferenceHeight(4, 15, 10)).toBe(10);
    expect(windwardReferenceHeight(12, 15, 10)).toBe(15);
    expect(windwardReferenceHeight(20, 40, 10)).toBe(20);
    expect(altitudeFactor(150)).toBeCloseTo(1.15, 12);
  });
});

describe('EN 1991-1-3 snow on a duopitch roof', () => {
  it('μ1 of Table 5.2 and s = μ1·Ce·Ct·sk (5.1)', () => {
    expect(mu1(20)).toBe(0.8);
    expect(mu1(45)).toBeCloseTo(0.4, 12);
    expect(mu1(60)).toBe(0);
    expect(roofSnowLoad(mu1(30), 1, 1, 1.0)).toBeCloseTo(0.8, 12);
    expect(roofSnowLoad(0.5 * mu1(45), 1.2, 1, 1.5)).toBeCloseTo(0.36, 12);
  });

  it('UK NA: sk = 0,15 + (0,1 Z + 0,05) + (A − 100)/525', () => {
    expect(ukGroundSnow(3, 205)).toBeCloseTo(0.15 + 0.35 + 0.2, 12);
  });
});

describe('EN 1991-1-1 reduction', () => {
  it('αA = 5/7·ψ0 + A0/A ≤ 1, A0 = 10 m²; C and D not below 0,6', () => {
    expect(alphaA(50, 0.7, false)).toBeCloseTo(0.5 + 0.2, 12);
    expect(alphaA(5, 0.7, false)).toBe(1);
    expect(alphaA(1000, 0.7, false)).toBeCloseTo(0.51, 12);
    expect(alphaA(1000, 0.7, true)).toBe(0.6);
    const r = reduceImposed('eurocode', { loKNm2: 3, tributaryAreaM2: 50, elementKind: 'interiorBeam', floorsSupported: 1, passengerGarage: false, publicAssembly: false, noReduction: false });
    expect(r.lKNm2).toBeCloseTo(2.1, 12);
  });

  it('αn = (2 + (n − 2)·ψ0)/n for columns; none for E', () => {
    expect(alphaN(5, 0.7)).toBeCloseTo((2 + 3 * 0.7) / 5, 12);
    expect(alphaN(2, 0.7)).toBe(1);
    const col = reduceImposed('eurocode', { loKNm2: 2, tributaryAreaM2: 100, elementKind: 'interiorColumn', floorsSupported: 4, passengerGarage: false, publicAssembly: false, noReduction: false });
    expect(col.lKNm2).toBeCloseTo(2 * 0.85, 12);
    expect(reduceImposed('eurocode', { loKNm2: 7.5, tributaryAreaM2: 100, elementKind: 'interiorBeam', floorsSupported: 1, passengerGarage: false, publicAssembly: false, noReduction: true }).lKNm2).toBe(7.5);
  });

  it('UK NA: αA = 1 − A/1000 ≥ 0,75 and αn = 1,1 − n/10', () => {
    expect(ukAlphaA(100)).toBeCloseTo(0.9, 12);
    expect(ukAlphaA(400)).toBe(0.75);
    expect(ukAlphaN(3)).toBeCloseTo(0.8, 12);
    expect(ukAlphaN(8)).toBe(0.6);
    expect(ukAlphaN(12)).toBe(0.5);
  });
});

describe('EN 1998-1 design spectrum and lateral force method', () => {
  const C1 = SPECTRUM[1].C;
  const ag = 0.25, q = 3.9;

  it('Sd(T) of 3.2.2.5, ground C, Type 1, ag = 0,25 g, q = 3,9', () => {
    expect(designSpectrum(0, ag, C1, q)).toBeCloseTo(0.25 * 1.15 * 2 / 3, 12);
    expect(designSpectrum(0.1, ag, C1, q)).toBeCloseTo(0.25 * 1.15 * (2 / 3 + 0.5 * (2.5 / 3.9 - 2 / 3)), 12);
    expect(designSpectrum(0.4, ag, C1, q)).toBeCloseTo(0.25 * 1.15 * 2.5 / 3.9, 12);
    expect(designSpectrum(1.0, ag, C1, q)).toBeCloseTo(0.25 * 1.15 * 2.5 / 3.9 * 0.6, 12);
    expect(designSpectrum(3.0, ag, C1, q)).toBeCloseTo(0.2 * 0.25, 12);
  });

  it('a three-storey RC frame, 3 × 1000 kN at 3, 6 and 9 m', () => {
    const T1 = approximatePeriod('concreteMrf', 9);
    expect(T1).toBeCloseTo(0.075 * 9 ** 0.75, 12);
    expect(T1).toBeCloseTo(0.3897, 4);
    const Sd = designSpectrum(T1, ag, C1, q);
    const lambda = correctionLambda(T1, C1.TC, 3);
    expect(lambda).toBe(0.85);
    const Fb = Sd * 3000 * lambda;
    expect(Fb).toBeCloseTo(469.95, 1);
    const F = storeyForces(Fb, [{ z: 3, w: 1000 }, { z: 6, w: 1000 }, { z: 9, w: 1000 }]);
    expect(F[0]).toBeCloseTo(Fb / 6, 9);
    expect(F[1]).toBeCloseTo(Fb / 3, 9);
    expect(F[2]).toBeCloseTo(Fb / 2, 9);
    expect(F.reduce((a, b) => a + b, 0)).toBeCloseTo(Fb, 9);
  });

  it('φ of Table 4.2', () => {
    expect(phiFactor('A', true, 'correlated')).toBe(1);
    expect(phiFactor('B', false, 'correlated')).toBe(0.8);
    expect(phiFactor('C', false, 'independent')).toBe(0.5);
    expect(phiFactor('E', false, 'independent')).toBe(1);
  });
});
