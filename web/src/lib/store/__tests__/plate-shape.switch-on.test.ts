import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '..';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import { applyPlateMeshes, applyPlateMeshesAsync, createPlate, physicalPlates, planPlateMesh, plateEntry, plateShellKeys, plateStatus, platesNeedingMesh, setPlateLoops } from '../physical-plates';
import { ensurePhysicalModel } from '../plates-from-shells';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { closePlateHole, cutPlateCells, plateFigure, plateSideShapes, setPlateSideSagitta } from '../plate-shape';
import { meshQuality, plateArea, plateGeometry, plateLoops } from '../../model/physical/plate';
import { DEFAULT_WELD_TOL, setWeldTolerance, weldTolerance } from '../../model/weld-tolerance';
import type { StructuralGrid } from '../../model/grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 6 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'N0', z: 0 }, { id: 'N1', name: 'N1', z: 3 }],
};
const S = { sectionId: 1, materialId: 1 };

function slab(meshAtSolve: boolean): number {
  modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
  placeFrame(grid, { x: ['x0', 'x1'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: S, beamsX: S, beamsY: S }, { fixBase: true });
  placeSlabs(grid, { levels: ['N1'], thickness: 0.15, materialId: 1, meshSize: 1, typology: 'solid', meshAtSolve });
  return physicalPlates()[0]!.id;
}
const area = (id: number) => plateArea(plateGeometry(modelStore, plateEntry(id)!.group)!);
const centreOf = (fig: NonNullable<ReturnType<typeof plateFigure>>, c: number[]) => c.reduce((s, i) => [s[0] + fig.points[i]![0] / c.length, s[1] + fig.points[i]![1] / c.length], [0, 0]);
const cellsWhere = (fig: NonNullable<ReturnType<typeof plateFigure>>, test: (x: number, y: number) => boolean) =>
  new Set(fig.cells.map((c, i) => [i, centreOf(fig, c)] as const).filter(([, [x, y]]) => test(x!, y!)).map(([i]) => i));

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('cells taken out of a plate on its drawing', () => {
  it('inside it make a hole, the plate meshed again around it in one undo step', () => {
    const id = slab(false);
    const fig = plateFigure(id)!;
    expect(fig.source).toBe('mesh');
    const chosen = cellsWhere(fig, (x, y) => x > 2 && x < 4 && y > 2 && y < 3);
    expect(chosen.size).toBeGreaterThan(0);
    const before = area(id);
    expect(cutPlateCells(id, fig, chosen)).toBeNull();
    expect(plateLoops(plateEntry(id)!.group).holes).toHaveLength(1);
    expect(plateLoops(plateEntry(id)!.group).holes[0]).toHaveLength(4);
    expect(area(id)).toBeCloseTo(before - 2, 6);
    expect(plateStatus(id)).toBe('current');
    expect(plateEntry(id)!.surface.meshed!.quality.minAngle).toBeCloseTo(90, 6);
    syncDefinedLoadsForAnalysis();
    const r = modelStore.solve3D(false, false, true);
    expect(typeof r, String(r)).not.toBe('string');
    historyStore.undo();
    expect(plateLoops(plateEntry(id)!.group).holes).toHaveLength(0);
    expect(area(id)).toBeCloseTo(before, 6);
  });

  it('of a plate waiting for its mesh take the cells its settings would give, and it keeps waiting', () => {
    const id = slab(true);
    const fig = plateFigure(id)!;
    expect(fig.source).toBe('plan');
    expect(cutPlateCells(id, fig, cellsWhere(fig, (x, y) => x > 2 && x < 3 && y > 2 && y < 3))).toBeNull();
    expect(plateLoops(plateEntry(id)!.group).holes).toHaveLength(1);
    expect(plateStatus(id)).toBe('unmeshed');
  });

  it('along the outline cut a notch in it', () => {
    const id = slab(false);
    const fig = plateFigure(id)!;
    const before = plateLoops(plateEntry(id)!.group).outer.length;
    expect(cutPlateCells(id, fig, cellsWhere(fig, (x, y) => x < 1 && y < 1))).toBeNull();
    expect(plateLoops(plateEntry(id)!.group).holes).toHaveLength(0);
    expect(plateLoops(plateEntry(id)!.group).outer.length).toBe(before + 2);
    expect(area(id)).toBeCloseTo(29, 6);
  });

  it('refuse to split the plate in two, to take it all, or to leave regions meeting at a point', () => {
    const id = slab(false);
    const fig = plateFigure(id)!;
    expect(cutPlateCells(id, fig, cellsWhere(fig, (x) => x > 2 && x < 3))).toBe('split');
    expect(cutPlateCells(id, fig, new Set(fig.cells.map((_, i) => i)))).toBe('wholePlate');
    expect(cutPlateCells(id, fig, cellsWhere(fig, (x, y) => (x > 1 && x < 2 && y > 1 && y < 2) || (x > 2 && x < 3 && y > 2 && y < 3)))).toBe('pinch');
    expect(plateLoops(plateEntry(id)!.group).holes).toHaveLength(0);
  });

  it('a closed hole is plate again', () => {
    const id = slab(false);
    const fig = plateFigure(id)!;
    cutPlateCells(id, fig, cellsWhere(fig, (x, y) => x > 2 && x < 3 && y > 2 && y < 3));
    expect(closePlateHole(id, 0)).toBeNull();
    expect(plateLoops(plateEntry(id)!.group).holes).toHaveLength(0);
    expect(area(id)).toBeCloseTo(30, 6);
    expect(plateStatus(id)).toBe('current');
  });
});

describe('closing one of two round holes', () => {
  it('leaves the other one round', () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const ring = (cx: number) => Array.from({ length: 8 }, (_, k) => modelStore.addNode(cx + Math.cos((k * Math.PI) / 4), 3 + Math.sin((k * Math.PI) / 4), 0));
    const outline = [[0, 0], [12, 0], [12, 6], [0, 6]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const made = createPlate({ outline, holes: [ring(3), ring(9)], materialId: 1, thickness: 0.15, followArcs: false, holeArcMids: [1, 3, 5, 7, 9, 11, 13, 15] });
    expect('id' in made).toBe(true);
    const id = (made as { id: number }).id;
    expect(area(id)).toBeCloseTo(72 - 2 * Math.PI, 1);
    expect(closePlateHole(id, 0)).toBeNull();
    expect(plateEntry(id)!.surface.arcMids).toEqual([5, 7, 9, 11]);
    expect(area(id)).toBeCloseTo(72 - Math.PI, 1);
  });
});

describe('a side curved by its sagitta', () => {
  it('bulges out by it, adds the circular segment to the area (its arc drawn in straight steps), and straightens again without a stray node', () => {
    const id = slab(false);
    const L = plateSideShapes(id)[0]!.length;
    expect(setPlateSideSagitta(id, 0, 0.5)).toBeNull();
    const side = plateSideShapes(id)[0]!;
    expect(side.mid).not.toBeNull();
    expect(side.sagitta).toBeCloseTo(0.5, 9);
    const r = (L * L / 4 + 0.25) / (2 * 0.5), half = Math.asin(L / 2 / r);
    const segment = r * r * (half - Math.sin(2 * half) / 2);
    expect(Math.abs(area(id) - 30 - segment) / segment).toBeLessThan(0.02);
    expect(plateStatus(id)).toBe('current');

    const firstMid = side.mid!;
    expect(setPlateSideSagitta(id, 0, -0.3)).toBeNull();
    expect(modelStore.nodes.has(firstMid)).toBe(false);
    const secondMid = plateSideShapes(id)[0]!.mid!;
    expect(plateSideShapes(id)[0]!.sagitta).toBeCloseTo(-0.3, 9);
    expect(area(id)).toBeLessThan(30);

    expect(setPlateSideSagitta(id, 0, 0)).toBeNull();
    expect(plateSideShapes(id)[0]!.mid).toBeNull();
    expect(area(id)).toBeCloseTo(30, 6);
    expect(modelStore.nodes.has(secondMid)).toBe(false);
  });

  it('bulges out of a concave outline too: a positive sagitta on the side of a U\'s notch grows the plate', () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const u = [[0, 0], [6, 0], [6, 4], [4, 4], [4, 1], [2, 1], [2, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const r = createPlate({ outline: u, materialId: 1, thickness: 0.15 });
    const id = (r as { id: number }).id;
    const before = area(id);
    const k = plateSideShapes(id).findIndex((sd) => sd.from === u[3] && sd.to === u[4]);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(setPlateSideSagitta(id, k, 0.4)).toBeNull();
    const mid = modelStore.nodes.get(plateSideShapes(id)[k]!.mid!)!;
    expect(mid.x).toBeCloseTo(3.6, 9);
    expect(area(id)).toBeGreaterThan(before);
    expect(plateSideShapes(id)[k]!.sagitta).toBeCloseTo(0.4, 9);
  });

  it('is refused at half the side or deeper', () => {
    const id = slab(false);
    const L = plateSideShapes(id)[0]!.length;
    expect(setPlateSideSagitta(id, 0, L / 2)).toBe('tooDeep');
    expect(plateSideShapes(id)[0]!.mid).toBeNull();
  });
});

const batchPaths = [
  ['synchronous', applyPlateMeshes],
  ['asynchronous', applyPlateMeshesAsync],
] as const;

function shellNodesOn(id: number, onEdge: (node: { x: number; y: number }) => boolean): Set<number> {
  const { quads = [], plates = [] } = plateEntry(id)!.group.members;
  const shells = [...quads.map(q => modelStore.quads.get(q)!), ...plates.map(p => modelStore.plates.get(p)!)];
  return new Set(shells.flatMap(shell => shell.nodes).filter(n => onEdge(modelStore.nodes.get(n)!)));
}

describe('rectangular holes in the shared-station batch', () => {
  it.each(batchPaths)('keeps the gallery hole mesh rectangular and conforming (%s)', async (_mode, apply) => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    await modelStore.loadExample('pro-edificio-7p');
    ensurePhysicalModel();
    const slab = physicalPlates().filter(p => p.name.startsWith('L'))[1]!;
    const { outer } = plateLoops(slab.group);
    const z = modelStore.nodes.get(outer[0]!)!.z;
    const hole = [[8.5, 2], [8.5, 3.5], [9.5, 3.5], [9.5, 2]].map(([x, y]) => modelStore.addNode(x!, y!, z));
    expect(setPlateLoops(slab.id, outer, [hole])).toBeNull();
    const meshedAgain = new Set(platesNeedingMesh().flatMap(plateShellKeys));
    const plan = planPlateMesh(slab.id, undefined, { meshedAgain })!;
    expect(plan.quality?.minAngle).toBeCloseTo(90, 3);

    const report = await apply([plan]);
    expect(report.refused).toEqual([]);
    expect(report.plates).toBeGreaterThan(1);
    const applied = plateEntry(slab.id)!;
    expect(plateStatus(slab.id)).toBe('current');
    expect(applied.surface.meshed!.quality.minAngle).toBeCloseTo(90, 3);
    expect(applied.group.members.plates).toEqual([]);

    expect(meshQuality(plateFigure(slab.id)!).minAngle).toBeCloseTo(90, 3);
    const left = physicalPlates().find(p => p.name === 'L1')!;
    const edge = shellNodesOn(slab.id, node => node.x === 6);
    expect(edge).toEqual(shellNodesOn(left.id, node => node.x === 6));
    expect([...edge].map(n => modelStore.nodes.get(n)!.y)).toContain(0.2);
  }, 120_000);

  it.each(batchPaths)('applies the identical planned cells to an isolated plate with a hole (%s)', async (_mode, apply) => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const ring = (x0: number, y0: number, x1: number, y1: number) =>
      [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const made = createPlate({ outline: ring(0, 0, 6, 5), holes: [ring(2, 2, 4, 3)], materialId: 1, thickness: 0.15 });
    expect(made).toHaveProperty('id');
    const { id } = made as { id: number };
    const plan = planPlateMesh(id)!;
    expect(plan.quality?.minAngle).toBeCloseTo(90, 3);

    expect(await apply([plan])).toMatchObject({ plates: 1, cells: plan.cells, refused: [] });
    const figure = plateFigure(id)!;
    expect(figure.source).toBe('mesh');
    expect(figure.cells.map(cell => cell.map(i => figure.points[i]))).toEqual(
      plan.mesh!.cells.map(cell => cell.map(i => plan.mesh!.points[i])),
    );
  });

  it.each([false, true])('shares a neighbour station when the grid can absorb it or needs a transition (fits=%s)', fits => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    const originalWeld = weldTolerance();
    setWeldTolerance(DEFAULT_WELD_TOL / 4);
    try {
      const n = (x: number, y: number) => modelStore.addNode(x, y, 0);
      const a = n(0, 0), b = n(4, 0);
      const station = n(0.5 + DEFAULT_WELD_TOL * (fits ? 2 : 0.5), 0);
      const hole = [n(1, 1), n(1, 2), n(2, 2), n(2, 1)];
      const slab = createPlate({ outline: [a, b, n(4, 4), n(0, 4)], holes: [hole], materialId: 1, thickness: 0.15 });
      const other = createPlate({ outline: [b, station, a, n(0, -2), n(4, -2)], materialId: 1, thickness: 0.15 });
      expect(slab).toHaveProperty('id');
      expect(other).toHaveProperty('id');
      const { id } = slab as { id: number };
      const neighbour = (other as { id: number }).id;
      const plans = [id, neighbour].map(plate => planPlateMesh(plate, { pattern: 'square', followMembers: false, size: plate === id ? 0.5 : 4 })!);

      expect(applyPlateMeshes(plans)).toMatchObject({ plates: 2, refused: [] });
      const edge = shellNodesOn(id, node => node.y === 0);
      expect(edge).toContain(station);
      expect(edge).toEqual(shellNodesOn(neighbour, node => node.y === 0));
      const figure = plateFigure(id)!;
      expect(figure.source).toBe('mesh');
      if (fits) {
        expect(meshQuality(figure).minAngle).toBeCloseTo(90, 3);
        expect(figure.cells.every(cell => cell.length === 4)).toBe(true);
      } else {
        expect(figure.cells.some(cell => cell.length === 3)).toBe(true);
      }
    } finally {
      setWeldTolerance(originalWeld);
    }
  });
});
