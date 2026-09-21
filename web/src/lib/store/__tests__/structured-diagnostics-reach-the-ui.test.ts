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
 * as-is, and `source` says 'model' so the PRO panel dedupes them against
 * `checkModel`'s own findings instead of reporting the same thing twice.
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
        },
      ])
    );

    const [d] = resultsStore.structuredDiagnostics;
    expect(d.severity).toBe('error');
    expect(d.code).toBe('negative_jacobian');
    expect(d.message).toContain('collapsed');
    expect(d.elementIds).toEqual([7]);
  });

  it('marks them as describing the model, so they dedupe against checkModel', () => {
    resultsStore.setResults(
      resultsWith([
        {
          code: 'disconnected_node',
          severity: 'warning',
          message: 'Node 3 is isolated (not connected to any element)',
          nodeIds: [3],
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

    expect(resultsStore.structuredDiagnostics[0].details).toMatchObject({
      phase: 'pre_solve',
      value: 0.04,
      threshold: 0.1,
    });
  });

  it('reports nothing when the engine sent nothing', () => {
    resultsStore.setResults(resultsWith(undefined));
    expect(resultsStore.structuredDiagnostics).toEqual([]);

    resultsStore.setResults(resultsWith([]));
    expect(resultsStore.structuredDiagnostics).toEqual([]);
  });
});
