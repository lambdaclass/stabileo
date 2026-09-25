import { describe, it, expect } from 'vitest';
import { mergeAllHingedJoints2D } from '../orphan-rotations-2d';
import type { SolverInput, SolverLoad } from '../types';

/* Two bars meeting at node 2, both released there: a crown hinge drawn on both sides. */
function crown(loads: SolverLoad[] = [], sup2?: string): SolverInput {
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 2, z: 1 }], [3, { id: 3, x: 4, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: true }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: true, hingeEnd: false }],
    ]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }], [2, { id: 2, nodeId: 3, type: 'pinned' }],
      ...(sup2 ? [[3, { id: 3, nodeId: 2, type: sup2 }]] as const : [])]),
    loads,
  } as unknown as SolverInput;
}

describe('mergeAllHingedJoints2D', () => {
  it('makes one end continuous at a joint where every member is released, leaving the hinge', () => {
    const input = crown();
    const out = mergeAllHingedJoints2D(input);
    expect(out.elements.get(1)!.hingeEnd).toBe(false);
    expect(out.elements.get(2)!.hingeStart).toBe(true);
    expect(input.elements.get(1)!.hingeEnd).toBe(true); // the input is not touched
  });

  it('leaves a joint alone when a nodal moment acts on its rotation', () => {
    const input = crown([{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: 5 } }]);
    expect(mergeAllHingedJoints2D(input)).toBe(input);
  });

  it('leaves a joint alone when a fixed support holds its rotation', () => {
    const input = crown([], 'fixed');
    expect(mergeAllHingedJoints2D(input)).toBe(input);
  });

  it('returns the same input when there is nothing to merge', () => {
    const input = crown();
    input.elements.set(2, { ...input.elements.get(2)!, hingeStart: false });
    expect(mergeAllHingedJoints2D(input)).toBe(input);
  });
});
