import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '..';
import { placeFrame, placeSlabs } from '../../model/building/build-on-grid';
import { physicalPlates, plateEntry, plateStatus } from '../physical-plates';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { closePlateHole, cutPlateCells, plateFigure, plateSideShapes, setPlateSideSagitta } from '../plate-shape';
import { plateArea, plateGeometry, plateLoops } from '../../model/physical/plate';
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

  it('is refused at half the side or deeper', () => {
    const id = slab(false);
    const L = plateSideShapes(id)[0]!.length;
    expect(setPlateSideSagitta(id, 0, L / 2)).toBe('tooDeep');
    expect(plateSideShapes(id)[0]!.mid).toBeNull();
  });
});
