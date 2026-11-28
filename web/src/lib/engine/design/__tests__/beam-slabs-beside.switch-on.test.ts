/**
 * The slabs along a beam, as its sections draw them: the side of its run each is on, its thickness,
 * and its top against the beam's top, taken cast with it where neither declares an insertion.
 */
import { describe, it, expect } from 'vitest';
import { beamSlabsBeside } from '../beam-flange';

const nodes = new Map([
  [1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 5, y: 0, z: 3 }],
  [3, { id: 3, x: 5, y: 4, z: 3 }], [4, { id: 4, x: 0, y: 4, z: 3 }],
  [5, { id: 5, x: 5, y: -3, z: 3 }], [6, { id: 6, x: 0, y: -3, z: 3 }],
]);
const elements = new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1 }]]);
const sections = new Map([[1, { b: 0.2, h: 0.5 }]]);

describe('the slabs beside a beam', () => {
  it('say on which side of the beam\'s run each lies and how thick it is, cast with its top', () => {
    const quads = new Map([[1, { id: 1, nodes: [1, 2, 3, 4], thickness: 0.12 }], [2, { id: 2, nodes: [1, 2, 5, 6], thickness: 0.15 }]]);
    expect(beamSlabsBeside({ nodes, elements, sections, quads }).get(1)).toEqual([{ side: 1, hf: 0.12, top: 0 }, { side: -1, hf: 0.15, top: 0 }]);
  });

  it('read a slab its insertion puts lower as standing that far below the beam\'s top', () => {
    const quads = new Map([[1, { id: 1, nodes: [1, 2, 3, 4], thickness: 0.12, offset: { frame: 'global', x: 0, y: 0, z: 0.14 } as never }]]);
    expect(beamSlabsBeside({ nodes, elements, sections, quads }).get(1)).toEqual([{ side: 1, hf: 0.12, top: -0.05, placed: true }]);
  });

  it('find none for a beam no horizontal slab runs along', () => {
    const quads = new Map([[1, { id: 1, nodes: [1, 2, 3, 4].map((n) => n), thickness: 0.12 }]]);
    const lone = new Map([[2, { id: 2, nodeI: 3, nodeJ: 5, sectionId: 1 }]]);
    expect(beamSlabsBeside({ nodes, elements: lone, sections, quads }).size).toBe(0);
  });
});
