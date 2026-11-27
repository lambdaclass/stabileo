import { beforeEach, describe, expect, it } from 'vitest';
import { gridMesh, type GridFrame } from '../grid-mesh';
import { rectangleOpening } from '../rect-opening';
import { addPlateRectOpening, createPlate, planPlateMesh } from '../../../store/physical-plates';
import { DEFAULT_PLATE_MESH, plateSurfaceOf } from '../../physical/plate';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';

const XY: GridFrame = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
const P = (x: number, y: number): [number, number, number] => [x, y, 0];
const outer = () => [P(0, 0), P(6, 0), P(6, 4), P(0, 4)];
const area2 = (pts: [number, number, number][], cell: number[]): number => {
  let s = 0;
  for (let k = 0; k < cell.length; k++) { const a = pts[cell[k]!]!, b = pts[cell[(k + 1) % cell.length]!]!; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
};

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

describe('exact grid divisions', () => {
  it('uses n × m instead of the requested cell sizes', () => {
    const m = gridMesh({ outer: outer(), holes: [], frame: XY, a: 99, b: 99, divisions: { u: 4, v: 3 }, element: 'quad' })!;
    expect(m.cells).toHaveLength(12);
    expect(m.gridCells).toBe(12);
    expect(m.cellA).toBeCloseTo(1.5, 9);
    expect(m.cellB).toBeCloseTo(4 / 3, 9);
    expect(m.structured).toBe(true);
  });

  it('keeps a rectangular opening conforming while fitting the same divisions', () => {
    const hole = rectangleOpening([3, 2, 0], XY.u, XY.v, 2, 1)!;
    const m = gridMesh({ outer: outer(), holes: [hole], frame: XY, a: 99, b: 99, divisions: { u: 4, v: 3 }, element: 'quad' })!;
    expect(m).not.toBeNull();
    const total = m.cells.reduce((s, c) => s + area2(m.points, c), 0);
    expect(total).toBeCloseTo(22, 6);
  });

  it('refuses invalid divisions', () => {
    for (const divisions of [{ u: 0, v: 3 }, { u: 4, v: -1 }, { u: 1.5, v: 3 }, { u: Number.NaN, v: 3 }]) {
      expect(gridMesh({ outer: outer(), holes: [], frame: XY, a: 1, b: 1, divisions, element: 'quad' })).toBeNull();
    }
  });
});

describe('rectangular openings on a plate', () => {
  it('adds the hole through the plate definition and meshes with n × m', () => {
    const outline = [modelStore.addNode(0, 0, 0), modelStore.addNode(6, 0, 0), modelStore.addNode(6, 4, 0), modelStore.addNode(0, 4, 0)];
    const created = createPlate({ outline, materialId: 1, thickness: 0.2,
      mesh: { ...DEFAULT_PLATE_MESH, pattern: 'rect', divisions: { u: 4, v: 3 } } });
    if (!('id' in created) || typeof created.id !== 'number') throw new Error('plate not created');
    const id = created.id;
    expect(addPlateRectOpening(id, { center: [3, 2, 0], width: 2, height: 1 })).toBeNull();
    expect(plateSurfaceOf(modelStore.model.groups.get(id)!)!.loops).toEqual([4, 4]);
    expect(modelStore.model.groups.get(id)!.members.nodes).toHaveLength(8);
    const plan = planPlateMesh(id)!;
    expect(plan.mesh).not.toBeNull();
    expect(plan.mesh!.cells.length).toBeGreaterThan(0);
    expect(plan.signature).toContain('/div:4x3');

    const before = modelStore.model.groups.get(id)!.members.nodes!.length;
    expect(addPlateRectOpening(id, { center: [3, 2, 0], width: 0, height: 1 })).toBe('noArea');
    expect(addPlateRectOpening(id, { center: [20, 20, 0], width: 2, height: 2 })).toBe('holeOutside');
    expect(modelStore.model.groups.get(id)!.members.nodes).toHaveLength(before);
  });

  it('checks the rectangular axes and dimensions', () => {
    expect(rectangleOpening([3, 2, 0], [2, 0, 0], XY.v, 1, 1)).toBeNull();
    expect(rectangleOpening([3, 2, 0], [1, 1, 0], XY.v, 1, 1)).toBeNull();
    expect(rectangleOpening([3, 2, 0], XY.u, XY.v, -1, 1)).toBeNull();
    const loop = rectangleOpening([3, 2, 0], XY.u, XY.v, 2, 1)!;
    expect(loop).toEqual([P(2, 1.5), P(4, 1.5), P(4, 2.5), P(2, 2.5)]);
  });
});
