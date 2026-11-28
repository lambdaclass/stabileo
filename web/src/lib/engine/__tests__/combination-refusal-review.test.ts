import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import { runLiveCalc } from '../live-calc';
import { solveNow } from '../../actions/solve';
import * as wasm from '../wasm-solver';
import { spectralCaseResults } from '../../store/spectral-cases';
const refusal = JSON.stringify({ structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'ENGINE' }] });
const clean = { displacements: [], reactions: [], elementForces: [] };
beforeEach(() => {
  modelStore.clear(); resultsStore.clear(); uiStore.loadCasesEnabled = true; uiStore.includeSelfWeight = false;
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
  modelStore.addElement(a, b); modelStore.addSupport(a, 'fixed3d');
});
afterEach(() => { vi.restoreAllMocks(); resultsStore.clear(); uiStore.loadCasesEnabled = false; });
it.each([false, true])('manual solve reports combination refusal and clears old combinations (3D=%s)', async is3D => {
  uiStore.analysisMode = is3D ? 'pro' : '2d';
  vi.spyOn(modelStore, 'solve').mockReturnValue(clean as never);
  vi.spyOn(modelStore, 'solveCombinations').mockReturnValue(refusal);
  vi.spyOn(modelStore, 'solveCombinations3DParallel').mockResolvedValue(refusal);
  const prior = { ...clean, displacements: [{ nodeId: 2, ux: 987654, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }] };
  if (is3D) {
    resultsStore.setResults3D(clean as never);
    resultsStore.setCombinationResults3D(new Map([[1, prior]]) as never, new Map([[1, prior]]) as never, null);
  } else {
    resultsStore.setResults(clean as never);
    resultsStore.setCombinationResults(new Map([[1, prior]]) as never, new Map([[1, prior]]) as never, null);
  }
  resultsStore.activeComboId = 1; resultsStore.activeView = 'combo';
  expect(is3D ? resultsStore.perCombo3D.size : resultsStore.perCombo.size).toBe(1);
  const toast = vi.spyOn(uiStore, 'toast');
  const result = await solveNow();
  expect(result.ok).toBe(false);
  if (!result.ok) { expect(result.error).toContain('#741'); expect(result.error).not.toContain('structuredDiagnostics'); }
  expect(resultsStore.perCombo.size + resultsStore.perCombo3D.size + resultsStore.perCase.size + resultsStore.perCase3D.size).toBe(0);
  expect(JSON.stringify([is3D ? resultsStore.results3D : resultsStore.results, resultsStore.envelope, resultsStore.envelope3D])).not.toContain('987654');
  expect(toast.mock.calls.some(([, kind]) => kind === 'success')).toBe(false);
});
it.each([false, true])('live solve clears prior combinations on string/throw refusal (3D=%s)', async is3D => {
  for (const throws of [false, true]) {
    uiStore.analysisMode = is3D ? 'pro' : '2d';
    if (is3D) {
      resultsStore.setResults3D(clean as never);
      resultsStore.setCombinationResults3D(new Map([[1, clean]]) as never, new Map([[1, clean]]) as never, null);
    } else {
      resultsStore.setResults(clean as never);
      resultsStore.setCombinationResults(new Map([[1, clean]]) as never, new Map([[1, clean]]) as never, null);
    }
    resultsStore.activeComboId = 1; resultsStore.activeView = 'combo';
    expect(is3D ? resultsStore.perCombo3D.size : resultsStore.perCombo.size).toBe(1);
    vi.spyOn(modelStore, 'solveAsync').mockResolvedValue(clean as never);
    vi.spyOn(modelStore, 'solve3DAsync').mockResolvedValue(clean as never);
    vi.spyOn(modelStore, is3D ? 'solveCombinations3D' : 'solveCombinations').mockImplementation(() => { if (throws) throw refusal; return refusal; });
    await runLiveCalc(is3D ? 'pro' : '2d', 'rightHand');
    expect(uiStore.liveCalcError).toContain('#741');
    expect(uiStore.liveCalcError).not.toContain('structuredDiagnostics');
    expect(resultsStore.perCombo.size + resultsStore.perCombo3D.size).toBe(0);
  }
});
it.each([false, true])('spectral case modal refusal is localized at the store boundary (throws=%s)', throws => {
  const id = modelStore.addLoadCase('E', 'E');
  modelStore.updateLoadCaseFields(id, { spectral: { source: { kind: 'code' }, factors: { x: 1, y: 0, z: 0 }, rule: 'cqc', xi: 0.05, scale: 1 } as never });
  vi.spyOn(wasm, 'solveModal3D').mockImplementation(() => { if (throws) throw refusal; return refusal as never; });
  const result = spectralCaseResults();
  expect(result).toContain('#741'); expect(result).not.toContain('structuredDiagnostics');
});
it('one refused case withholds every per-case result, since consumers sum over the cases (fire, footings, drift)', () => {
  uiStore.analysisMode = 'pro';
  const refused = { ...clean, ...JSON.parse(refusal) };
  resultsStore.setResults3D(clean as never);
  resultsStore.setCombinationResults3D(new Map([[1, clean], [2, refused]]) as never, new Map() as never, null);
  expect(resultsStore.perCase3D.size).toBe(0);
  expect(resultsStore.caseDisposition3D([1]).refused).toBe(false);
  expect(resultsStore.caseDisposition3D([2]).refused).toBe(true);
  expect(resultsStore.caseDisposition3D([1, 2]).messages.join(' ')).toContain('#741');
});

