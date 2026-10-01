import { beforeAll, beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '../index';
import { directAnalysis } from '../direct-analysis.svelte';
import { initSolver } from '../../engine/wasm-solver';
import { DEFAULT_DIRECT_SETTINGS } from '../../engine/direct-analysis';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear();
  directAnalysis.clear();
  directAnalysis.settings = { ...DEFAULT_DIRECT_SETTINGS };
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
  uiStore.axisConvention3D = 'rightHand';
});

function column() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
  modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  modelStore.addNodalLoad3D(b, 0, 0, -60, 0, 0, 0);
  return modelStore.addCombination('D', [{ caseId: 1, factor: 1 }]);
}

it('blocks the entire design when one active combination is unstable', async () => {
  const good = column();
  const bad = modelStore.addCombination('5D', [{ caseId: 1, factor: 5 }]);
  await directAnalysis.run();
  expect(directAnalysis.error).toBeNull();
  expect(directAnalysis.fresh).toBe(true);
  expect(directAnalysis.result!.perCombo.has(good)).toBe(true);
  expect(directAnalysis.result!.info.get(bad)?.stable).toBe(false);
  expect(directAnalysis.designReady).toBe(false);
  expect(directAnalysis.forces()).toBeNull();
  modelStore.setResultScopes({ active: [good] });
  await directAnalysis.run();
  expect(directAnalysis.designReady).toBe(true);
  expect([...directAnalysis.forces()!.keys()]).toEqual([good]);
});

it('blocks a nonconvergent run even when the drift check considers it stable', async () => {
  const id = column();
  directAnalysis.settings.maxIter = 1;
  await directAnalysis.run();
  expect(directAnalysis.result!.info.get(id)?.converged).toBe(false);
  expect(directAnalysis.result!.perCombo.has(id)).toBe(false);
  expect(directAnalysis.forces()).toBeNull();
});

it.each(['selfWeight', 'axes', 'notional', 'tauB', 'active', 'model'] as const)(
  'invalidates design when %s changes and accepts a new solve', async (setting) => {
    const id = column();
    await directAnalysis.run();
    expect(directAnalysis.designReady).toBe(true);
    switch (setting) {
      case 'selfWeight': uiStore.includeSelfWeight = true; break;
      case 'axes': uiStore.axisConvention3D = 'leftHand'; break;
      case 'notional': directAnalysis.settings.notional = .003; break;
      case 'tauB': directAnalysis.settings.tauB = 'unity'; break;
      case 'active': modelStore.setResultScopes({ active: [id] }); break;
      case 'model': modelStore.addNodalLoad3D(2, 0, 0, -1, 0, 0, 0); break;
    }
    expect(directAnalysis.fresh).toBe(false);
    expect(directAnalysis.forces()).toBeNull();
    await directAnalysis.run();
    expect(directAnalysis.designReady).toBe(true);
  },
);

it('does not publish as fresh when settings change during the solve', async () => {
  column();
  const pending = directAnalysis.run();
  expect(directAnalysis.forces()).toBeNull();
  uiStore.includeSelfWeight = true;
  await pending;
  expect(directAnalysis.result).not.toBeNull();
  expect(directAnalysis.fresh).toBe(false);
});

it('rejects missing forces and an empty active set', async () => {
  const id = column();
  await directAnalysis.run();
  directAnalysis.result!.perCombo.delete(id);
  expect(directAnalysis.forces()).toBeNull();
  modelStore.setResultScopes({ active: [] });
  await directAnalysis.run();
  expect(directAnalysis.error).toBe('noCombinations');
  expect(directAnalysis.result).toBeNull();
  expect(directAnalysis.forces()).toBeNull();
});
