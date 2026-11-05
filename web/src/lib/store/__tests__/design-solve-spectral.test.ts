/**
 * The solve the design runs between its resize rounds takes the spectral cases as the Solve does:
 * without their results, the combinations that take them were left out, and a resized model was
 * verified without its earthquake.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import { resultsStore } from '../results.svelte';
import '..';
import { initSolver } from '../../engine/wasm-solver';
import { solveNow } from '../../actions/solve';
import * as wasm from '../../engine/wasm-solver';
import { render } from 'svelte/server';
import ContainmentBanner from '../../../components/ContainmentBanner.svelte';
import { solveForDesign } from '../design-resize';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id); });
afterEach(() => { vi.restoreAllMocks(); uiStore.analysisMode = '3d'; });

describe('the design solve and the spectral cases', () => {
  it('keeps the combinations that take a spectral case', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed3d' as never);
    modelStore.addNodalLoad3D(b, 0, 0, -50, 0, 0, 0, 1);
    modelStore.setDynamics({ spectra: [{ id: 1, name: 'flat', ordinate: 'Sa', unit: 'g', interpolation: 'linear', points: [[0, 0.4], [5, 0.4]] }] });
    const E = modelStore.addLoadCase('Sismo X', 'E');
    modelStore.updateLoadCaseFields(E, { spectral: { source: { kind: 'user', spectrumId: 1 }, factors: { x: 1, y: 0, z: 0 }, rule: 'cqc', xi: 0.05, scale: 1 } as never });
    const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
    const plain = modelStore.addCombination('1.2D', [{ caseId: D, factor: 1.2 }]);
    const seismic = modelStore.addCombination('1.2D + E', [{ caseId: D, factor: 1.2 }, { caseId: E, factor: 1 }]);
    expect(solveForDesign()).toBe(true);
    expect(resultsStore.perCombo3D.has(plain)).toBe(true);
    expect(resultsStore.perCombo3D.has(seismic)).toBe(true);
  });
});


it('solveNow publishes modal and unit warnings in spectral cases, combinations and the viewport', async () => {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  modelStore.addElement(a, b);
  modelStore.addSupport(a, 'fixed3d' as never);
  modelStore.addNodalLoad3D(b, 0, 0, -50, 0, 0, 0, 1);
  modelStore.setDynamics({ spectra: [{ id: 1, name: 'flat', ordinate: 'Sa', unit: 'g', interpolation: 'linear', points: [[0, 0.4], [5, 0.4]] }] });
  const E = modelStore.addLoadCase('Sismo XY', 'E');
  modelStore.updateLoadCaseFields(E, { spectral: { source: { kind: 'user', spectrumId: 1 }, factors: { x: 1, y: 0.3, z: 0 }, rule: 'cqc', xi: 0.05, scale: 1 } as never });
  const combo = modelStore.addCombination('2E', [{ caseId: E, factor: 2 }]);
  const originalModal = wasm.solveModal3D;
  const originalSolve = wasm.solve3D;
  const warnings = [
    { code: 'known_issue', severity: 'warning', phase: 'MD-ORTHOGONALITY', value: 759, message: 'ENGINE' },
    { code: 'known_issue', severity: 'warning', phase: 'NL-DYNAMIC-GAPS', value: 370, message: 'ENGINE' },
  ] as const;
  vi.spyOn(wasm, 'solveModal3D').mockImplementation((...args) => {
    const result = originalModal(...args);
    if (typeof result === 'string') throw new Error(result);
    return { ...result, structuredDiagnostics: [...warnings] };
  });
  vi.spyOn(wasm, 'solve3D').mockImplementation((...args) => ({
    ...originalSolve(...args),
    structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'NUM-INVARIANCE', value: 762, message: 'ENGINE' }],
  }));
  expect(await solveNow()).toMatchObject({ ok: true });
  for (const result of [resultsStore.perCase3D.get(E), resultsStore.perCombo3D.get(combo)]) {
    expect(result?.structuredDiagnostics?.map(d => d.phase)).toEqual(expect.arrayContaining(['MD-ORTHOGONALITY', 'NL-DYNAMIC-GAPS', 'NUM-INVARIANCE']));
    expect(result?.structuredDiagnostics?.filter(d => d.phase === 'MD-ORTHOGONALITY')).toHaveLength(1);
  }
  const html = render(ContainmentBanner, { props: { disposition: resultsStore.knownIssues3D } }).body;
  for (const issue of [759, 370, 762]) expect(html).toContain('#' + issue);
});
