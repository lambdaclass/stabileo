/**
 * A clean model has no model findings, and a finding's numbers read as numbers.
 *
 * Every solve appends its own run notes to `structuredDiagnostics` — the
 * factorization it used, its residual. Passed through as model findings, a
 * clean cantilever showed "Diagnostics (2)" in Basic. Solved here through the
 * store entry points the app uses, so the list is the engine's real output.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { initSolver } from '../../engine/wasm-solver';
import { checkModel } from '../../engine/model-diagnostics';
import { formatDetails } from '../../engine/model-findings';
import type { AnalysisResults } from '../../engine/types';
import type { AnalysisResults3D } from '../../engine/types-3d';

/** Drop the default empty load cases so checkModel has nothing to say (a genuinely clean model). */
function dropEmptyCases(): void {
  for (const c of [...modelStore.model.loadCases]) if (c.id !== 1) modelStore.removeLoadCase(c.id);
}

function clean2D(): void {
  modelStore.clear();
  const n1 = modelStore.addNode(0, 0);
  const n2 = modelStore.addNode(6, 0);
  modelStore.addElement(n1, n2, 'frame');
  modelStore.addSupport(n1, 'fixed');
  modelStore.addNodalLoad(n2, 0, -10);
  dropEmptyCases();
}

function clean3D(): void {
  modelStore.clear();
  const n1 = modelStore.addNode(0, 0, 0);
  const n2 = modelStore.addNode(5, 0, 0);
  modelStore.addElement(n1, n2, 'frame');
  modelStore.addSupport(n1, 'fixed3d');
  modelStore.addNodalLoad3D(n2, 0, 0, -10, 0, 0, 0);
  dropEmptyCases();
}

function modelCheck() {
  return checkModel({
    nodes: modelStore.nodes, elements: modelStore.elements, materials: modelStore.materials,
    sections: modelStore.sections, supports: modelStore.supports, loads: modelStore.loads as any,
    loadCases: modelStore.model.loadCases, plates: modelStore.model.plates, quads: modelStore.model.quads,
    connectors: modelStore.model.connectors, constraints: modelStore.model.constraints,
  });
}

describe('a clean model must not show engine run telemetry as model findings', () => {
  beforeEach(async () => { await initSolver(); });

  it('2D (Basic, modelStore.solve → setResults): clean cantilever yields no model diagnostics', () => {
    clean2D();
    const r = modelStore.solve(false, 'xy');
    expect(typeof r).not.toBe('string');
    const res = r as AnalysisResults;
    resultsStore.setResults(res);

    // Pre-PR sources are all empty for this model: the tab/no-issues state was clean before.
    expect(modelCheck()).toEqual([]);
    expect(resultsStore.diagnostics).toEqual([]);
    expect(resultsStore.solverDiagnostics).toEqual([]);

    // ResultsTable's merged count (diagnostics + solverDiagnostics + structuredDiagnostics)
    const tableCount = resultsStore.diagnostics.length + resultsStore.solverDiagnostics.length
      + resultsStore.structuredDiagnostics.length;
    expect(resultsStore.structuredDiagnostics).toEqual([]);
    expect(tableCount).toBe(0);
  });

  it('3D (PRO, modelStore.solve3D isPro → setResults3D): clean cantilever yields no model diagnostics', () => {
    clean3D();
    const r = modelStore.solve3D(false, false, true);
    expect(typeof r).not.toBe('string');
    const res = r as AnalysisResults3D;
    resultsStore.setResults3D(res);

    expect(modelCheck()).toEqual([]);
    expect(resultsStore.diagnostics3D).toEqual([]);

    // The gates found nothing, and the run notes are not findings. (PRO's
    // no-issues state is still held back by the legacy `solverDiagnostics3D`
    // "Dense solver" entry, which predates this PR and is tracked separately.)
    expect(resultsStore.structuredDiagnostics3D).toEqual([]);
  });
});

describe('details must not render "undefined" or collapse small values to 0.000', () => {
  beforeEach(async () => { await initSolver(); });

  it('a small value prints in exponent form, not as 0.000, and undefined keys never print', () => {
    expect(formatDetails({ value: 1.07e-15, threshold: 1e-6 })).toBe('value: 1.07e-15 | threshold: 1.00e-6');
    expect(formatDetails({ value: 0.04, threshold: 0.1 })).toBe('value: 0.040 | threshold: 0.100');
    expect(formatDetails({ value: 2, missing: undefined })).toBe('value: 2.000');
  });

  it('every mapped entry of a real solve has no undefined detail values', () => {
    clean3D();
    const r = modelStore.solve3D(false, false, true) as AnalysisResults3D;
    resultsStore.setResults3D(r);
    const withUndef = resultsStore.structuredDiagnostics3D
      .filter((d) => d.details && Object.values(d.details).some((v) => v === undefined))
      .map((d) => `${d.code}: ${formatDetails(d.details!)}`);
    expect(withUndef).toEqual([]);
  });
});
