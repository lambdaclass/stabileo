/**
 * The bolts of a joint carry what one member end carries in one combination. A column that runs
 * through the node takes its axial force past the bolts, and the axial of one combination does
 * not act with the shear of another.
 */
import { describe, it, expect } from 'vitest';
import { jointDemands } from '../joint-demands';

// Node 2 at (0, 0, 3): column 1 from below, column 2 above, beam 3 framing in along x.
const nodes = new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 0, y: 0, z: 3 }], [3, { x: 0, y: 0, z: 6 }], [4, { x: 6, y: 0, z: 3 }]]);
const elements = new Map([
  [1, { id: 1, nodeI: 1, nodeJ: 2 }], [2, { id: 2, nodeI: 2, nodeJ: 3 }], [3, { id: 3, nodeI: 2, nodeJ: 4 }],
]);
const ef = (elementId: number, nEnd: number, vzEnd: number, nStart = nEnd, vzStart = vzEnd) =>
  ({ elementId, nStart, nEnd, vyStart: 0, vyEnd: 0, vzStart, vzEnd, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0 });
const combos = [
  { id: 1, name: 'A', elementForces: [ef(1, -500, 0), ef(2, -480, 0), ef(3, 0, 5)] },
  { id: 2, name: 'B', elementForces: [ef(1, -300, 0), ef(2, -290, 0), ef(3, 20, 50)] },
];

describe('bolt demands at a joint', () => {
  const d = jointDemands(2, [1, 2, 3], elements, combos, nodes);

  it('leave out the column that runs through the node', () => {
    expect(d.boltPairs.every((p) => p.elementId === 3)).toBe(true);
    expect(Math.max(...d.boltPairs.map((p) => p.tensionKN))).toBe(20);
  });

  it('keep each pair from one combination', () => {
    const b = d.boltPairs.find((p) => p.comboId === 2)!;
    expect(b).toMatchObject({ tensionKN: 20, shearKN: 50 });
    const a = d.boltPairs.find((p) => p.comboId === 1)!;
    expect(a).toMatchObject({ tensionKN: 0, shearKN: 5 });
  });

  it('while the governing axial alone still reports the column', () => {
    expect(d.axial?.elementId).toBe(1);
    expect(d.axial?.value).toBe(500);
  });

  it('count every member at a splice, where all of them run through', () => {
    const splice = jointDemands(2, [1, 2], elements, combos, nodes);
    expect(new Set(splice.boltPairs.map((p) => p.elementId))).toEqual(new Set([1, 2]));
  });
});
