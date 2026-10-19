/**
 * A roof joint checked for shear from the model (§15.4). A 3 m column 40×40 carrying a 5 m beam
 * 25×50 from one side, H-25: the column does not continue and the beam frames in from one side,
 * unconfined, so φVn = 0,75·1,0·√25·Aj with Aj = 0,40·0,40, 600 kN. Vu = |M|/jd − |Vcol| with
 * jd = 0,875·d, d = 0,50 − 0,025 − 0,008 − 0,01 = 0,457 m, M and Vcol read from the solve.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../../../store';
import { designRunStore } from '../../../store/design-run.svelte';
import { verificationStore } from '../../../store/verification.svelte';
import { jointChecks } from '../../../store/joint-checks';
import * as wasmSolver from '../../wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

describe('beam-column joints checked for shear', () => {
  it('a roof joint, one beam, unconfined', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.00213, iz: 0.00213, j: 0.0036, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const bs = modelStore.addSection({ name: '25×50', a: 0.125, iy: 0.0026, iz: 0.00065, j: 0.0017, b: 0.25, h: 0.5, shape: 'rect' } as never);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(5, 0, 3);
    modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(c, 'pinned3d' as never);
    const c1 = modelStore.addElement(a, b, 'frame'); modelStore.updateElementMaterial(c1, mat); modelStore.updateElementSection(c1, col);
    const b1 = modelStore.addElement(b, c, 'frame'); modelStore.updateElementMaterial(b1, mat); modelStore.updateElementSection(b1, bs);
    modelStore.addDistributedLoad3D(b1, 0, 0, -30, -30, undefined, undefined, 1);
    const combo = modelStore.solveCombinations3D(false, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    expect(designRunStore.computeDemands().ok).toBe(true);
    const js = jointChecks();
    const j = js.find((x) => x.nodeId === b && x.direction === 'X')!;
    expect(j.columnId).toBe(c1);
    expect(j.check.status).not.toBe('UNSUPPORTED');
    expect(j.check.phiVn).toBeCloseTo(600, 6);
    // By hand from the solve's own end forces, at the combination the check names.
    const jd = 0.875 * (0.5 - 0.025 - 0.008 - 0.01);
    const { activeCombinations, activePerCombo3D } = await import('../../../store/active-results');
    const cid = activeCombinations().find((x) => x.name === j.combo)!.id;
    const f = activePerCombo3D().get(cid)!.elementForces;
    const beamM = Math.abs(f.find((x) => x.elementId === b1)!.myStart);
    const colTop = f.find((x) => x.elementId === c1)!;
    const Vcol = Math.hypot(colTop.vyEnd, colTop.vzEnd);
    expect(beamM).toBeGreaterThan(10);
    expect(j.check.freeBody.tensions[0]!.T).toBeCloseTo(beamM / jd, 6);
    expect(j.check.Vu).toBeCloseTo(beamM / jd - Vcol, 6);
    expect(j.check.utilization).toBeCloseTo(Math.abs(j.check.Vu) / 600, 9);
  });
});
