/**
 * CIRSOC 201-2025 Tabla 24.2.2: each limit reads its own deflection.
 *
 * A simply supported H-25 beam, 0.30 × 0.60 m, 6 m, 4Ø20 bottom, D = 15 kN/m and L = 10 kN/m.
 * Mcr = fr·Ig/yt = 0.62·√25·10³ · 0.0054 / 0.30 = 55.8 kN·m (§19.2.3.1), (2/3)Mcr = 37.2 kN·m;
 * Ma(D) = 15·6²/8 = 67.5 kN·m and Ma(D + L) = 25·6²/8 = 112.5 kN·m, both cracked (§24.2.3.5).
 * δ(w) = 5·w·L⁴ / (384·Ec·Ie(w)), each load level on its own Ie.
 *   ℓ/360 (floors, not attached): the immediate deflection due to L = δ(D + L) − δ(D).
 *   ℓ/480 (attached, damageable): λΔ·δ(D + L) + [δ(D + L) − δ(D)], all of L taken as sustained.
 * Ie(D) and Ie(D + L) by Bischoff give δ(D) = 4.190 mm, δ(D + L) = 8.005 mm.
 * Before, every row read (1 + λΔ)·δ(D + L) = 3 · 8.005 = 24.02 mm against L/n:
 *   ℓ/360: 24.02 against 16.67 mm, ratio 1.441, fail. After: 8.005 − 4.190 = 3.815 mm, ratio 0.229, ok.
 *   ℓ/480: 24.02 against 12.50 mm, ratio 1.921, fail. After: 2·8.005 + 3.815 = 19.82 mm, ratio 1.586, fail.
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

function beam(n: number): number {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
  const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 0, fy: 25, fc: 25 });
  const sec = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.0054, iz: 0.00135, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
  const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(6, 0, 3);
  modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(b, 'pinned3d' as never);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementMaterial(e, mat); modelStore.updateElementSection(e, sec);
  modelStore.updateElement(e, { releaseI: { my: true, mz: false, t: false } } as never);
  modelStore.addDistributedLoad3D(e, 0, 0, -15, -15, undefined, undefined, 1); // D
  modelStore.addDistributedLoad3D(e, 0, 0, -10, -10, undefined, undefined, 2); // L
  modelStore.reinforcementTransaction((api) => api.setReinforcement(e, { regions: { bottomSpanLayers: [{ count: 4, diameter: 20, row: 0 }], topStartLayers: [{ count: 2, diameter: 12, row: 0 }], topEndLayers: [{ count: 2, diameter: 12, row: 0 }] } } as never));
  modelStore.setDeflectionLimits({ rules: [{ id: 1, scope: { kind: 'memberKind', value: 'beam' }, n, direction: 'resultant' }] });
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  return e;
}

// Hand calculation.
const Ec = 23.5e6; // kPa
const d = 0.6 - 0.025 - 0.008 - 0.01;
const Icr = crackedInertia({ b: 0.3, h: 0.6, d, dPrime: 0.041, As: 4 * Math.PI * 0.01 ** 2, AsPrime: 0, n: 200000 / 23500 }).Icr;
const Mcr = crackingMoment(0.3, 0.6, 25);
const IeD = effectiveInertia(0.0054, Icr, Mcr, 67.5);
const IeDL = effectiveInertia(0.0054, Icr, Mcr, 112.5);
const delta = (w: number, Ie: number) => 5 * w * 6 ** 4 / (384 * Ec * Ie);
const dD = delta(15, IeD), dDL = delta(25, IeDL);

describe('Tabla 24.2.2: the deflection each limit reads', () => {
  it('the hand calculation', () => {
    expect(Mcr).toBeCloseTo(55.8, 9);
    expect(IeD).toBeLessThan(0.0054);
    expect(IeDL).toBeLessThan(IeD);
    expect(dD * 1000).toBeCloseTo(4.190, 3);
    expect(dDL * 1000).toBeCloseTo(8.005, 3);
  });

  it('ℓ/360: the immediate deflection due to L, δ(D + L) − δ(D)', () => {
    const e = beam(360);
    const row = deflectionChecks([e]).rows.get(e)!;
    expect(row.reading).toBe('immediateLive');
    expect(row.check.deltaTotal).toBeCloseTo(dDL - dD, 5);
    expect(row.check.limit).toBeCloseTo(6 / 360, 12);
    expect(row.check.ratio).toBeCloseTo(0.229, 3);
    expect(row.check.status).toBe('ok');
  });

  it('ℓ/480: the part after attachment, λΔ·δ(D + L) + δ(D + L) − δ(D)', () => {
    const e = beam(480);
    const row = deflectionChecks([e]).rows.get(e)!;
    expect(row.reading).toBe('afterAttachment');
    expect(row.cracked!.lambda).toBe(2);
    expect(row.check.deltaTotal).toBeCloseTo(2 * dDL + (dDL - dD), 5);
    expect(row.check.limit).toBeCloseTo(6 / 480, 12);
    expect(row.check.ratio).toBeCloseTo(1.586, 3);
    expect(row.check.status).toBe('fail');
  });
});
