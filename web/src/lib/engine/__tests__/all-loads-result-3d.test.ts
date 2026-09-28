/**
 * The "All loads" baseline is the sum of the cases — and a full result: the engine's
 * combination drops shell stresses, constraint forces and diagnostics, and the floor design
 * reads the slab moments from the quad stresses of exactly this result.
 */
import { describe, it, expect } from 'vitest';
import { allLoadsResult3D } from '../shell-combos';
import type { AnalysisResults3D } from '../types-3d';

const quad = (elementId: number, k: number) => ({
  elementId, sigmaXx: k, sigmaYy: 2 * k, tauXy: 0, mx: 10 * k, my: 20 * k, mxy: k, sigma1: 0, sigma2: 0, vonMises: 0,
});
const caseResult = (k: number): AnalysisResults3D => ({
  displacements: [], reactions: [], elementForces: [],
  quadStresses: [quad(7, k)] as never,
  constraintForces: [{ nodeId: 3, dof: 'ux', force: k }],
  solverDiagnostics: [{ category: 'conditioning', message: 'm', severity: 'warning' }] as never,
});

describe('allLoadsResult3D', () => {
  it('sums the shell stresses and constraint forces of the cases, and keeps the solve’s diagnostics', () => {
    const perCase = new Map([[1, caseResult(1)], [2, caseResult(2)]]);
    const combined: AnalysisResults3D = { displacements: [], reactions: [], elementForces: [] };
    const r = allLoadsResult3D(combined, perCase);
    expect(r.quadStresses).toHaveLength(1);
    expect(r.quadStresses![0]).toMatchObject({ elementId: 7, mx: 30, my: 60, sigmaXx: 3 });
    expect(r.constraintForces).toEqual([{ nodeId: 3, dof: 'ux', force: 3 }]);
    expect(r.solverDiagnostics).toHaveLength(1);
    expect(r.plateStresses).toBeUndefined();
  });
});
