import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../../../store';
import { designRunStore } from '../../../store/design-run.svelte';
import { verificationStore } from '../../../store/verification.svelte';
import * as wasmSolver from '../../wasm-solver';
import { stateSuiteCovers } from '../../../store/__tests__/suite-covers';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

describe('torsion in the design of a beam', () => {
  it('checks both regions and refuses longitudinal torsion without perimeter evidence', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    stateSuiteCovers();
    const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const sec = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.0054, iz: 0.00135, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(6, 0, 3);
    modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(b, 'pinned3d' as never);
    const e1 = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(e1, mat); modelStore.updateElementSection(e1, sec);
    modelStore.addDistributedLoad3D(e1, 0, 0, -30, -30, undefined, undefined, 1);
    // A torque at the pinned end, free to turn about the axis: carried whole to the fixed end.
    modelStore.addNodalLoad3D(b, 0, 0, 0, 20, 0, 0, 1);
    const combo = modelStore.solveCombinations3D(false, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    expect(designRunStore.computeDemands().ok).toBe(true);
    expect(designRunStore.autoDesign([e1]).ok).toBe(true);
    const o = verificationStore.outcomeFor(e1);
    expect(o?.outcome, JSON.stringify(o?.reasons)).toBe('SEARCH_EXHAUSTED');
    expect(o?.reasons).toContainEqual({ key: 'diag.rcTorsionPerimeter' });
    expect(o?.accepted).toBeUndefined();
    expect(o?.certificate).toBeUndefined();
    expect(verificationStore.providedFor(e1)).toBeNull();
    const checks = o!.provisional!.verdict.checks;
    for (const region of ['Support', 'Span']) {
      const transverse = checks.find(c => c.category === `Torsion ${region} (Vz)`);
      expect(transverse).toMatchObject({ status: 'fail', limiting: 'torsion' });
      expect(transverse!.ratio).toBeGreaterThan(1 + 1e-9);
      expect(Number.isFinite(transverse!.ratio)).toBe(true);
      expect(checks.find(c => c.category === `Torsion Al ${region} (Vz)`)).toMatchObject({
        status: 'fail', ratio: Infinity, limiting: 'unsupportedCheck', description: 'diag.rcTorsionPerimeter',
      });
    }
  });
});
