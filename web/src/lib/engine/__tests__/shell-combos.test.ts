/**
 * FIX2 root cause — shell stresses are dropped by the WASM combination solver;
 * they are recombined in JS from per-case results (linear in displacement).
 * Pins the linear recombination, Von Mises recompute, and governing envelope.
 */
import { describe, it, expect } from 'vitest';
import { combineShellStresses, envelopeShellStresses, enrichComboShellStresses } from '../shell-combos';
import type { AnalysisResults3D, QuadStress } from '../types-3d';

const emptyResult = (quadStresses: QuadStress[]): AnalysisResults3D => ({
  displacements: [], reactions: [], elementForces: [], quadStresses, plateStresses: [],
} as unknown as AnalysisResults3D);

const q = (id: number, sxx: number, syy = 0, txy = 0): QuadStress => ({
  elementId: id, sigmaXx: sxx, sigmaYy: syy, tauXy: txy, mx: sxx, my: 0, mxy: 0, vonMises: Math.abs(sxx),
});

describe('combineShellStresses', () => {
  it('linearly combines membrane stresses + moments by factor', () => {
    const caseQuads = new Map([
      [1, new Map([[7, { sigmaXx: 100, sigmaYy: 0, tauXy: 0, mx: 10, my: 0, mxy: 0 }]])],
      [2, new Map([[7, { sigmaXx: 50, sigmaYy: 0, tauXy: 0, mx: 4, my: 0, mxy: 0 }]])],
    ]);
    const { quadStresses } = combineShellStresses(
      [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }], new Map(), caseQuads,
    );
    const s = quadStresses.find(x => x.elementId === 7)!;
    expect(s.sigmaXx).toBeCloseTo(1.2 * 100 + 1.6 * 50, 9); // 200
    expect(s.mx).toBeCloseTo(1.2 * 10 + 1.6 * 4, 9);       // 18.4
    // uniaxial → Von Mises = |σxx|
    expect(s.vonMises).toBeCloseTo(200, 9);
  });

  it('recomputes Von Mises (nonlinear) from combined components, not linearly', () => {
    // case A pure σxx=100, case B pure τxy=100; combo 1·A + 1·B
    const caseQuads = new Map([
      [1, new Map([[1, { sigmaXx: 100, sigmaYy: 0, tauXy: 0, mx: 0, my: 0, mxy: 0 }]])],
      [2, new Map([[1, { sigmaXx: 0, sigmaYy: 0, tauXy: 100, mx: 0, my: 0, mxy: 0 }]])],
    ]);
    const { quadStresses } = combineShellStresses([{ caseId: 1, factor: 1 }, { caseId: 2, factor: 1 }], new Map(), caseQuads);
    // vM = sqrt(100² + 3·100²) = 200, NOT 100+100=200 by luck? sqrt(10000+30000)=200. Use σxx=100,τxy=50:
    const s = quadStresses[0];
    expect(s.vonMises).toBeCloseTo(Math.sqrt(100 * 100 + 3 * 100 * 100), 6);
  });
});

describe('envelopeShellStresses', () => {
  it('picks the governing (max Von Mises) combo per element', () => {
    const combos = [emptyResult([q(7, 80), q(8, 30)]), emptyResult([q(7, 120), q(8, 10)])];
    const { quadStresses } = envelopeShellStresses(combos);
    expect(quadStresses.find(x => x.elementId === 7)!.vonMises).toBe(120);
    expect(quadStresses.find(x => x.elementId === 8)!.vonMises).toBe(30);
  });
});

describe('enrichComboShellStresses', () => {
  it('fills per-combo + envelope shell stresses from per-case (no-op without shells)', () => {
    const perCase = new Map<number, AnalysisResults3D>([
      [1, emptyResult([q(7, 100)])],
      [2, emptyResult([q(7, 40)])],
    ]);
    const perCombo = new Map<number, AnalysisResults3D>([[10, emptyResult([])]]);
    const envMaxAbs = emptyResult([]);
    enrichComboShellStresses(perCase, perCombo, envMaxAbs, [{ id: 10, factors: [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 1 }] }]);
    expect(perCombo.get(10)!.quadStresses![0].sigmaXx).toBeCloseTo(140, 9);
    expect(envMaxAbs.quadStresses![0].vonMises).toBeCloseTo(140, 9);

    // no shells anywhere → no-op
    const pc = new Map<number, AnalysisResults3D>([[1, emptyResult([])]]);
    const pco = new Map<number, AnalysisResults3D>([[10, emptyResult([])]]);
    enrichComboShellStresses(pc, pco, emptyResult([]), [{ id: 10, factors: [{ caseId: 1, factor: 1 }] }]);
    expect(pco.get(10)!.quadStresses).toEqual([]);
  });
});
