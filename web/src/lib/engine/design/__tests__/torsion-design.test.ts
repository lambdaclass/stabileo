/**
 * A beam under torsion: the verifier checks it by §22.7 with its shear, and the search designs
 * stirrups that carry both. A beam 0.30 × 0.60 m, H-25, 6 m, fixed at one end and pinned at the
 * other, with 20 kN·m of torque at the pinned end: 28 kN·m factored all along, well over
 * φ·Tth = 5.6 kN·m.
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

describe('torsion in the design of a beam', () => {
  it('checked by §22.7 and designed for', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
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
    expect(o?.outcome, JSON.stringify(o?.reasons)).toBe('VERIFIED');
    const pv = verificationStore.providedFor(e1)!;
    const torsion = pv.checks.filter((c) => c.category.startsWith('Torsion'));
    expect(torsion.length).toBeGreaterThan(0);
    expect(torsion.every((c) => c.ratio <= 1 + 1e-9)).toBe(true);
    expect(verificationStore.outcomeFor(e1)?.outcome).toBe('VERIFIED');
  });
});
