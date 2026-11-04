/**
 * A deep beam is designed with its skin bars and checked for them: 0.30 × 1.00 m, H-25, 8 m fixed
 * at both ends under 60 kN/m. Its supports hog, so each carries the minimum top steel of §9.6.1.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../../../store';
import { designRunStore } from '../../../store/design-run.svelte';
import { verificationStore } from '../../../store/verification.svelte';
import * as wasmSolver from '../../wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

describe('the skin of a deep beam', () => {
  it('designed and checked by §9.7.2.3', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const sec = modelStore.addSection({ name: '30×100', a: 0.3, iy: 0.025, iz: 0.00225, j: 0.0074, b: 0.3, h: 1.0, shape: 'rect' } as never);
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(8, 0, 3);
    modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(b, 'fixed3d' as never);
    const e1 = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(e1, mat); modelStore.updateElementSection(e1, sec);
    modelStore.addDistributedLoad3D(e1, 0, 0, -60, -60, undefined, undefined, 1);
    const combo = modelStore.solveCombinations3D(false, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    expect(designRunStore.computeDemands().ok).toBe(true);
    expect(designRunStore.autoDesign([e1]).ok).toBe(true);
    const o = verificationStore.outcomeFor(e1);
    expect(o?.outcome, JSON.stringify(o?.reasons)).toBe('VERIFIED');
    const rebar = modelStore.elements.get(e1)!.reinforcement!;
    expect(rebar.regions?.skin).toEqual({ diameter: 10, spacing: 0.275 });
    const check = verificationStore.providedFor(e1)!.checks.find((c) => c.category.startsWith('Skin'));
    expect(check?.ratio).toBeCloseTo(0.275 / 0.2975, 3);
  });
});

describe('the minimum top steel at a support (§9.6.1)', () => {
  it('checked where the support hogs', () => {
    // The same beam, 8 m fixed at both ends: the design meets the minimum at both supports.
    const e1 = [...modelStore.elements.keys()][0]!;
    const pv = verificationStore.providedFor(e1)!;
    const mins = pv.checks.filter((c) => c.category.includes('As,min §9.6.1'));
    expect(mins.map((c) => c.category.split(' (')[0])).toEqual(['Top Start', 'Top End']);
    for (const c of mins) expect(c.ratio).toBeLessThanOrEqual(1 + 1e-9);
  });
});
