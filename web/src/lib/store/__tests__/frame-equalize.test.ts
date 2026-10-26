/**
 * Equalizing repeated frames in the design: a two-bay frame on two levels designed, then one beam
 * given heavier bars by hand. Equalizing puts those bars at that position on every repeat (the
 * repeat drawn the other way takes them end for end), one undo step; a locked beam keeps its own.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { copyFrame, equalizeFrames, framesOf, modelRepeatedFrames } from '../frame-equalize';
import { setLocked } from '../design-decisions';
import { mirrorReinforcement } from '../../engine/design/repeated-frames';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 5 }, { id: 'x2', name: '3', axis: 'x', at: 9 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};

function designed() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '30×30', a: 0.09, iy: 0.000675, iz: 0.000675, j: 0.00114, b: 0.3, h: 0.3, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y0'], levels: ['N0', 'N2'], columns: { sectionId: col, materialId: conc }, beamsX: { sectionId: beam, materialId: conc }, beamsY: null }, { fixBase: true });
  const beams = [...modelStore.elements.values()].filter((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6; });
  for (const e of beams) modelStore.addDistributedLoad3D(e.id, 0, 0, -20, -20, undefined, undefined, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  expect(designRunStore.autoDesign([...verificationStore.contexts.keys()]).ok).toBe(true);
  const at = (z: number, x: number) => beams.find((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs((a.z ?? 0) - z) < 1e-6 && Math.min(a.x, b.x) < x && Math.max(a.x, b.x) > x; })!.id;
  return { at };
}

const heavy = {
  regions: {
    topStartLayers: [{ count: 4, diameter: 20, row: 0 }], topStart: { count: 4, diameter: 20 },
    topEndLayers: [{ count: 2, diameter: 12, row: 0 }], topEnd: { count: 2, diameter: 12 },
    bottomSpanLayers: [{ count: 4, diameter: 16, row: 0 }], bottomSpan: { count: 4, diameter: 16 },
    stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
  },
};

describe('repeated frames in the design', () => {
  it('the two levels repeat each other', () => {
    const { at } = designed();
    const g = modelRepeatedFrames();
    expect(g).toHaveLength(1);
    expect(g[0]!.lines).toHaveLength(2);
    expect(framesOf(at(3, 2))?.group?.lines.length).toBe(2);
  });

  it('equalizing takes the most reinforced beam at each position, one undo step', () => {
    const { at } = designed();
    const p1 = at(3, 2), p2 = at(6, 2);
    modelStore.reinforcementTransaction((api) => api.setReinforcement(p1, structuredClone(heavy) as never));
    const before = structuredClone(modelStore.elements.get(p2)!.reinforcement);
    const g = framesOf(p1)!.group!;
    expect(equalizeFrames(g)).toContain(p2);
    const e1 = modelStore.elements.get(p1)!, e2 = modelStore.elements.get(p2)!;
    const same = modelStore.nodes.get(e1.nodeI)!.x === modelStore.nodes.get(e2.nodeI)!.x;
    expect(e2.reinforcement).toEqual(same ? heavy : mirrorReinforcement(heavy as never));
    historyStore.undo();
    expect(modelStore.elements.get(p2)!.reinforcement).toEqual(before);
  });

  it('copying a frame writes its bars on the repeat, and leaves a locked beam', () => {
    const { at } = designed();
    const p1 = at(3, 7), p2 = at(6, 7), q2 = at(6, 2);
    modelStore.reinforcementTransaction((api) => api.setReinforcement(p1, structuredClone(heavy) as never));
    setLocked([q2], true);
    const lockedBars = structuredClone(modelStore.elements.get(q2)!.reinforcement);
    const f = framesOf(p1)!;
    const written = copyFrame(f.line, f.group!.lines);
    expect(written).toContain(p2);
    expect(written).not.toContain(q2);
    expect(modelStore.elements.get(q2)!.reinforcement).toEqual(lockedBars);
    expect(designRunStore.manualOverrides.has(p2)).toBe(true);
  });
});
