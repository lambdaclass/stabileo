import { describe, expect, it } from 'vitest';
import { auditMeshCompatibility, segmentIntervals } from '../mesh-compatibility';
import { generateMesh, type MeshInput, type MeshOutput } from '../mesher';
import type { Vec3 } from '../affine';

const plane: MeshOutput['plane'] = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] };
const input: MeshInput = { outer: { kind: 'polygon', points: [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]] }, holes: [], size: 1, element: 'quad' };

describe('material intervals of a beam', () => {
  it('finds a corner crossing with both ends and midpoint outside', () => {
    const intervals = segmentIntervals(input, plane, [[-1, 3, 0], [9, 8, 0]])!;
    expect(intervals).toHaveLength(1);
    expect(intervals[0]![0]).toBeCloseTo(0.1, 12);
    expect(intervals[0]![1]).toBeCloseTo(0.2, 12);
  });
  it('clips at openings but includes their edges', () => {
    const hole: MeshInput = { ...input, holes: [{ kind: 'polygon', points: [[1, 1, 0], [3, 1, 0], [3, 3, 0], [1, 3, 0]] }] };
    expect(segmentIntervals(hole, plane, [[0, 2, 0], [4, 2, 0]])).toEqual([[0, 0.25], [0.75, 1]]);
    expect(segmentIntervals(hole, plane, [[1, 1, 0], [3, 1, 0]])).toEqual([[0, 1]]);
    expect(segmentIntervals(hole, plane, [[1.5, 2, 0], [2.5, 2, 0]])).toEqual([]);
  });
  it('handles circular holes', () => {
    const hole: MeshInput = { ...input, holes: [{ kind: 'circle', center: [2, 2, 0], radius: 1 }] };
    expect(segmentIntervals(hole, plane, [[0, 2, 0], [4, 2, 0]])).toEqual([[0, 0.25], [0.75, 1]]);
  });
  it('works in a vertical wall plane and with reversed beams', () => {
    const wall = { o: [5, 0, 0], u: [0, 1, 0], v: [0, 0, 1] } as MeshOutput['plane'];
    const region = { ...input, outer: { kind: 'polygon' as const, points: [[5, 0, 0], [5, 4, 0], [5, 4, 4], [5, 0, 4]] as Vec3[] } };
    expect(segmentIntervals(region, wall, [[5, 5, 2], [5, -1, 2]])).toEqual([[1 / 6, 5 / 6]]);
  });
  it('ignores members of another level but rejects unsafe arithmetic', () => {
    expect(segmentIntervals(input, plane, [[0, 1, 2], [4, 1, 2]])).toEqual([]);
    for (const x of [NaN, Infinity, 1e200]) expect(segmentIntervals(input, plane, [[x, 1, 0], [4, 1, 0]])).toBeNull();
    expect(segmentIntervals(input, { ...plane, u: [0, 0, 0] }, [[0, 1, 0], [4, 1, 0]])).toBeNull();
  });
});

describe('beam trace coverage', () => {
  it('accepts an existing grid trace without modifying the mesh', () => {
    const mesh = generateMesh(input)!;
    const before = structuredClone(mesh);
    expect(auditMeshCompatibility({ ...input, fixedSegments: [[[0, 2, 0], [4, 2, 0]]] }, mesh).ok).toBe(true);
    expect(mesh).toEqual(before);
  });
  it('rejects a fallback mesh missing an oblique trace', () => {
    const mesh = generateMesh(input)!;
    const withBeam: MeshInput = { ...input, fixedSegments: [[[0, 1.2, 0], [4, 2.8, 0]]] };
    expect(auditMeshCompatibility(withBeam, mesh)).toMatchObject({ ok: false, reason: 'missingEdges', missingSegments: [0] });
    expect(auditMeshCompatibility(withBeam, generateMesh(withBeam)!).ok).toBe(true);
  });
  it('refuses excessive work instead of accepting a partial audit', () => {
    const beam: [Vec3, Vec3] = [[0, 2, 0], [4, 2, 0]];
    const report = auditMeshCompatibility({ ...input, fixedSegments: Array.from({ length: 100_000 }, () => beam) }, generateMesh(input)!);
    expect(report).toMatchObject({ ok: false, reason: 'budget' });
  });
});
