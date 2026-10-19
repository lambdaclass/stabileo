/**
 * A slab placed on a grid is designed as one panel by strips through the production command, its
 * base and bands drawn; a reinforcement a person saves is the one it is checked with.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { storedDecisions } from '../design-decisions';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
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

describe('a slab panel designed whole', () => {
  it('one panel, strips, base and bands, and saved bars that govern', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const col = modelStore.addSection({ name: '30×30', a: 0.09, iy: 0.000675, iz: 0.000675, j: 0.00114, b: 0.3, h: 0.3, shape: 'rect' } as never);
    const bm = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: mat }, beamsX: { sectionId: bm, materialId: mat }, beamsY: { sectionId: bm, materialId: mat } }, { fixBase: true });
    placeSlabs(grid, { levels: ['N1'], thickness: 0.12, materialId: mat, meshSize: 0.5 });
    for (const q of modelStore.quads.values()) modelStore.addSurfaceLoad3D(q.id, 8, 1);
    const combo = modelStore.solveCombinations3D(false, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    expect(designRunStore.computeDemands().ok).toBe(true);

    const run = detailingStore.generateFloors({ families: ['slab'] })!;
    const panels = run.slabs.filter((s) => s.panel);
    expect(panels).toHaveLength(1);
    const p = panels[0]!;
    expect(p.panel!.input.elements.length).toBe(modelStore.quads.size);
    expect(p.panel!.check.strips.length).toBe(12);
    expect(run.slabs.filter((s) => !s.panel)).toHaveLength(0);
    const bars = run.assemblies.flatMap((a) => a.bars).filter((b) => b.id.startsWith(`${p.panelId}-`));
    expect(bars.some((b) => /-bx-/.test(b.id))).toBe(true);

    // A heavier base, saved: it governs, and no band is needed under it.
    const mine = { base: { bottomX: { diameter: 12, spacing: 0.1 }, bottomY: { diameter: 12, spacing: 0.1 }, topX: { diameter: 12, spacing: 0.1 }, topY: { diameter: 12, spacing: 0.1 } }, bands: [] };
    const d = storedDecisions();
    modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, slabs: { [p.panelId]: mine } }));
    const again = detailingStore.generateFloors({ families: ['slab'] })!;
    const q = again.slabs.find((s) => s.panelId === p.panelId)!;
    expect(q.panel!.saved).toBe(true);
    expect(q.panel!.reinforcement).toEqual(mine);
    expect(q.panel!.check.worst).toBeLessThan(p.panel!.check.worst + 1e-9);
  });
});
