import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { initSolver } from '../wasm-solver';
import { runGlobalSolve } from '../live-calc';
import { modelStore, resultsStore, uiStore } from '../../store';
import { t } from '../../i18n';
import { readSolverDiagnostic } from '../engine-diagnostics';

beforeAll(initSolver);
beforeEach(() => {
  modelStore.clear();
  resultsStore.clear();
  resultsStore.clear3D();
  for (const item of [...uiStore.toasts]) uiStore.dismissToast(item.id);
});
afterEach(() => { vi.restoreAllMocks(); uiStore.analysisMode = '2d'; });

function cantilever(spatial: boolean) {
  const fixed = modelStore.addNode(0, 0, 0), tip = modelStore.addNode(5, 0, 0);
  const member = modelStore.addElement(fixed, tip, 'frame');
  modelStore.addSupport(fixed, 'fixed');
  if (spatial) {
    const sectionId = modelStore.addSection({ name: 'Conditioning fixture', a: 1e3, iy: 1e-12, iz: 1e-12, j: 1e-12 });
    modelStore.updateElement(member, { sectionId });
    modelStore.updateMaterial(1, { e: 200_000, nu: 0.3 });
    modelStore.addNodalLoad3D(tip, 0, 0, -1, 0, 0, 0, 1);
  }
}

it.skip.each(['3d', 'pro'] as const)('known wrong result: #1928 a completed %s solve delivers the conditioning warning with the available feedback', async mode => {
  uiStore.analysisMode = mode;
  cantilever(true);
  for (const combo of [...modelStore.model.combinations]) modelStore.removeCombination(combo.id);
  for (const combination of [false, true]) {
    if (combination) modelStore.addCombination('Applied', [{ caseId: 1, factor: 1 }]);
    for (const item of [...uiStore.toasts]) uiStore.dismissToast(item.id);
    const outcome = await runGlobalSolve({ directBase: true });
    expect(outcome.ok).toBe(true);
    const warning = resultsStore.results3D?.solverDiagnostics?.find(w => w.severity === 'warning');
    if (!warning) throw new Error('missing conditioning warning in the actual solver result');
    const display = readSolverDiagnostic(warning, t).message;
    expect.soft(uiStore.toasts.some(item => item.message === display)).toBe(!__PUBLIC_FEATURES__.proPlatesUnified);
  }
});

it.skip('known wrong result: #1928 a completed 2D manual solve delivers a returned warning without displaying informational diagnostics', async () => {
  uiStore.analysisMode = '2d';
  cantilever(false);
  const original = modelStore.solveAsync.bind(modelStore);
  vi.spyOn(modelStore, 'solveAsync').mockImplementation(async (...args) => {
    const r = await original(...args);
    if (!r || typeof r === 'string') return r;
    return { ...r, solverDiagnostics: [
      { source: 'solver', severity: 'warning', code: 'WARN', message: 'Reported planar warning' },
      { source: 'solver', severity: 'info', code: 'INFO', message: 'Reported planar solver path' },
    ] };
  });
  expect((await runGlobalSolve()).ok).toBe(true);
  expect(uiStore.toasts.some(item => item.message === 'Reported planar warning')).toBe(!__PUBLIC_FEATURES__.proPlatesUnified);
  expect(uiStore.toasts.some(item => item.message === 'Reported planar solver path')).toBe(false);
});
