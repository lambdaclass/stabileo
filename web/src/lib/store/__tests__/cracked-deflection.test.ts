/**
 * A simply supported H-25 beam, 0.30 × 0.60 m, 6 m, 25 kN/m: Ma = qL²/8 = 112.5 kN·m, and the
 * deflection checked is the solver's gross-section one scaled by Iy/Ie, then by (1 + λΔ).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../index';
import { deflectionChecks } from '../serviceability';
import { crackedInertia, crackingMoment, effectiveInertia } from '../../codes/cirsoc201/effective-inertia';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

describe('a reinforced concrete beam deflects on its cracked section', () => {
  it('Ma is the span moment, Ie by Table 24.2.3.5, λΔ by its compression steel', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 0, fy: 25, fc: 25 });
    const sec = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.0054, iz: 0.00135, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(6, 0, 3);
    modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(b, 'pinned3d' as never);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(e, mat); modelStore.updateElementSection(e, sec);
    // Released at the fixed end about the depth, so it is simply supported in the vertical plane.
    modelStore.updateElement(e, { releaseI: { my: true, mz: false, t: false } } as never);
    modelStore.addDistributedLoad3D(e, 0, 0, -25, -25, undefined, undefined, 1);
    modelStore.reinforcementTransaction((api) => api.setReinforcement(e, { regions: { bottomSpanLayers: [{ count: 4, diameter: 20, row: 0 }], topStartLayers: [{ count: 2, diameter: 12, row: 0 }], topEndLayers: [{ count: 2, diameter: 12, row: 0 }] } } as never));
    // A project limit outside Tabla 24.2.2 (L/250) is read on the total long-term deflection,
    // (1 + λΔ)·δ: the reading this test is about. The table rows have their own test
    // (deflection-table-24-2-2.test.ts); under L/360 this D-only beam reads δ due to L = 0.
    modelStore.setDeflectionLimits({ rules: [{ id: 1, scope: { kind: 'memberKind', value: 'beam' }, n: 250, direction: 'resultant' }] });
    const combo = modelStore.solveCombinations3D(false, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    const row = deflectionChecks([e]).rows.get(e)!;
    expect(row.cracked).toBeDefined();
    expect(row.cracked!.Ma).toBeCloseTo(25 * 36 / 8, 1);
    const d = 0.6 - 0.025 - 0.008 - 0.01;
    const Icr = crackedInertia({ b: 0.3, h: 0.6, d, dPrime: 0.041, As: 4 * Math.PI * 0.01 ** 2, AsPrime: 0, n: 200000 / 23500 }).Icr;
    const Ie = effectiveInertia(0.0054, Icr, crackingMoment(0.3, 0.6, 25), 112.5);
    expect(row.cracked!.Ie).toBeCloseTo(Ie, 9);
    expect(row.cracked!.lambda).toBe(2); // the top bars stop at the supports: no ρ′ at midspan
    expect(row.check.deltaImm).toBeCloseTo(row.measured * 0.0054 / Ie, 9);
    expect(row.check.deltaTotal).toBeCloseTo(row.check.deltaImm * 3, 9);
    expect(row.check.deltaImm).toBeGreaterThan(row.measured);
    expect(row.reading).toBe('projectTotal');
    expect(row.check.limit).toBeCloseTo(6 / 250, 12);
  });
});
