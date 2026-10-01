/**
 * The node tool's guard in space: the node under the cursor is the click only when it is on the
 * working plane; otherwise a node at the placement point, else none (place one).
 */
import { describe, it, expect } from 'vitest';
import { nodeAtPlacement3D } from '../node-placement';

const nodes = new Map([
  [1, { id: 1, x: 2, y: 0, z: 3 }],   // a column top
  [2, { id: 2, x: 5, y: 0, z: 0 }],   // on the ground
]);

describe('the space node tool', () => {
  it('seen in plan, the column top drawn over the spot does not stop a node going below it', () => {
    expect(nodeAtPlacement3D(1, { x: 2, y: 0, z: 0 }, 'XY', nodes)).toBeNull();
  });
  it('a node under the cursor on the working plane is the click', () => {
    expect(nodeAtPlacement3D(2, { x: 5.3, y: 0, z: 0 }, 'XY', nodes)).toBe(2);
    expect(nodeAtPlacement3D(1, { x: 2.2, y: 0, z: 3 }, 'XY', nodes)).toBe(1);
  });
  it('a placement point the snap put on a node is that node, with nothing under the cursor', () => {
    expect(nodeAtPlacement3D(null, { x: 5.005, y: 0, z: 0 }, 'XY', nodes)).toBe(2);
    expect(nodeAtPlacement3D(null, { x: 5.02, y: 0, z: 0 }, 'XY', nodes)).toBeNull();
  });
});
