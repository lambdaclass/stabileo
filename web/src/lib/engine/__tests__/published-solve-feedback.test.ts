import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../store';
import { createPlate, meshBeforeAnalysis } from '../../store/physical-plates';
import { runGlobalSolve } from '../live-calc';
import { initSolver } from '../wasm-solver';

beforeAll(initSolver);
beforeEach(() => {
  modelStore.clear();
  resultsStore.clear();
  for (const toast of [...uiStore.toasts]) uiStore.dismissToast(toast.id);
});
afterEach(() => { meshBeforeAnalysis.value = true; uiStore.analysisMode = '2d'; });

it.skip('known wrong result: #1928 the published solve keeps the unmeshed-plate refusal visible', async () => {
  uiStore.analysisMode = 'pro';
  const nodes = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  for (const id of nodes) modelStore.addSupport(id, 'fixed');
  const plate = createPlate({ outline: nodes, materialId: 1, thickness: 0.15 });
  if ('problem' in plate) throw Error(plate.problem);
  meshBeforeAnalysis.value = false;
  const outcome = await runGlobalSolve();
  if (outcome.ok) throw Error('unexpected successful unmeshed solve');
  expect(uiStore.toasts.filter(toast => toast.type === 'error' && toast.message === outcome.error)).toHaveLength(1);
  expect(resultsStore.results3D).toBeNull();
});

it.skip.each(['2d', 'pro'] as const)('known wrong result: #1928 the published %s solve reports a supported cantilever normally', async mode => {
  uiStore.analysisMode = mode;
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(2, 0, 0);
  modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed');
  const outcome = await runGlobalSolve();
  expect(outcome.ok).toBe(true);
  expect(uiStore.toasts.some(toast => toast.type === 'success')).toBe(true);
});
