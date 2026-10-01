/**
 * Which member runs through a joint decides what the bolts carry.
 *
 * At an interior joint two collinear lines cross: the column (below and above) and the beams
 * (both sides). The column runs through and the beams are bolted to it. Taking every collinear
 * pair as «through» left nothing to bolt, and the fallback brought the column's 800 kN
 * pass-through axial back as bolt tension.
 *
 * At a column head the beams from both sides are collinear and the column ends. Whether the beam
 * runs over a cap plate (the bolts carry the column's reaction, the sum of the beams' end shears)
 * or the beams frame into the column (each carries its own end shear) is a detail the model does
 * not hold, so both are checked; dropping the beams lost their shear from every bolt check.
 *
 * A vertical that is axial-only (a truss member) under a continuous chord is the gusset detail:
 * the chord runs through and only the web is bolted.
 */
import { describe, it, expect } from 'vitest';
import { jointDemands } from '../joint-demands';

// Interior node 2 at (0,0,3): column below (1) and above (2), beam left (3) and right (4).
const nodes = new Map([
  [1, { x: 0, y: 0, z: 0 }], [2, { x: 0, y: 0, z: 3 }], [3, { x: 0, y: 0, z: 6 }],
  [4, { x: -6, y: 0, z: 3 }], [5, { x: 6, y: 0, z: 3 }],
]);
const elements = new Map([
  [1, { id: 1, nodeI: 1, nodeJ: 2 }], [2, { id: 2, nodeI: 2, nodeJ: 3 }],
  [3, { id: 3, nodeI: 4, nodeJ: 2 }], [4, { id: 4, nodeI: 2, nodeJ: 5 }],
]);
const ef = (elementId: number, n: number, vz: number) =>
  ({ elementId, nStart: n, nEnd: n, vyStart: 0, vyEnd: 0, vzStart: vz, vzEnd: vz, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0 });
const combos = [{ id: 1, name: 'U', elementForces: [ef(1, -800, 5), ef(2, -760, 5), ef(3, 0, 60), ef(4, 0, 60)] }];

describe('bolt pairs at an interior beam-column joint', () => {
  it('do not take the column axial (it runs through) as bolt tension', () => {
    const d = jointDemands(2, [1, 2, 3, 4], elements, combos, nodes);
    expect(new Set(d.boltPairs.map((p) => p.elementId))).toEqual(new Set([3, 4]));
    expect(Math.max(...d.boltPairs.map((p) => p.tensionKN))).toBe(0);
    expect(Math.max(...d.boltPairs.map((p) => p.shearKN))).toBe(60);
  });
});

describe('bolt pairs at a roof column head with beams on both sides', () => {
  // Node 2 is the column top; beams 3 and 4 end there from both sides (collinear).
  const els = new Map([
    [1, { id: 1, nodeI: 1, nodeJ: 2 }],
    [3, { id: 3, nodeI: 4, nodeJ: 2 }], [4, { id: 4, nodeI: 2, nodeJ: 5 }],
  ]);
  const cs = [{ id: 1, name: 'U', elementForces: [ef(1, -120, 0), ef(3, 0, 60), ef(4, 0, 60)] }];

  it('keeps the beams whose shear the bolts carry, and the column reaction a cap would carry', () => {
    const d = jointDemands(2, [1, 3, 4], els, cs, nodes);
    expect(new Set(d.boltPairs.map((p) => p.elementId))).toEqual(new Set([1, 3, 4]));
    expect(Math.max(...d.boltPairs.map((p) => p.shearKN))).toBe(60);
    expect(Math.max(...d.boltPairs.map((p) => p.tensionKN))).toBe(120);
  });

  it('but a truss vertical under a continuous chord leaves the chord running through', () => {
    const truss = new Map([
      [1, { id: 1, nodeI: 1, nodeJ: 2, type: 'truss' }],
      [3, { id: 3, nodeI: 4, nodeJ: 2 }], [4, { id: 4, nodeI: 2, nodeJ: 5 }],
    ]);
    const chord = [{ id: 1, name: 'U', elementForces: [ef(1, -120, 0), ef(3, 900, 0), ef(4, 900, 0)] }];
    const d = jointDemands(2, [1, 3, 4], truss, chord, nodes);
    expect(d.boltPairs.map((p) => p.elementId)).toEqual([1]);
  });
});
