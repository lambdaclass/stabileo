/**
 * Q5's closing criterion (QA of 19-oct: «a simple slab, unmeshed, that is meshed when analysed»):
 *  - placed to wait, each panel is one shell and the beams stay whole;
 *  - meshed at the analysis, it is the slab meshed at placement with its columns' sections in it
 *    (QA of 20-oct): grid lines on the columns' faces and the nodes inside them tied to the
 *    columns, the same beam cuts, and the same displacements within 5 % under the same loads;
 *  - its surface loads go with it, both ways;
 *  - put back to one shell per panel, the model is the one placed: the beams whole again, the
 *    mesh's nodes gone, the load kept; and the next analysis meshes it again.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import * as wasmSolver from '../../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '../../../store';
import { placeFrame, placeSlabs } from '../build-on-grid';
import { meshDeferredSlabs, simplifySlabs, slabsToMesh, slabsToSimplify } from '../deferred-slabs';
import { physicalGroups } from '../../../store/physical';
import type { AnalysisResults3D } from '../../../engine/types-3d';
import type { StructuralGrid } from '../../grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 6 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'N0', z: 0 }, { id: 'N1', name: 'N1', z: 3 }],
};
const S = { sectionId: 1, materialId: 1 };

/** The frame, a slab on N1 (waiting or meshed now), 5 kN/m² along its normal. */
function build(meshAtSolve: boolean) {
  modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
  placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: S, beamsX: S, beamsY: S }, { fixBase: true });
  placeSlabs(grid, { levels: ['N1'], thickness: 0.15, materialId: 1, meshSize: 1, typology: 'solid', meshAtSolve });
  for (const q of modelStore.quads.keys()) modelStore.addSurfaceLoad3D(q, -5, undefined);
}
const solve = () => {
  const r = modelStore.solve3D(false, false, true);
  expect(typeof r, String(r)).not.toBe('string');
  return r as AnalysisResults3D;
};
/** Vertical displacement at the middle of the slab and at a beam's midspan, by position. */
const probes = (r: AnalysisResults3D) => {
  const uz = (x: number, y: number) => {
    const n = [...modelStore.nodes.values()].find((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6 && Math.abs((p.z ?? 0) - 3) < 1e-6)!;
    return r.displacements.find((d) => d.nodeId === n.id)!.uz;
  };
  return { mid: uz(3, 2), beam: uz(3, 0) };
};
const census = () => ({ nodes: modelStore.nodes.size, elements: modelStore.elements.size, quads: modelStore.quads.size, loads: modelStore.loads.length });

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

describe('a slab meshed at the analysis', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('waits as one shell, meshes with its columns\' sections in it, and solves as the slab meshed at placement', () => {
    build(false);
    const now = census();
    const meshedNow = probes(solve());

    build(true);
    const placed = census();
    expect(placed.quads).toBe(1);
    // The beams whole: 4 columns and 4 beams, nothing cut.
    expect(placed.elements).toBe(8);
    expect(slabsToMesh()).toBe(1);
    expect(physicalGroups().find((g) => g.physical.kind === 'slab')!.physical.meshAtSolve).toMatchObject({ size: 1, meshed: false });

    const m = meshDeferredSlabs();
    expect(m.slabs).toBe(1);
    // Meshed at the analysis, the panel has grid lines on the columns' faces (`column-footprints.ts`)
    // and the slab nodes inside each column's section are tied to the column's node: each corner
    // column holds 3 of them (the corner of its faces and one on each beam), 12 in all. The beams
    // are cut at the same edge nodes outside the columns as at placement, so they are as many.
    const atSolveCensus = census();
    expect(atSolveCensus.elements).toBe(now.elements);
    expect(atSolveCensus.nodes).toBeGreaterThan(now.nodes);
    const ties = (modelStore.model.constraints ?? []).filter((k) => k.type === 'rigidLink');
    expect(ties).toHaveLength(12);
    expect(slabsToMesh()).toBe(0);
    expect(slabsToSimplify()).toBe(1);
    const atSolve = probes(solve());
    // The same slab under the same load, on a grid a little different: the middle and the beams
    // move as the slab meshed at placement does, within 5 % (0,2 % at the middle, measured).
    expect(Math.abs(atSolve.mid)).toBeGreaterThan(1e-4);
    expect(Math.abs(atSolve.mid / meshedNow.mid - 1)).toBeLessThan(0.05);
    expect(Math.abs(atSolve.beam / meshedNow.beam - 1)).toBeLessThan(0.05);
  });

  it('goes back to one shell per panel, the beams whole and the load kept, and meshes again', () => {
    build(true);
    const placed = census();
    meshDeferredSlabs();
    const meshed = census();
    expect(meshed.quads).toBeGreaterThan(20);

    const r = simplifySlabs();
    expect(r.slabs).toBe(1);
    expect(census()).toEqual(placed);
    const load = modelStore.loads.find((l) => l.type === 'surface3d')!;
    expect((load.data as { q: number }).q).toBe(-5);
    expect(slabsToMesh()).toBe(1);

    expect(meshDeferredSlabs().slabs).toBe(1);
    expect(census()).toEqual(meshed);

    // Each of those was one step.
    historyStore.undo();
    expect(census()).toEqual(placed);
  });
});

describe('a waffle slab waiting for its mesh', () => {
  it('is meshed at its rib spacing where that is finer than its own size', async () => {
    const { meshSizeOf } = await import('../deferred-slabs');
    const { patchOwnDesignData } = await import('../../../store/design-data');
    build(true);
    const g = physicalGroups().find((x) => x.physical.kind === 'slab')!;
    expect(meshSizeOf({ id: g.id, physical: { ...g.physical, typology: 'waffle' } as never })).toBe(1);
    patchOwnDesignData({ specialFloors: { systems: { [`S${g.id}`]: { ribbed: { h: 0.3, c: 0.05, spacingX: 0.8, spacingY: 0.6, ribBottom: 0.12, filler: 'permanent' } } } } });
    expect(meshSizeOf({ id: g.id, physical: { ...g.physical, typology: 'waffle' } as never })).toBe(0.6);
    // A solid slab keeps its own size whatever system the design data holds.
    expect(meshSizeOf({ id: g.id, physical: { ...g.physical, typology: 'solid' } as never })).toBe(1);
  });
});
