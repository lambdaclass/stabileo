import { expectMembraneRefusal } from '../../engine/__tests__/containment-helper';
/**
 * A wall designed as a member through the production command: placed with an opening on a grid,
 * solved, designed by `generateFloors`; it reports its geometry, gets the opening bars, and a
 * reinforcement a person saves is the one it is checked with next time, and the one drawn.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { verificationStore } from '../verification.svelte';
import { placeFrame, placeWall, placeSlabs } from '../../model/building/build-on-grid';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 5 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 4 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};

describe('a wall designed as a member', () => {
  it('geometry, opening bars, and saved bars that govern', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const col = modelStore.addSection({ name: '30×30', a: 0.09, iy: 0.000675, iz: 0.000675, j: 0.00114, b: 0.3, h: 0.3, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '20×40', a: 0.08, iy: 0.00107, iz: 0.00027, j: 0.0007, b: 0.2, h: 0.4, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { fixBase: true });
    expect(placeWall(grid, { axis: 'y1', from: 'x0', to: 'x1', levelFrom: 'N0', levelTo: 'N1', thickness: 0.2, materialId: mat, meshSize: 0.5, openings: [{ offset: 1.5, width: 1, sill: 0.9, height: 1.2 }] }).created).toBe(1);
    placeSlabs(grid, { levels: ['N1'], thickness: 0.12, materialId: mat, meshSize: 1 });
    for (const q of modelStore.quads.values()) if (Math.abs(modelStore.nodes.get(q.nodes[0]!)!.z! - 3) < 1e-6 && q.nodes.every((n) => Math.abs(modelStore.nodes.get(n)!.z! - 3) < 1e-6)) modelStore.addSurfaceLoad3D(q.id, 5, 1);
    for (const n of modelStore.nodes.values()) if (Math.abs((n.z ?? 0) - 3) < 1e-6) modelStore.addNodalLoad3D(n.id, 8, 0, 0, 0, 0, 0, 1);
    expectMembraneRefusal(() => modelStore.solveCombinations3D(false, false, true));
    /* Post-fix numerical/design expectations (#798):
    const combo = modelStore.solveCombinations3D(false, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    expect(designRunStore.computeDemands().ok).toBe(true);

    const run = detailingStore.generateFloors({ families: ['wall'] })!;
    expect(run.walls.length).toBeGreaterThan(0);
    const w = run.walls[0]!;
    const g = run.wallGeometry![w.wallId]!;
    expect(g.openings).toEqual([{ offset: 1.5, width: 1, sill: 0.9, height: 1.2 }]);
    expect(w.reinforcement.openings).toEqual({ count: 2, diameter: 16 });
    expect(w.checks.find((c) => c.category === 'Openings (§11.7.5)')?.ok).toBe(true);
    expect(w.input.openingCount).toBe(1);

    // A person's bars: Ø10 c/20 both ways, then they govern and are drawn.
    const mine = { vertical: { diameter: 10, spacing: 0.2 }, horizontal: { diameter: 10, spacing: 0.2 }, curtains: 1 as const, openings: { count: 3, diameter: 12 } };
    const d = storedDecisions();
    modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, walls: { [w.wallId]: mine } }));
    const again = detailingStore.generateFloors({ families: ['wall'] })!;
    const w2 = again.walls.find((x) => x.wallId === w.wallId)!;
    expect(w2.reinforcement).toEqual(mine);
    expect(w2.verticalSpacing).toBe(0.2);
    const bars = again.assemblies.flatMap((a) => a.bars).filter((b) => b.id.startsWith(`${w.wallId}-`));
    expect(bars.some((b) => b.id.includes('-o0l') && b.diameterMm === 12)).toBe(true);
    // No distributed vertical bar runs through the opening's height between 1,5 and 2,5 m.
    const through = bars.filter((b) => /-v\d-\d+$/.test(b.id)).filter((b) => {
      const s = b.segments[0]!;
      const along = s.start.x; // the wall runs along x at y = 4
      const zs = [s.start.z, s.end.z];
      return along > 1.5 && along < 2.5 && Math.min(...zs) < 0.9 + 1.2 && Math.max(...zs) > 0.9 + 0.01;
    });
    expect(through).toEqual([]);
    */
  });
});
