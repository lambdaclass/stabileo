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
  const toast = vi.spyOn(uiStore, 'toast');
  const result = await solveNow();
  expect(result.ok).toBe(false);
  if (!result.ok) { expect(result.error).toContain('#741'); expect(result.error).not.toContain('structuredDiagnostics'); }
  expect(resultsStore.perCombo.size + resultsStore.perCombo3D.size).toBe(0);
  expect(toast.mock.calls.some(([, kind]) => kind === 'success')).toBe(false);
});
it.each([false, true])('live solve clears prior combinations on string/throw refusal (3D=%s)', async is3D => {
  for (const throws of [false, true]) {
    uiStore.analysisMode = is3D ? 'pro' : '2d';
    if (is3D) {
      resultsStore.setResults3D(clean as never);
      resultsStore.setCombinationResults3D(new Map([[1, clean]]) as never, new Map([[1, clean]]) as never, null as never);
    } else {
      resultsStore.setResults(clean as never);
      resultsStore.setCombinationResults(new Map([[1, clean]]) as never, new Map([[1, clean]]) as never, null as never);
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
