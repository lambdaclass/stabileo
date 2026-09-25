/**
 * A model the engine refuses for its data is "not checked", not "stable".
 *
 * The engine's kinematic analysis validates its input first and, on failure,
 * returns `isSolvable: false` with `mechanismModes: 0` — nothing was analysed.
 * Two readers got that wrong:
 *
 * 1. The kinematic report mapped every engine result to
 *    `rankAnalysis: 'available'`, so zero modes read as a finding: step 3 said
 *    "no mechanisms — the structure is stable" and the footer underneath said
 *    "Mechanism — cannot be solved".
 *
 * 2. The Basic solve runs this analysis first and stops on `!isSolvable`, so
 *    the solve that would have named the problem ("Poisson ratio must be in
 *    (-1, 0.5)") never ran, and the user got only "the model has invalid
 *    data". A Poisson ratio of 0.5 is not caught anywhere earlier.
 */

import { describe, it, expect } from 'vitest';
import type { SolverInput } from '../types';
import { analyzeKinematics, normalizeKinematicResult } from '../kinematic-2d';
import { generateKinematicReport } from '../kinematic-report';
import { validateAndSolve2D, type ModelData } from '../solver-service';

const cantilever = (nu: number): SolverInput =>
  ({
    nodes: new Map([
      [1, { id: 1, x: 0, z: 0 }],
      [2, { id: 2, x: 4, z: 0 }],
    ]),
    materials: new Map([[1, { id: 1, e: 210000, nu }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
    ]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
  }) as unknown as SolverInput;

const cantileverModel = (nu: number): ModelData => ({
  nodes: new Map([
    [1, { id: 1, x: 0, y: 0 }],
    [2, { id: 2, x: 4, y: 0 }],
  ]),
  materials: new Map([[1, { id: 1, e: 200_000_000, nu }]]),
  sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
  elements: new Map([
    [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
  ]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
  loads: [{ type: 'nodal', data: { id: 1, nodeId: 2, fx: 0, fz: -10, my: 0 } }],
} as unknown as ModelData);

describe('the engine refusing a model is reported as such', () => {
  it('normalization keeps the refusal apart from a verified result', () => {
    const r = normalizeKinematicResult({
      degree: 0,
      classification: 'isostatic',
      mechanismModes: 0,
      mechanismNodes: [],
      unconstrainedDofs: [],
      diagnosis: 'El modelo no puede analizarse porque tiene datos inválidos.',
      isSolvable: false,
      invalidInput: 'Material 1: Poisson ratio must be in (-1, 0.5) (got 0.5)',
    });
    expect(r.rankAnalysis).toBe('invalid');
    expect(r.invalidInput).toMatch(/Poisson/);
  });

  it('a result without it is unchanged', () => {
    const r = normalizeKinematicResult({
      degree: 0,
      classification: 'isostatic',
      mechanismModes: 0,
      mechanismNodes: [],
      unconstrainedDofs: [],
      diagnosis: '',
      isSolvable: true,
    });
    expect(r.rankAnalysis).toBe('available');
    expect(r).not.toHaveProperty('invalidInput');
  });

  it('the engine says why, and the report does not call it stable', () => {
    const k = analyzeKinematics(cantilever(0.5));
    expect(k.isSolvable).toBe(false);
    expect(k.rankAnalysis).toBe('invalid');
    expect(k.invalidInput).toMatch(/Poisson/);

    const report = generateKinematicReport(cantilever(0.5))!;
    expect(report.rankChecked).toBe(false);
    expect(report.invalidInput).toMatch(/Poisson/);
  });

  it('a valid model is still checked', () => {
    const report = generateKinematicReport(cantilever(0.3))!;
    expect(report.rankChecked).toBe(true);
    expect(report.invalidInput).toBeNull();
    expect(report.isSolvable).toBe(true);
  });

  it('the solve reports the validator message, not only "invalid data"', () => {
    const out = validateAndSolve2D(cantileverModel(0.5));
    expect(typeof out).toBe('string');
    expect(out as string).toMatch(/Poisson ratio must be in/);
  });

  it('the same model with a valid ratio still solves', () => {
    const out = validateAndSolve2D(cantileverModel(0.3));
    expect(typeof out).not.toBe('string');
    expect(out).toBeTruthy();
  });
});
