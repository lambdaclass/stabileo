/**
 * Steel visible in the design: a steel beam's CIRSOC 301 utilisation reaches the verification
 * store, so the design table and the 3D view read it as they read a concrete member's.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../index';
import { verificationStore } from '../verification.svelte';
import { runSteelCheck } from '../steel-check';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

describe('the steel check in the design', () => {
  it('a loaded IPE 200 reads its utilisation, and more load reads more', () => {
    const ratioUnder = (q: number) => {
      modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
      for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
      const mat = modelStore.addMaterial({ name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235, fu: 360 } as never);
      const sec = modelStore.addSection({ name: 'IPE 200', a: 28.5e-4, iy: 1943e-8, iz: 142e-8, h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, j: 6.98e-8, shape: 'I' } as never);
      const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(5, 0, 3);
      modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(b, 'pinned3d' as never);
      const e = modelStore.addElement(a, b, 'frame');
      modelStore.updateElementMaterial(e, mat); modelStore.updateElementSection(e, sec);
      modelStore.addDistributedLoad3D(e, 0, 0, -q, -q, undefined, undefined, 1);
      const r = modelStore.solve3D(false, false, true);
      if (typeof r === 'string' || !r) throw new Error(String(r));
      resultsStore.setResults3D(r as never);
      expect(runSteelCheck()).toEqual({ checked: 1 });
      return { u: verificationStore.getDisplayRatio(e)!, s: verificationStore.getDisplayStatus(e) };
    };
    const low = ratioUnder(2), high = ratioUnder(20);
    expect(low.u).toBeGreaterThan(0);
    expect(high.u).toBeGreaterThan(low.u * 5);
    expect(low.s).toBe('ok');
    expect(['warn', 'fail']).toContain(high.s);
  });

  it('#1551: a cantilever whose compression may amplify its linear moments is held, not passed, and a lighter one is not', () => {
    const checkUnder = (fx: number) => {
      modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
      for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
      const mat = modelStore.addMaterial({ name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235, fu: 360 } as never);
      const sec = modelStore.addSection({ name: 'IPN 300', a: 69e-4, iy: 9800e-8, iz: 451e-8, h: 0.3, b: 0.125, tw: 0.0108, tf: 0.0162, j: 56.9e-8, shape: 'I' } as never);
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
      modelStore.addSupport(a, 'fixed3d' as never);
      const e = modelStore.addElement(a, b, 'frame');
      modelStore.updateElementMaterial(e, mat); modelStore.updateElementSection(e, sec);
      modelStore.addNodalLoad3D(b, fx, 1, -10, 0.5, 0, 0);
      const r = modelStore.solve3D(false, false, true);
      if (typeof r === 'string' || !r) throw new Error(String(r));
      resultsStore.setResults3D(r as never);
      expect(runSteelCheck()).toEqual({ checked: 1 });
      const phases = (r as { structuredDiagnostics?: Array<{ phase?: string }> }).structuredDiagnostics?.map((d) => d.phase) ?? [];
      return { phases, v: verificationStore.steelMap.get(e)! };
    };
    const heavy = checkUnder(-100);
    expect(heavy.phases).toContain('LIN-SECOND-ORDER');
    expect(heavy.v.overallStatus).toBe('held');
    expect(heavy.v.notEvaluated).toContainEqual({ check: 'interaction', clause: 'C.1', key: 'c301.refuse.firstOrderMoments', upperBound: false });
    const light = checkUnder(-10);
    expect(light.phases).not.toContain('LIN-SECOND-ORDER');
    expect(light.v.notEvaluated ?? []).not.toContainEqual(expect.objectContaining({ key: 'c301.refuse.firstOrderMoments' }));
    expect(light.v.overallStatus).not.toBe('held');
  });
});
