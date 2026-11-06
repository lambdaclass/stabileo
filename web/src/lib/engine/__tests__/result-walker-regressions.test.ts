import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { combineResults, computeEnvelope, initSolver } from '../wasm-solver';
import { validateAndSolve2D, type ModelData } from '../solver-service';
import { knownIssueRefusal, knownIssueResultDisposition } from '../known-issues';
import { resultsStore } from '../../store';
import type { AnalysisResults } from '../types';

const issue = (severity: 'error' | 'warning') => ({ code: 'known_issue', severity, phase: 'NL-13', value: 432, message: `ENGINE ${severity}` });
const clean = { displacements: [], reactions: [], elementForces: [] };

afterEach(() => resultsStore.clear());

describe('#807 review: a moving-load full envelope is walked for refusals', () => {
  const envelope = (severity: 'error' | 'warning' | null) => ({
    structuredDiagnostics: [],
    elements: new Map(),
    positions: [{ refPosition: 0, results: { ...clean, structuredDiagnostics: [] } }],
    fullEnvelope: { maxAbsResults: { ...clean, structuredDiagnostics: severity ? [issue(severity)] : [] } },
    train: { name: 't', axles: [] },
    path: [],
  });
  it('withholds the envelope and reports the refusal', () => {
    expect(knownIssueResultDisposition(envelope('error')).refused).toBe(true);
    resultsStore.setMovingLoadEnvelope(envelope('error') as never);
    expect(resultsStore.movingLoadEnvelope).toBeNull();
    expect(resultsStore.knownIssues.refused).toBe(true);
  });
  it('keeps a warned envelope and its warning', () => {
    resultsStore.setMovingLoadEnvelope(envelope('warning') as never);
    expect(resultsStore.movingLoadEnvelope).not.toBeNull();
    expect(resultsStore.knownIssues.messages.join()).toContain('#432');
    resultsStore.clear();
    resultsStore.setMovingLoadEnvelope(envelope(null) as never);
    expect(resultsStore.knownIssues.messages).toEqual([]);
  });
});

describe('#807 review: a combination over a refused load case is withheld from every getter', () => {
  const refused = { ...clean, structuredDiagnostics: [issue('error')] };
  const combo = { ...clean, displacements: [{ nodeId: 1, ux: 987654, uz: 0, ry: 0 }], structuredDiagnostics: [] };
  it.each([false, true])('3D: %s', is3D => {
    if (is3D) {
      resultsStore.setResults3D(clean as never);
      resultsStore.setCombinationResults3D(new Map([[1, refused]]) as never, new Map([[2, combo]]) as never, { maxAbsResults3D: clean } as never);
    } else {
      resultsStore.setResults(clean as never);
      resultsStore.setCombinationResults(new Map([[1, refused]]) as never, new Map([[2, combo]]) as never, { maxAbsResults: clean } as never);
    }
    expect((is3D ? resultsStore.perCombo3D : resultsStore.perCombo).size).toBe(0);
    expect(is3D ? resultsStore.hasCombinations3D : resultsStore.hasCombinations).toBe(false);
    resultsStore.activeView = 'combo';
    resultsStore.activeComboId = 2;
    expect(JSON.stringify([resultsStore.results, resultsStore.results3D])).not.toContain('987654');
    expect((is3D ? resultsStore.knownIssues3D : resultsStore.knownIssues).refused).toBe(true);
  });
});

describe('#807 review: a combination keeps the known issues of its load cases', () => {
  const model: ModelData = {
    nodes: new Map([[1, { id: 1, x: 0, y: 0 } as never], [2, { id: 2, x: 5, y: 0 } as never]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } as never]]),
    materials: new Map([[1, { id: 1, e: 200_000_000, nu: 0.3 } as never]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 } as never]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' } as never]]),
    loads: [{ type: 'nodal', data: { id: 1, nodeId: 2, fx: 0, fz: -10, my: 0 } } as never],
  };
  let solved: AnalysisResults;
  beforeAll(async () => {
    await initSolver();
    const r = validateAndSolve2D(model);
    if (!r || typeof r === 'string') throw new Error(String(r));
    solved = r;
  });
  const cases = (severity: 'error' | 'warning') => new Map([[1, { ...solved, structuredDiagnostics: [issue(severity)] }], [2, solved]]);
  it('a warned case lends its warning to the combination and its envelope', () => {
    const combined = combineResults([{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }], cases('warning'))!;
    expect(knownIssueResultDisposition(combined).messages.join()).toContain('#432');
    expect(knownIssueResultDisposition(computeEnvelope([combined, solved])).messages.join()).toContain('#432');
    const without = combineResults([{ caseId: 1, factor: 0 }, { caseId: 2, factor: 1.6 }], cases('warning'))!;
    expect(knownIssueResultDisposition(without).messages).toEqual([]);
  });
  it('a refused case refuses the combination', () => {
    let error: unknown = null;
    try { combineResults([{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }], cases('error')); } catch (e) { error = e; }
    expect(knownIssueRefusal(error)).toContain('#432');
  });
});
