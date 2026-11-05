import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store';
import { solveCombinations3DParallel } from '../solver-service';
import { expectMembraneRefusal } from './containment-helper';

const refusal = JSON.stringify({
  message: 'Results withheld: distorted MITC4 quadrilaterals can be about ten times too stiff in membrane bending. Remesh with rectangular elements and check mesh convergence (known issue #798, SH-MITC4-DISTORTION)',
  structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'SH-MITC4-DISTORTION', value: 798, message: 'Results withheld: distorted MITC4 quadrilaterals can be about ten times too stiff in membrane bending. Remesh with rectangular elements and check mesh convergence (known issue #798, SH-MITC4-DISTORTION)' }],
});
const envelope = vi.hoisted(() => ({ refuse: false }));
vi.mock('../wasm-solver', async (orig) => {
  const real = await orig<typeof import('../wasm-solver')>();
  return { ...real, computeEnvelope3D: (...a: Parameters<typeof real.computeEnvelope3D>) => { if (envelope.refuse) throw new Error(refusal); return real.computeEnvelope3D(...a); } };
});
import { initSolver } from '../wasm-solver';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; envelope.refuse = false;
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(6, 0, 0);
  const n3 = modelStore.addNode(0, 0, 4), n4 = modelStore.addNode(6, 0, 4);
  modelStore.addElement(n1, n3); const beam = modelStore.addElement(n3, n4); modelStore.addElement(n2, n4);
  for (const n of [n1, n2]) modelStore.addSupport(n, 'fixed3d');
  const D = modelStore.model.loadCases[0]!.id;
  modelStore.addDistributedLoad3D(beam, 0, 0, -20, -20, undefined, undefined, D);
  modelStore.addNodalLoad3D(n3, 15, 0, 0, 0, 0, 0, D);
  modelStore.addCombination('1.2D', [{ caseId: D, factor: 1.2 }]);
  modelStore.setAnalysis({ perCombination: 'pdelta' });
});

describe('a P-Δ combination envelope the engine withholds', () => {
  it.each(['sequential', 'parallel'] as const)('is returned as the refusal, not thrown (%s)', async (entry) => {
    const run = () => entry === 'sequential'
      ? modelStore.solveCombinations3D(false, false, true)
      : solveCombinations3DParallel(modelStore.model as never, modelStore.model.loadCases, modelStore.combinations, false, false);
    const clean = await run();
    expect(typeof clean === 'object' && clean !== null && clean.perCombo.size).toBe(1);
    envelope.refuse = true;
    let thrown: unknown = null, returned: unknown;
    try { returned = await run(); } catch (e) { thrown = e; }
    expect(thrown).toBeNull();
    expectMembraneRefusal(() => returned);
  });
});
