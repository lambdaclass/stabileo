import { describe, it, expect } from 'vitest';
import { enrichComboShellStresses } from '../shell-combos';
import type { AnalysisResults3D, QuadStress } from '../types-3d';

const result = (quadStresses: QuadStress[]): AnalysisResults3D => ({
  displacements: [], reactions: [], elementForces: [], quadStresses, plateStresses: [],
} as unknown as AnalysisResults3D);

const deadLoadE10: QuadStress = {
  elementId: 10, sigmaXx: 0, sigmaYy: 0, tauXy: 0,
  mx: 64.95094306, my: 79.8912926, mxy: -20.07573627, qx: -55.90601443, qy: -51.14421948, vonMises: 0,
};

describe('shell envelope of pro-mat-foundation e10', () => {
  it('holds the largest Mx of every combination, not the first combination of equal Von Mises', () => {
    const perCase = new Map([[1, result([deadLoadE10])]]);
    const perCombo = new Map([[1, result([])], [2, result([])], [3, result([])], [4, result([])]]);
    const envelope = result([]);
    const combinations = [
      { id: 1, factors: [{ caseId: 1, factor: 1.2 }] },
      { id: 2, factors: [{ caseId: 1, factor: 1.4 }] },
      { id: 3, factors: [{ caseId: 1, factor: 1.2 }] },
      { id: 4, factors: [{ caseId: 1, factor: 1.2 }] },
    ];
    enrichComboShellStresses(perCase, perCombo, envelope, combinations, new Map());
    expect(perCombo.get(1)!.quadStresses![0]!.mx).toBeCloseTo(77.94113167, 6);
    expect(perCombo.get(2)!.quadStresses![0]!.mx).toBeCloseTo(90.93132028, 6);
    const e10 = envelope.quadStresses!.find((s) => s.elementId === 10)!;
    expect(e10.mx).toBeCloseTo(90.93132028, 6);
    expect(e10.my).toBeCloseTo(111.8478096, 6);
    expect(e10.mxy).toBeCloseTo(-28.10603077, 6);
    expect(e10.qx).toBeCloseTo(-78.2684202, 6);
    expect(e10.qy).toBeCloseTo(-71.60190728, 6);
  });
});