it.each([false, true])('empty combination publication has no envelope or selected result (3D=%s)', space => {
  resultsStore.clear();
  const combos = new Map([[4, clean]]) as never;
  if (space) resultsStore.setCombinationResults3D(new Map(), combos, { maxAbsResults3D: clean } as never);
  else resultsStore.setCombinationResults(new Map(), combos, { maxAbsResults: clean } as never);
  resultsStore.activeView = 'combo';
  expect(space ? resultsStore.envelope3D : resultsStore.envelope).toBeTruthy();
  expect(space ? resultsStore.results3D : resultsStore.results).toMatchObject(clean);
  if (space) resultsStore.setCombinationResults3D(new Map(), new Map(), null);
  else resultsStore.setCombinationResults(new Map(), new Map(), null);
  expect(space ? resultsStore.results3D : resultsStore.results).toBeNull();
  expect(space ? resultsStore.envelope3D : resultsStore.envelope).toBeNull();
  expect(resultsStore.activeComboId).toBeNull();
  expect(resultsStore.activeView).toBe('single');
});

it.each([false, true])('selects the published case or combination when it is the only result (3D=%s)', space => {
  for (const view of ['single', 'combo'] as const) {
    resultsStore.clear();
    const pc = new Map(view === 'single' ? [[3, clean]] : []);
    const pco = new Map(view === 'combo' ? [[4, clean]] : []);
    if (space) resultsStore.setCombinationResults3D(pc as never, pco as never, null);
    else resultsStore.setCombinationResults(pc as never, pco as never, null);
    expect(space ? resultsStore.results3D : resultsStore.results).toMatchObject(clean);
    expect(resultsStore.activeView).toBe(view);
    expect(view === 'single' ? resultsStore.activeCaseId : resultsStore.activeComboId).toBe(view === 'single' ? 3 : 4);
  }
});

it('selects an individually usable space case when its combination is refused', () => {
  resultsStore.clear();
  const rejected = { ...clean, ...JSON.parse(refusal) };
  resultsStore.setCombinationResults3D(new Map([[5, clean]]) as never, new Map([[4, rejected]]) as never, null);
  expect(resultsStore.activeCaseId).toBe(5);
  expect(resultsStore.activeView).toBe('single');
  expect(resultsStore.results3D).toMatchObject(clean);
  expect(resultsStore.perCombo3D.size).toBe(0);
});
