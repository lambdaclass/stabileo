import { beforeAll, expect, it } from 'vitest';
import { initSolver, computeEnvelope3D } from '../wasm-solver';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(initSolver);

it.each(['warning', 'error'] as const)('WASM refuses model-less distorted-shell envelopes (%s)', severity => {
  const result: AnalysisResults3D = {
    displacements: [], reactions: [], elementForces: [],
    structuredDiagnostics: [{ code: 'known_issue', severity, phase: 'SH-MITC4-DISTORTION', value: 798, message: 'distorted' }],
  };
  expect(() => computeEnvelope3D([result])).toThrow(/SH-MITC4-DISTORTION/);
});

it('WASM preserves warnings on safe envelope results', () => {
  const result: AnalysisResults3D = {
    displacements: [], reactions: [], elementForces: [],
    structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'NUM-INVARIANCE', value: 762, message: 'conditioning' }],
  };
  expect(computeEnvelope3D([result])?.maxAbsResults3D.structuredDiagnostics).toEqual(result.structuredDiagnostics);
});
