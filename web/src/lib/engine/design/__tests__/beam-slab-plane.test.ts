import { describe, it, expect } from 'vitest';
import { beamFlanges, beamsInSlabPlane } from '../beam-flange';

/**
 * A beam embedded in a slab meshed past it: the shell covers the beam's midpoint and shares neither
 * end node, so there is no flange to measure, and the slab is still around the beam.
 */
const nodes = new Map([
  [1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 4, y: 0, z: 3 }], [3, { id: 3, x: 4, y: 4, z: 3 }], [4, { id: 4, x: 0, y: 4, z: 3 }],
  [5, { id: 5, x: 1, y: 2, z: 3 }], [6, { id: 6, x: 3, y: 2, z: 3 }],
  [7, { id: 7, x: 10, y: 0, z: 3 }], [8, { id: 8, x: 14, y: 0, z: 3 }],
  // An edge beam whose axis runs 0,15 m past the slab's edge, its inner face on it.
  [9, { id: 9, x: 0, y: -0.15, z: 3 }], [10, { id: 10, x: 4, y: -0.15, z: 3 }],
]);
const elements = new Map([
  [1, { id: 1, nodeI: 5, nodeJ: 6, sectionId: 1 }],
  [2, { id: 2, nodeI: 7, nodeJ: 8, sectionId: 1 }],
  [3, { id: 3, nodeI: 9, nodeJ: 10, sectionId: 1 }],
]);
const sections = new Map([[1, { b: 0.3, h: 0.3 }]]);
const quads = new Map([[1, { id: 1, nodes: [1, 2, 3, 4], thickness: 0.3 }]]);

describe('a beam in the plane of a slab', () => {
  it('is found inside a shell that shares none of its nodes, and only there', () => {
    const m = { nodes, elements, sections, quads };
    expect(beamFlanges(m).size).toBe(0);
    expect([...beamsInSlabPlane(m)]).toEqual([1, 3]);
  });

  it('not where the insertions put the slab away from the beam\'s top', () => {
    const low = new Map([[1, { id: 1, nodes: [1, 2, 3, 4], thickness: 0.3, offset: { frame: 'global', x: 0, y: 0, z: -1 } as never }]]);
    expect(beamsInSlabPlane({ nodes, elements, sections, quads: low }).size).toBe(0);
  });
});
