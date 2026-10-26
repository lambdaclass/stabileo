/**
 * Support moments at the column's face (§9.4.2.1). A 3 m cantilever beam out of a 0.30 × 0.40 m
 * column: the face sits half the column's extent along the beam from the node, 0.15 or 0.20 m as
 * the column turns, and under a uniform load the hogging the beam is checked for is the moment
 * there, q·(L − a)²/2, a fraction ((L − a)/L)² of the node's.
 *
 * The beam carries bars given here rather than designed: the moment a section is checked for does
 * not depend on the bars, and a 3 m cantilever's 90 kN·m root has no top arrangement whose hooks
 * this column holds (`end-support-anchorage.ts`), so the design refuses it.
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

function cantilever(roll: number) {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '30×40', a: 0.12, iy: 0.0016, iz: 0.0009, j: 0.0019, b: 0.3, h: 0.4, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '25×50', a: 0.125, iy: 0.0026, iz: 0.00065, j: 0.0017, b: 0.25, h: 0.5, shape: 'rect' } as never);
  const base = modelStore.addNode(0, 0, 0), top = modelStore.addNode(0, 0, 3), tip = modelStore.addNode(3, 0, 3);
  modelStore.addSupport(base, 'fixed3d' as never);
  const c = modelStore.addElement(base, top, 'frame');
  modelStore.updateElementMaterial(c, mat); modelStore.updateElementSection(c, col);
  if (roll) modelStore.rotateElementLocalAxes(c, roll);
  const b = modelStore.addElement(top, tip, 'frame');
  modelStore.updateElementMaterial(b, mat); modelStore.updateElementSection(b, beam);
  modelStore.addDistributedLoad3D(b, 0, 0, -20, -20, undefined, undefined, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  modelStore.reinforcementTransaction((api) => api.setReinforcement(b, {
    regions: {
      bottomSpanLayers: [{ count: 2, diameter: 12, row: 0 }], bottomSpan: { count: 2, diameter: 12 },
      topStartLayers: [{ count: 4, diameter: 16, row: 0 }], topStart: { count: 4, diameter: 16 },
      topEndLayers: [{ count: 2, diameter: 12, row: 0 }], topEnd: { count: 2, diameter: 12 },
      stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
    },
  } as never));
  return b;
}

describe('support moments at the column face', () => {
  it('the face follows the column extent along the beam, and the hogging is taken there', () => {
    const faces: number[] = [];
    for (const roll of [0, 90]) {
      const b = cantilever(roll);
      const ctx = verificationStore.contextFor(b)!;
      const cs = ctx.criticalSections!;
      const a = cs.start.tFace * cs.L;
      faces.push(+a.toFixed(3));
      const hog = verificationStore.providedFor(b)!.checks.find((c) => c.category.startsWith('Top Start') && c.demand !== undefined)!;
      // The node's hogging, from the design demands: the largest |M| at the start.
      const node = Math.max(...[...ctx.demands!.demands].filter((d) => d.category.endsWith('-')).map((d) => Math.abs(d.value)));
      const ratio = ((3 - a) / 3) ** 2;
      // The chord between the stations either side of the face sits just above the parabola.
      expect(hog.demand! / node).toBeGreaterThanOrEqual(ratio - 1e-6);
      expect(hog.demand! / node).toBeLessThan(ratio * 1.01);
    }
    expect(faces.sort()).toEqual([0.15, 0.2]);
  });
});
