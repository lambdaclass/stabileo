/**
 * The two modelling errors that nothing else reports.
 *
 * `checkModel` already finds coincident nodes, disconnected nodes, short members and
 * duplicate members. What it could not see were the two that leave no trace downstream:
 * members laid on top of each other with different end nodes, and quads whose corners do
 * not share a plane. Both solve. Both give answers. Neither is the structure that was
 * drawn.
 */
import { describe, it, expect } from 'vitest';
import { overlappingCollinearWarnings, surfaceWarnings } from '../model-diagnostics';

type NodeMap = Parameters<typeof overlappingCollinearWarnings>[1];
type ElemMap = Parameters<typeof overlappingCollinearWarnings>[0];

const nodes = (pts: Array<[number, number, number, number]>): NodeMap =>
  new Map(pts.map(([id, x, y, z]) => [id, { id, x, y, z }])) as unknown as NodeMap;
const elems = (es: Array<[number, number, number]>): ElemMap =>
  new Map(es.map(([id, i, j]) => [id, { id, nodeI: i, nodeJ: j }])) as unknown as ElemMap;

describe('members on the same line', () => {
  const line = nodes([[1, 0, 0, 0], [2, 3, 0, 0], [3, 6, 0, 0], [4, 9, 0, 0]]);

  it('reports a member laid over the first half of another', () => {
    // 1→3 is 6 m; 1→2 covers its first 3 m. Different node pairs, so the duplicate-member
    // check cannot see it, and the frame comes out with two load paths where there is one.
    const w = overlappingCollinearWarnings(elems([[10, 1, 3], [11, 1, 2]]), line);
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe('MODEL_OVERLAPPING_MEMBERS');
    expect(new Set(w[0]!.elementIds)).toEqual(new Set([10, 11]));
  });

  it('says nothing about members that meet end to end', () => {
    // Sharing a point is a connection, not an overlap. This is the common case, and a
    // warning here would bury the real one under every continuous beam in the model.
    expect(overlappingCollinearWarnings(elems([[10, 1, 2], [11, 2, 3], [12, 3, 4]]), line)).toEqual([]);
  });

  it('is not fooled by the direction a member was drawn in', () => {
    // 1→3 covers 0–6 m and 4→2 covers 3–9 m drawn backwards. Same line, opposite
    // directions, different node pairs, overlapping over 3 m. Keying on the raw
    // direction vector would put them on two different lines and miss it.
    const w = overlappingCollinearWarnings(elems([[10, 1, 3], [11, 4, 2]]), line);
    expect(w).toHaveLength(1);
    expect(new Set(w[0]!.elementIds)).toEqual(new Set([10, 11]));
  });

  it('leaves a duplicate member to the check that already names it', () => {
    // Same two nodes is a duplicate, not an overlap, and `checkModel` reports it. Saying
    // it again here would be one defect under two names.
    expect(overlappingCollinearWarnings(elems([[10, 1, 3], [11, 3, 1]]), line)).toEqual([]);
  });

  it('says nothing about parallel members on different lines', () => {
    const offset = nodes([[1, 0, 0, 0], [2, 6, 0, 0], [3, 0, 2, 0], [4, 6, 2, 0]]);
    expect(overlappingCollinearWarnings(elems([[10, 1, 2], [11, 3, 4]]), offset)).toEqual([]);
  });

  it('says nothing about members that cross without sharing a line', () => {
    const cross = nodes([[1, 0, 0, 0], [2, 6, 0, 0], [3, 3, -3, 0], [4, 3, 3, 0]]);
    expect(overlappingCollinearWarnings(elems([[10, 1, 2], [11, 3, 4]]), cross)).toEqual([]);
  });

  it('finds the overlap on a sloped member too, not only on the axes', () => {
    const slope = nodes([[1, 0, 0, 0], [2, 2, 2, 2], [3, 4, 4, 4]]);
    const w = overlappingCollinearWarnings(elems([[10, 1, 3], [11, 1, 2]]), slope);
    expect(w).toHaveLength(1);
  });
});

describe('surfaces', () => {
  const flat = nodes([[1, 0, 0, 0], [2, 1, 0, 0], [3, 1, 1, 0], [4, 0, 1, 0]]);
  const quad = (id: number, ns: number[]) => new Map([[id, { id, nodes: ns }]]) as never;

  it('a flat quad raises nothing', () => {
    expect(surfaceWarnings(undefined, quad(1, [1, 2, 3, 4]), flat)).toEqual([]);
  });

  it('reports a quad whose fourth corner leaves the plane of the other three', () => {
    // 5 cm out of plane on a 1 m element: 5 %, well past the 1 % tolerance. The element
    // would solve happily, projected onto a surface nobody drew.
    const warped = nodes([[1, 0, 0, 0], [2, 1, 0, 0], [3, 1, 1, 0], [4, 0, 1, 0.05]]);
    const w = surfaceWarnings(undefined, quad(1, [1, 2, 3, 4]), warped);
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe('MODEL_WARPED_QUAD');
    expect((w[0]!.details as { outOfPlane: number }).outOfPlane).toBeCloseTo(0.05, 4);
  });

  it('tolerates the millimetre that survey data always carries', () => {
    const nearly = nodes([[1, 0, 0, 0], [2, 1, 0, 0], [3, 1, 1, 0], [4, 0, 1, 0.001]]);
    expect(surfaceWarnings(undefined, quad(1, [1, 2, 3, 4]), nearly)).toEqual([]);
  });

  it('reports the same surface entered twice, whatever order its nodes are in', () => {
    const twice = new Map([
      [1, { id: 1, nodes: [1, 2, 3, 4] }],
      [2, { id: 2, nodes: [3, 4, 1, 2] }],
    ]) as never;
    const w = surfaceWarnings(undefined, twice, flat);
    expect(w.filter((d) => d.code === 'MODEL_DUPLICATE_SURFACE')).toHaveLength(1);
  });

  it('reports a repeated triangular plate, which is the only way a plate can be wrong here', () => {
    // Three points always share a plane, so a plate cannot warp. Repetition still can.
    const plates = new Map([
      [1, { id: 1, nodes: [1, 2, 3] }],
      [2, { id: 2, nodes: [2, 3, 1] }],
    ]) as never;
    const w = surfaceWarnings(plates, undefined, flat);
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe('MODEL_DUPLICATE_SURFACE');
  });
});
