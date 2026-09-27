/**
 * Elevations across assemblies: a frame line, a column stack and a joint are found in the scene
 * and drawn from its bars; the joint's window clips everything to itself.
 */
import { describe, it, expect } from 'vitest';
import { frameLines, columnStacks, joints, clipPolyline, drawFrameElevation, drawJointDetail, drawColumnStack, JOINT_WINDOW } from '../structure-elevations';

const sq = (x: number, y: number, z: number, h = 0.15) => [
  { x: x - h, y: y - h, z }, { x: x + h, y: y - h, z }, { x: x + h, y: y + h, z }, { x: x - h, y: y + h, z },
];
const rectYZ = (x: number, y: number, z: number) => [
  { x, y: y - 0.1, z: z - 0.25 }, { x, y: y + 0.1, z: z - 0.25 }, { x, y: y + 0.1, z: z + 0.25 }, { x, y: y - 0.1, z: z + 0.25 },
];
const col = (id: number, x: number, z0: number) => ({ id: `c${id}`, kind: 'column', elementIds: [id], base: sq(x, 0, z0), extrude: { x: 0, y: 0, z: 3 } });
const beam = (id: number, x0: number, x1: number) => ({ id: `b${id}`, kind: 'beam', elementIds: [id], base: rectYZ(x0, 0, 3), extrude: { x: x1 - x0, y: 0, z: 0 } });
const bar = (id: string, el: number, pts: Array<[number, number, number]>, mark = 'B1') => ({
  barId: id, mark, diameterMm: 16, role: 'longitudinal', assemblyId: 'A', elementIds: [el], ownerScope: 'frame',
  polyline: pts.map(([x, y, z]) => ({ x, y, z })),
});

// Two bays over three columns, the middle column carried up a second lift.
const scene = {
  solids: [col(1, 0, 0), col(2, 5, 0), col(3, 10, 0), col(4, 5, 3), beam(11, 0, 5), beam(12, 5, 10)],
  bars: [
    bar('x1', 11, [[0, 0, 2.8], [5, 0, 2.8]]), bar('x2', 12, [[5, 0, 2.8], [10, 0, 2.8]], 'B2'),
    bar('v1', 2, [[5, 0, 0], [5, 0, 3]], 'C1'), bar('v2', 4, [[5, 0, 3], [5, 0, 6]], 'C1'),
  ],
} as never;
const ctx = { scene, title: { sheetNumber: 'R1-1', title: 't' } as never, statusOf: () => undefined };

describe('found in the scene', () => {
  it('one frame line with its two beams and the columns on it; one stack of two lifts; the joints', () => {
    const lines = frameLines(scene);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.solids.map((s) => s.id).sort()).toEqual(['b11', 'b12', 'c1', 'c2', 'c3', 'c4']);
    const stacks = columnStacks(scene);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.solids.map((s) => s.id)).toEqual(['c2', 'c4']);
    const js = joints(scene);
    // Tops of c1, c2 and c3, and the base of c4 at the same point as c2's top.
    expect(js).toHaveLength(3);
    const mid = js.find((j) => Math.abs(j.at.x - 5) < 1e-9)!;
    expect(mid.solids.map((s) => s.id).sort()).toEqual(['b11', 'b12', 'c2', 'c4']);
  });
});

describe('drawn', () => {
  it('the frame carries every bar of its members, each mark labelled once', () => {
    const sheet = drawFrameElevation({ ...ctx, line: frameLines(scene)[0]! });
    expect(sheet.kind).toBe('frameElevation');
    expect(sheet.polylines.filter((p) => p.layer === 'RC-BAR')).toHaveLength(4);
    expect(sheet.texts.map((t) => t.text).sort()).toEqual(['B1 Ø16', 'B2 Ø16', 'C1 Ø16']);
    expect(drawColumnStack({ ...ctx, stack: columnStacks(scene)[0]! }).kind).toBe('columnElevation');
  });

  it('the joint is clipped to its window', () => {
    const j = joints(scene).find((x) => Math.abs(x.at.x - 5) < 1e-9)!;
    const sheet = drawJointDetail({ ...ctx, joint: j });
    for (const p of sheet.polylines) for (const q of p.points) {
      expect(Math.abs(q.x)).toBeLessThanOrEqual(JOINT_WINDOW.half + 1e-9);
      expect(Math.abs(q.y)).toBeLessThanOrEqual(JOINT_WINDOW.halfHeight + 1e-9);
    }
    expect(sheet.polylines.some((p) => p.layer === 'RC-BAR')).toBe(true);
  });

  it('clips a polyline into the pieces inside the box', () => {
    const box = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    expect(clipPolyline([{ x: -1, y: 0.5 }, { x: 2, y: 0.5 }], box)).toEqual([[{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]]);
    const pieces = clipPolyline([{ x: 0.5, y: 0.5 }, { x: 0.5, y: 2 }, { x: 0.8, y: 2 }, { x: 0.8, y: 0.2 }], box);
    expect(pieces).toHaveLength(2);
    expect(clipPolyline([{ x: 2, y: 2 }, { x: 3, y: 3 }], box)).toEqual([]);
  });
});
