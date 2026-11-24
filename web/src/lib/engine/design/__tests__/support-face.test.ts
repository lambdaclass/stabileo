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
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../../../store';
import { designRunStore } from '../../../store/design-run.svelte';
import { verificationStore } from '../../../store/verification.svelte';
import * as wasmSolver from '../../wasm-solver';
import * as anchorage from '../end-support-anchorage';
import * as candidates from '../../detailing/candidates';
import { prepareJointThreading } from '../joint-threading-check';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';

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
  it('reuses one support plan for reach, anchorage and hook tails within a verification', () => {
    const b = cantilever(0);
    const column = [...modelStore.elements.keys()].find(id => id !== b)!;
    const ctx = { ...verificationStore.contextFor(b)!, columnBars: new Map([[column, { count: 4, diameterMm: 16 }]]) };
    const rebar = modelStore.elements.get(b)!.reinforcement!;
    const input = anchorage.supportInputOf(ctx, rebar)!;
    const expected = anchorage.endSupportPlan(input);
    expect(anchorage.bottomReach(input, expected)).toEqual(anchorage.bottomReach(input));
    const threading = prepareJointThreading(ctx)(input, expected);
    expect(threading.length).toBeGreaterThan(0);
    const spy = vi.spyOn(anchorage, 'endSupportPlan');
    const tails = vi.spyOn(anchorage, 'hookTails');
    try {
      const result = cirsoc201Adapter.verify(ctx, rebar);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(result.supportAnchorage).toEqual(expected.verdicts);
      expect(result.jointThreading).toEqual(threading);
      expect(tails).toHaveBeenCalledTimes(1);
      expect(tails.mock.calls[0]![0]).toBe(spy.mock.results[0]!.value.verdicts);
      const changed = structuredClone(rebar);
      changed.regions!.topStart = { count: 2, diameter: 12 };
      changed.regions!.topStartLayers = [{ count: 2, diameter: 12, row: 0 }];
      const changedResult = cirsoc201Adapter.verify(ctx, changed);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(tails).toHaveBeenCalledTimes(2);
      expect(tails.mock.calls[1]![0]).toBe(spy.mock.results[1]!.value.verdicts);
      expect(tails.mock.calls[1]![0]).not.toBe(tails.mock.calls[0]![0]);
      const changedInput = anchorage.supportInputOf(ctx, changed)!;
      expect(changedResult.supportAnchorage).toEqual(anchorage.endSupportPlan(changedInput).verdicts);
      expect(changedResult.jointThreading).toEqual(prepareJointThreading(ctx)(changedInput, anchorage.endSupportPlan(changedInput)));
    } finally { spy.mockRestore(); tails.mockRestore(); }
  });
  it('lays out a row of slots against the same cages once, whatever else the candidate changes', () => {
    const b = cantilever(Math.PI / 2);
    const column = [...modelStore.elements.keys()].find(id => id !== b)!;
    const ctx = { ...verificationStore.contextFor(b)!, columnBars: new Map([[column, { count: 6, diameterMm: 20 }]]) };
    const rebar = modelStore.elements.get(b)!.reinforcement!;
    const layouts = vi.spyOn(candidates, 'generateLayoutCandidates');
    try {
      const prepared = prepareJointThreading(ctx);
      const check = (bars: typeof rebar) => {
        const input = anchorage.supportInputOf(ctx, bars)!;
        return prepared(input, anchorage.endSupportPlan(input));
      };
      const first = check(rebar);
      expect(first.length).toBeGreaterThan(0);
      expect(layouts).toHaveBeenCalledTimes(1);
      const closerStirrups = structuredClone(rebar);
      closerStirrups.regions!.stirrupsSpan = { diameter: 8, legs: 2, spacing: 0.12 };
      expect(check(closerStirrups)).toEqual(first);
      expect(check(rebar)).toEqual(first);
      expect(layouts).toHaveBeenCalledTimes(1);
      const moreSlots = structuredClone(rebar);
      moreSlots.regions!.topStart = { count: 5, diameter: 16 };
      moreSlots.regions!.topStartLayers = [{ count: 5, diameter: 16, row: 0 }];
      check(moreSlots);
      expect(layouts).toHaveBeenCalledTimes(2);
      cirsoc201Adapter.verify({ ...ctx, columnBars: new Map([[column, { count: 8, diameterMm: 20 }]]) }, rebar);
      expect(layouts).toHaveBeenCalledTimes(3);
    } finally { layouts.mockRestore(); }
  });

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
