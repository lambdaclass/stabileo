import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { serviceResult } from '../slab-deflection-store';
import type { AnalysisResults3D, QuadStress } from '../../engine/types-3d';

const quad = (elementId: number, mx: number): QuadStress => ({ elementId, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx, my: 0, mxy: 0, vonMises: 0 });
const caseOf = (quadStresses: QuadStress[]) => ({ displacements: [], reactions: [], elementForces: [], quadStresses } as unknown as AnalysisResults3D);

beforeAll(async () => { await initSolver(); });

describe('the service field added from the cases', () => {
  it('refuses a case with a MITC4 and a MITC9 both numbered 7, not one moment summed from both', () => {
    modelStore.clear();
    resultsStore.setCombinationResults3D(new Map([[1, caseOf([quad(7, 10), quad(7, 1000)])], [2, caseOf([quad(7, 1)])]]), new Map(), {} as never);
    expect(() => serviceResult()).toThrow(/Shell element 7 appears twice/);
  });

  it('adds each shell of the cases by its own id', () => {
    modelStore.clear();
    resultsStore.setCombinationResults3D(new Map([[1, caseOf([quad(7, 10), quad(8, 1000)])], [2, caseOf([quad(7, 1)])]]), new Map(), {} as never);
    expect(serviceResult()!.result.quadStresses!.map((s) => [s.elementId, s.mx])).toEqual([[7, 11], [8, 1000]]);
  });
});
