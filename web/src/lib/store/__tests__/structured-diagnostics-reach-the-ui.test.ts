/**
 * What the pre-solve gates find has to reach the panels that show diagnostics.
 *
 * ── The defect these pin ───────────────────────────────────────────
 *
 * The engine emits `structuredDiagnostics` on every solve — isolated nodes,
 * collapsed elements, local axes that cannot be built, each with a stable code
 * and a severity. Nothing on this side read the field: the whole list was
 * computed, serialized across the WASM boundary, and dropped. The diagnostics
 * panel showed `diagnostics` and `solverDiagnostics` only, so a model the
 * engine had already diagnosed by name looked clean.
 *
 * These tests pin the translation, not the rendering: severity and code cross
 * as-is, `source` says 'model', and only what describes the model gets through
 * — the solve's own run notes (factorization, residual) share the list and are
 * not findings. Shell ids go to the shell selection, never read as frames.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resultsStore } from '../results.svelte';
import type { AnalysisResults } from '../../engine/types';

function resultsWith(structured: AnalysisResults['structuredDiagnostics']): AnalysisResults {
  return {
    displacements: [],
    reactions: [],
    elementForces: [],
    structuredDiagnostics: structured,
  };
}

describe('structured diagnostics reach the diagnostics UI', () => {
  beforeEach(() => {
    resultsStore.setResults(resultsWith([]));
  });

  it('passes severity, code and message through untouched', () => {
    resultsStore.setResults(
      resultsWith([
        {
          code: 'negative_jacobian',
          severity: 'error',
          message: 'Quad 7 has no area — element is collapsed',
          elementIds: [7],
          elementKind: 'quad',
          phase: 'pre_solve',
        },
      ])
    );

    const [d] = resultsStore.structuredDiagnostics;
    expect(d.severity).toBe('error');
    expect(d.code).toBe('negative_jacobian');
    expect(d.message).toContain('collapsed');
    // Quad 7 is not frame element 7: it goes to the shell selection.
    expect(d.shellKeys).toEqual(['q7']);
    expect(d.elementIds).toBeUndefined();
  });

  it('keeps a frame element a frame element, and a plate a plate', () => {
    resultsStore.setResults(
      resultsWith([
        { code: 'suspicious_local_axis', severity: 'warning', message: 'Element 4 …', elementIds: [4], elementKind: 'frame', phase: 'pre_solve' },
        { code: 'high_aspect_ratio', severity: 'warning', message: 'Plate 4 …', elementIds: [4], elementKind: 'plate', phase: 'pre_solve' },
      ])
    );
    const [frame, plate] = resultsStore.structuredDiagnostics;
    expect(frame.elementIds).toEqual([4]);
    expect(frame.shellKeys).toBeUndefined();
    expect(plate.shellKeys).toEqual(['p4']);
    expect(plate.elementIds).toBeUndefined();
  });

  it('leaves out the solve\u2019s own run notes, which describe the run and not the model', () => {
    resultsStore.setResults(
      resultsWith([
        { code: 'dense_lu', severity: 'info', message: 'Dense solver (3 free DOFs)', phase: 'solve' },
        { code: 'residual_ok', severity: 'info', message: 'Residual 1.07e-15', phase: 'solve', value: 1.07e-15, threshold: 1e-6 },
        { code: 'high_diagonal_ratio', severity: 'warning', message: 'Diagonal ratio …', phase: 'conditioning' },
      ])
    );
    expect(resultsStore.structuredDiagnostics).toEqual([]);
  });

  it('marks them as describing the model', () => {
    resultsStore.setResults(
      resultsWith([
        {
          code: 'disconnected_node',
          severity: 'warning',
          message: 'Node 3 is isolated (not connected to any element)',
          nodeIds: [3],
          phase: 'pre_solve',
        },
      ])
    );

    expect(resultsStore.structuredDiagnostics[0].source).toBe('model');
  });

  it('keeps the numbers behind a diagnostic, not just its sentence', () => {
    resultsStore.setResults(
      resultsWith([
        {
          code: 'poor_jacobian_ratio',
          severity: 'warning',
          message: 'Quad 2 has poor Jacobian ratio 0.040 (threshold 0.1)',
          elementIds: [2],
          phase: 'pre_solve',
          value: 0.04,
          threshold: 0.1,
        },
      ])
    );

    // Only what the diagnostic carries: no `dofIndices: undefined`, and the
    // phase — the same for every finding — is not repeated in each row.
    expect(resultsStore.structuredDiagnostics[0].details).toEqual({ value: 0.04, threshold: 0.1 });
  });

  it('reports nothing when the engine sent nothing', () => {
    resultsStore.setResults(resultsWith(undefined));
    expect(resultsStore.structuredDiagnostics).toEqual([]);

    resultsStore.setResults(resultsWith([]));
    expect(resultsStore.structuredDiagnostics).toEqual([]);
  });
});
