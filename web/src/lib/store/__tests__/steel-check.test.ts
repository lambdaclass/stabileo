/**
 * Steel visible in the design: a steel beam's CIRSOC 301 utilisation reaches the verification
 * store, so the design table and the 3D view read it as they read a concrete member's.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../index';
import { verificationStore } from '../verification.svelte';
import { runSteelCheck } from '../steel-check';
import { amplifiedByCompression, runSteelVerification } from '../../engine/verification-service';
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

  it('#1551: a cantilever whose compression may amplify its linear moments holds every member, and a lighter one holds none', () => {
    const checkUnder = (fx: number) => {
      modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
      for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
      const mat = modelStore.addMaterial({ name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235, fu: 360 } as never);
      const sec = modelStore.addSection({ name: 'IPN 300', a: 69e-4, iy: 9800e-8, iz: 451e-8, h: 0.3, b: 0.125, tw: 0.0108, tf: 0.0162, j: 56.9e-8, shape: 'I' } as never);
      const base = modelStore.addNode(0, 0, 0);
      modelStore.addSupport(base, 'fixed3d' as never);
      const cantilever = (x: number, y: number, load: [number, number, number]) => {
        const tip = modelStore.addNode(x, y, 0);
        const e = modelStore.addElement(base, tip, 'frame');
        modelStore.updateElementMaterial(e, mat); modelStore.updateElementSection(e, sec);
        modelStore.addNodalLoad3D(tip, load[0], load[1], load[2], 0.5, 0, 0);
        return e;
      };
      const loaded = cantilever(3, 0, [fx, 1, -10]), quiet = cantilever(0, 3, [1, -10, -10]);
      const r = modelStore.solve3D(false, false, true);
      if (typeof r === 'string' || !r) throw new Error(String(r));
      resultsStore.setResults3D(r as never);
      expect(runSteelCheck()).toEqual({ checked: 2 });
      const second = (r as { structuredDiagnostics?: Array<{ phase?: string; elementIds?: number[] }> }).structuredDiagnostics?.filter((d) => d.phase?.startsWith('LIN-SECOND-ORDER')) ?? [];
      return { second, loaded: verificationStore.steelMap.get(loaded)!, quiet: verificationStore.steelMap.get(quiet)!, ids: [loaded, quiet] };
    };
    const hold = { check: 'interaction', clause: 'C.1', key: 'c301.refuse.firstOrderMoments', upperBound: false };
    const heavy = checkUnder(-100);
    const direct = runSteelVerification(resultsStore.results3D!, { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports } as never);
    expect(direct.map((v) => v.overallStatus)).toEqual(['held', 'held']);
    expect(heavy.second).toEqual([expect.objectContaining({ phase: 'LIN-SECOND-ORDER', elementIds: [heavy.ids[0]] })]);
    for (const v of [heavy.loaded, heavy.quiet]) {
      expect(v.overallStatus).toBe('held');
      expect(v.notEvaluated).toContainEqual(hold);
    }
    const light = checkUnder(-10);
    expect(light.second).toEqual([]);
    for (const v of [light.loaded, light.quiet]) {
      expect(v.notEvaluated ?? []).not.toContainEqual(expect.objectContaining({ key: 'c301.refuse.firstOrderMoments' }));
      expect(v.overallStatus).not.toBe('held');
    }
  });

  it('#1551: an unbounded critical load holds the checks, a case only near the limit does not', () => {
    const warning = (phase: string) => ({ structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase }] });
    expect(amplifiedByCompression([warning('LIN-SECOND-ORDER-UNBOUNDED')])).toBe(true);
    expect(amplifiedByCompression([{}, warning('LIN-SECOND-ORDER')])).toBe(true);
    expect(amplifiedByCompression([warning('LIN-SECOND-ORDER-NEAR'), warning('LIN-SMALL-DISPLACEMENT')])).toBe(false);
    expect(amplifiedByCompression([{ structuredDiagnostics: [{ code: 'singular_matrix', phase: 'LIN-SECOND-ORDER' }] }])).toBe(false);
  });
});
