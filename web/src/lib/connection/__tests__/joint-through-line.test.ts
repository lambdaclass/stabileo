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
 * the chord runs through and only the web is bolted. So is a diagonal ending at a chord, whatever
 * element type it was drawn with: only a member within 15° of vertical is read as a column, and a
 * Warren diagonal drawn as a frame had put the chord's 900 kN through the bolts as tension.
 *
 * Where two lines cross and neither is a column — secondary beams framing into a girder from both
 * sides — the geometry does not say which is continuous, and every member is bolted. Taking the
 * first pair listed as through let the beams' line run through, and the bolts were checked for the
 * girder's 55 kN instead of the beam's 100 kN, depending on the order the members were listed in.
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

describe('bolt pairs where a secondary beam frames into a continuous girder from both sides', () => {
  // Node 1 at the origin, no column. Girder along X (elements 3, 4), beams along Y (elements 1, 2).
  const at = new Map([
    [1, { x: 0, y: 0, z: 3 }],
    [2, { x: 0, y: -5, z: 3 }], [3, { x: 0, y: 5, z: 3 }],
    [4, { x: -6, y: 0, z: 3 }], [5, { x: 6, y: 0, z: 3 }],
  ]);
  const els = new Map([
    [1, { id: 1, nodeI: 2, nodeJ: 1 }], [2, { id: 2, nodeI: 1, nodeJ: 3 }],
    [3, { id: 3, nodeI: 4, nodeJ: 1 }], [4, { id: 4, nodeI: 1, nodeJ: 5 }],
  ]);
  // Beam 1 delivers 100 kN, beam 2 10 kN; the girder's end shears either side are 55 kN.
  const cs = [{ id: 1, name: 'U', elementForces: [ef(1, 0, 100), ef(2, 0, 10), ef(3, 0, 55), ef(4, 0, 55)] }];

  it("check the bolts for the beam's 100 kN end shear, whatever order the members are listed in", () => {
    for (const ids of [[1, 2, 3, 4], [3, 4, 1, 2]]) {
      const d = jointDemands(1, ids, els, cs, at);
      expect(Math.max(...d.boltPairs.map((p) => p.shearKN))).toBe(100);
    }
  });
});

describe('bolt pairs at a truss panel point with web members drawn as frames', () => {
  // Bottom chord along X through node 1 (elements 1, 2), Warren diagonals up (3, 4), all frames.
  const at = new Map([
    [1, { x: 0, y: 0, z: 0 }], [2, { x: -2, y: 0, z: 0 }], [3, { x: 2, y: 0, z: 0 }],
    [4, { x: -1, y: 0, z: 1.5 }], [5, { x: 1, y: 0, z: 1.5 }],
  ]);
  const els = new Map([
    [1, { id: 1, nodeI: 2, nodeJ: 1 }], [2, { id: 2, nodeI: 1, nodeJ: 3 }],
    [3, { id: 3, nodeI: 1, nodeJ: 4 }], [4, { id: 4, nodeI: 1, nodeJ: 5 }],
  ]);
  const cs = [{ id: 1, name: 'U', elementForces: [ef(1, 900, 2), ef(2, 900, 2), ef(3, -80, 1), ef(4, 80, 1)] }];

  it("keep the chord running through: its 900 kN is not bolt tension", () => {
    const d = jointDemands(1, [1, 2, 3, 4], els, cs, at);
    expect(new Set(d.boltPairs.map((p) => p.elementId))).toEqual(new Set([3, 4]));
    expect(Math.max(...d.boltPairs.map((p) => p.tensionKN))).toBe(80);
  });
});
