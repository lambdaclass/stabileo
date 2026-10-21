import { describe, it, expect } from 'vitest';
import { validCells } from '../mesh-apply';

/** A unit square's corners and a point inside it, at z = 3. */
const P: Record<number, { x: number; y: number; z: number }> = {
  1: { x: 0, y: 0, z: 3 }, 2: { x: 1, y: 0, z: 3 }, 3: { x: 1, y: 1, z: 3 }, 4: { x: 0, y: 1, z: 3 }, 5: { x: 0.3, y: 0.3, z: 3 },
};
const at = (id: number) => P[id]!;

describe('a mesh cell as the model can hold it', () => {
  it('keeps a proper quad and a proper triangle as they are', () => {
    expect(validCells([1, 2, 3, 4], at)).toEqual([[1, 2, 3, 4]]);
    expect(validCells([1, 2, 3], at)).toEqual([[1, 2, 3]]);
  });

  it('leaves out a quad whose opposite corners landed on one node: it folds and has no area', () => {
    expect(validCells([1, 2, 3, 2], at)).toEqual([]);
  });

  it('makes a triangle of a quad that lost one corner to its neighbour', () => {
    expect(validCells([1, 2, 3, 3], at)).toEqual([[1, 2, 3]]);
  });

  it('splits a quad that turns back on itself along the diagonal that leaves two proper triangles', () => {
    // Corner 5 pulled inside: the cell is a dart, not convex.
    const cells = validCells([1, 2, 5, 4], at);
    expect(cells).toEqual([[1, 2, 5], [1, 5, 4]]);
  });
});
