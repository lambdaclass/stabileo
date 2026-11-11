/**
 * Slabs and walls the building tool places are physical plates:
 *  - a slab placed to wait has no shell and its beams stay whole; the analysis meshes it with its
 *    columns' sections in it (grid lines on their faces, the nodes inside tied to the columns), and it
 *    moves as the slab meshed at placement within 5 %;
 *  - its mesh can be taken out and made again, the model returning to what was placed;
 *  - a waffle slab is meshed no coarser than its ribs;
 *  - a wall with a window is a plate with a hole, its mesh current.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '../../../store';
import { placeFrame, placeSlabs, placeWall } from '../build-on-grid';
import { addPlateLoad, applyPlateMeshes, plateEntry, clearPlateMesh, physicalPlates, planPlateMesh, plateStatus, preparePlatesForAnalysis } from '../../../store/physical-plates';
import { syncDefinedLoadsForAnalysis } from '../../../store/defined-loads';
import { patchOwnDesignData } from '../../../store/design-data';
import { plateLoops } from '../../physical/plate';
import { physicalThickness } from '../../../store/physical';
import { stripUnderWall, supportWallBase } from '../../foundation/generate';
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

function build(meshAtSolve: boolean) {
  modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
  placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: S, beamsX: S, beamsY: S }, { fixBase: true });
  placeSlabs(grid, { levels: ['N1'], thickness: 0.15, materialId: 1, meshSize: 1, typology: 'solid', meshAtSolve });
  const [slab] = physicalPlates();
  addPlateLoad(slab!.id, modelStore.model.loadCases[0]!.id, 5);
  return slab!.id;
}
const solve = () => {
  syncDefinedLoadsForAnalysis();
  const r = modelStore.solve3D(false, false, true);
  expect(typeof r, String(r)).not.toBe('string');
  return r as AnalysisResults3D;
};
const uzAt = (r: AnalysisResults3D, x: number, y: number) => {
  const n = [...modelStore.nodes.values()].find((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6 && Math.abs((p.z ?? 0) - 3) < 1e-6)!;
  return r.displacements.find((d) => d.nodeId === n.id)!.uz;
};
const census = () => ({ nodes: modelStore.nodes.size, elements: modelStore.elements.size, quads: modelStore.quads.size, ties: (modelStore.model.constraints ?? []).length });

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('slabs placed by the building tool', () => {
  it('wait as a plate with the beams whole, and the analysis meshes them with the columns\' sections, close to meshing at placement', () => {
    const placedNow = build(false);
    const now = census();
    expect(plateStatus(placedNow)).toBe('current');
    const meshedNow = uzAt(solve(), 3, 2);

    const id = build(true);
    expect(census()).toEqual({ nodes: 8, elements: 8, quads: 0, ties: 0 });
    expect(plateStatus(id)).toBe('unmeshed');
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true, meshed: 1 });
    expect(plateStatus(id)).toBe('current');
    const atSolveCensus = census();
    expect(atSolveCensus.elements).toBe(now.elements);
    expect(atSolveCensus.ties).toBe(12);
    const atSolve = uzAt(solve(), 3, 2);
    expect(Math.abs(atSolve)).toBeGreaterThan(1e-4);
    expect(Math.abs(atSolve / meshedNow - 1)).toBeLessThan(0.05);
  });

  it('give their mesh back and take it again, the load following and each step undoable', () => {
    const id = build(true);
    const placed = census();
    preparePlatesForAnalysis();
    const meshed = census();
    expect(meshed.quads).toBeGreaterThan(20);
    clearPlateMesh(id);
    expect(census()).toEqual(placed);
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true, meshed: 1 });
    expect(census()).toEqual(meshed);
    historyStore.undo();
    expect(census()).toEqual(placed);
    const total = solve().reactions.reduce((s, r) => s + r.fz, 0);
    expect(Math.abs(total)).toBeLessThan(1e-6);
  });

  it('are meshed no coarser than a waffle slab\'s ribs', () => {
    const id = build(true);
    const g = modelStore.model.groups.get(id)!;
    modelStore.setGroupData(id, { ...g.data, typology: 'waffle' });
    expect(planPlateMesh(id)!.spec.size).toBe(1);
    patchOwnDesignData({ specialFloors: { systems: { [`S${id}`]: { ribbed: { h: 0.3, c: 0.05, spacingX: 0.8, spacingY: 0.6, ribBottom: 0.12, filler: 'permanent' } } } } });
    expect(planPlateMesh(id)!.spec.size).toBe(0.6);
  });
});

describe('a slab panel meshed with its columns\' sections', () => {
  const stations = (pts: number[][], k: 0 | 1) => new Set(pts.map((q) => Math.round(q[k]! * 1e6))).size;

  it('takes triangles when asked, each quadrilateral of the grid split in two', () => {
    const id = build(true);
    const quads = planPlateMesh(id, { element: 'quad', size: 0.5, pattern: 'free' })!;
    const tris = planPlateMesh(id, { element: 'tri', size: 0.5, pattern: 'free' })!;
    expect(quads.footprints).toBeDefined();
    expect(tris.mesh!.cells.every((c) => c.length === 3)).toBe(true);
    expect(tris.cells).toBe(2 * quads.cells);
    expect(tris.mesh!.structured).toBe(false);
  });

  it('gives side a and side b their own lengths, along X or Y as the orientation says', () => {
    const id = build(true);
    const alongX = planPlateMesh(id, { element: 'quad', size: 0.5, sizeV: 1, pattern: 'rect', orient: 'globalX' })!;
    expect(alongX.aDir).toEqual([1, 0, 0]);
    expect(alongX.grid).toMatchObject({ cellA: 0.5, cellB: 1 });
    const pts = alongX.mesh!.points as number[][];
    const cols = (stations(pts, 0) - 1), rows = (stations(pts, 1) - 1);
    expect(cols).toBeGreaterThanOrEqual(12);
    expect(rows).toBeLessThan(cols);
    const square = planPlateMesh(id, { element: 'quad', size: 0.5, pattern: 'square' })!;
    expect(square.cells).toBeGreaterThan(alongX.cells);
  });

  it('solves in equilibrium with a triangular mesh', () => {
    const id = build(true);
    const plan = planPlateMesh(id, { element: 'tri', size: 0.5, pattern: 'free' })!;
    applyPlateMeshes([plan]);
    expect(modelStore.plates.size).toBe(plan.cells);
    expect(modelStore.quads.size).toBe(0);
    const total = solve().reactions.reduce((s, r) => s + r.fz, 0);
    expect(total).toBeCloseTo(5 * 6 * 5, 3);
  });
});

describe('walls placed by the building tool', () => {
  it('are plates with their windows as holes and their mesh current', () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const r = placeWall(grid, { axis: 'y0', from: 'x0', to: 'x1', levelFrom: 'N0', levelTo: 'N1', thickness: 0.2, materialId: 1, meshSize: 0.5, openings: [{ offset: 2, width: 1.5, sill: 1, height: 1.2 }] });
    expect(r.created).toBe(1);
    const [wall] = physicalPlates();
    expect(wall!.physical.kind).toBe('wall');
    expect(plateStatus(wall!.id)).toBe('current');
    const loops = plateLoops(wall!.group);
    expect(loops.outer).toHaveLength(4);
    expect(loops.holes).toHaveLength(1);
    expect(wall!.surface.mesh.size).toBe(0.5);
  });

  it('can wait for the analysis to mesh them, as slabs do, standing on a strip footing that the mesh then meets', () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const r = placeWall(grid, { axis: 'y0', from: 'x0', to: 'x1', levelFrom: 'N0', levelTo: 'N1', thickness: 0.2, materialId: 1, meshSize: 0.5, meshAtSolve: true, openings: [{ offset: 2, width: 1.5, sill: 1, height: 1.2 }] });
    expect(r).toMatchObject({ created: 1, shells: 0 });
    const [wall] = physicalPlates();
    expect(plateStatus(wall!.id)).toBe('unmeshed');
    expect(modelStore.quads.size + modelStore.plates.size).toBe(0);
    expect(physicalThickness(modelStore.model.groups.get(wall!.id)!)).toBe(0.2);
    expect(plateLoops(wall!.group).holes).toHaveLength(1);
    expect(supportWallBase(wall!.id)).toBe(2);
    stripUnderWall(wall!.id, 0.4);
    addPlateLoad(wall!.id, modelStore.model.loadCases[0]!.id, 2);
    expect(preparePlatesForAnalysis()).toMatchObject({ ok: true, meshed: 1 });
    expect(modelStore.quads.size).toBeGreaterThan(20);
    const base = [...modelStore.nodes.values()].filter((n) => Math.abs(n.z ?? 0) < 1e-6 && Math.abs(n.y) < 1e-6);
    expect(base.length).toBeGreaterThan(10);
    expect(plateEntry(wall!.id)!.surface.meshed!.quality.minAngle).toBeCloseTo(90, 6);
    const r3 = solve();
    expect(r3.reactions.length).toBeGreaterThan(2);
  });
});
