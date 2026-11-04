/**
 * A joist floor through the store: a panel declared of joist typology on a grid, solved, read row by
 * row along its joists, given the lightest example joist that carries it, saved and equalized.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import { equalizeJoists, joistPanels, setJoistSystem } from '../joist-store';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 4.5 }, { id: 'x2', name: '3', axis: 'x', at: 9 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 6 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};

describe('a joist floor', () => {
  it('designed against the sheet, saved and equalized', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const col = modelStore.addSection({ name: '30×30', a: 0.09, iy: 0.000675, iz: 0.000675, j: 0.00114, b: 0.3, h: 0.3, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { fixBase: true });
    placeSlabs(grid, { levels: ['N1'], thickness: 0.17, materialId: mat, meshSize: 0.75, typology: 'joist' });
    const dCase = 1;
    const lCase = modelStore.addLoadCase('L', 'L');
    for (const q of modelStore.quads.values()) { modelStore.addSurfaceLoad3D(q.id, 1.5, dCase); modelStore.addSurfaceLoad3D(q.id, 2, lCase); }
    modelStore.addCombination('1.2D + 1.6L', [{ caseId: dCase, factor: 1.2 }, { caseId: lCase, factor: 1.6 }]);
    const combo = modelStore.solveCombinations3D(true, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    expect(designRunStore.computeDemands().ok).toBe(true);

    const ps = joistPanels();
    expect(ps).toHaveLength(2);
    for (const p of ps) {
      // 4,5 × 6 m: the joists span the 4,5 m way, along x.
      expect(p.system.direction).toBe('x');
      expect(p.input.span).toBeCloseTo(4.5, 9);
      expect(p.input.superDead).toBeCloseTo(1.5, 9);
      expect(p.input.live).toBeCloseTo(2, 9);
      expect(p.design.mPos).toBeGreaterThan(0);
      expect(p.design.utilization.flexure).toBeLessThanOrEqual(1);
      // The middle support is continuous: one end of each panel hogs and gets negatives.
      expect(p.design.negatives.start ?? p.design.negatives.end).toBeDefined();
    }
    setJoistSystem(ps[0]!.key, { ...ps[0]!.system, propped: true });
    expect(joistPanels()[0]!.saved).toBe(true);
    expect(equalizeJoists(ps[0]!.level, 0.2)).toBe(2);
    const [a, b] = joistPanels();
    expect(a!.system.typeId).toBe(b!.system.typeId);
  });
});
