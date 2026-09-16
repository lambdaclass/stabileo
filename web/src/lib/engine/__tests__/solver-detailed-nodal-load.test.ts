import { describe, it, expect } from 'vitest';
import { solveDetailed } from '../solver-detailed';
import type { SolverInput } from '../types';

/**
 * Nodal loads in the step-by-step wizard.
 *
 * There was no test on this path, which is why `solveDetailed` went on
 * destructuring nodal loads as `{ fx, fy, mz }` after the 2D solver moved
 * from (x, y) to (x, z). The interface is `{ fx, fz, my }`, so `fy` and `mz`
 * were undefined; `Math.abs(undefined) < 1e-15` is false, so instead of being
 * skipped as zeros they were written into the load vector as NaN. From step 5
 * the NaN spread to the displacements and the reactions, and the singularity
 * checks in solveLU — also written as `a < b` — let it pass rather than
 * raising, so it surfaced on screen as NaN.
 *
 * A cantilever gives closed-form values to check against:
 *   tip deflection  δ = PL³/3EI
 */
function cantilever(L: number, P: number): SolverInput {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, z: 0 }],
      [2, { id: 2, x: L, z: 0 }],
    ]),
    materials: new Map([[1, { id: 1, e: 200_000, rho: 78.5 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([
      [1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'frame' }],
    ]),
    supports: new Map([[1, { nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: P, my: 0 } }],
  } as unknown as SolverInput;
}

describe('solveDetailed — nodal loads', () => {
  const L = 4;
  const P = -10;
  const E = 200_000 * 1000; // kN/m²
  const I = 1e-4;           // m⁴

  it('produces no NaN at any step', () => {
    const d = solveDetailed(cantilever(L, P));
    const vectors: ReadonlyArray<readonly [string, number[]]> = [
      ['F', d.F], ['Ff', d.Ff], ['FfMod', d.FfMod],
      ['uFree', d.uFree], ['uAll', d.uAll], ['reactionsRaw', d.reactionsRaw],
    ];
    for (const [name, v] of vectors) {
      expect(v.every((x) => Number.isFinite(x)), `${name} contains NaN`).toBe(true);
    }
  });

  it('carries the vertical component into the load vector', () => {
    const d = solveDetailed(cantilever(L, P));
    // P must appear exactly once, on whichever DOF the numbering assigns.
    expect(d.F.filter((x) => Math.abs(x - P) < 1e-9).length).toBe(1);
  });

  it('matches PL³/3EI at the tip', () => {
    const d = solveDetailed(cantilever(L, P));
    const expected = (P * L ** 3) / (3 * E * I);
    const got = Math.min(...d.uAll.filter((x) => x < 0));
    expect(got).toBeCloseTo(expected, 8);
  });

  it('returns finite reactions', () => {
    const d = solveDetailed(cantilever(L, P));
    expect(d.reactionsRaw.every((x) => Number.isFinite(x))).toBe(true);
  });
});
