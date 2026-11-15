import { describe, expect, it } from 'vitest';
import { advancedRefusal2D } from '../solver-service';
import type { SolverInput } from '../types';

type El = [id: number, i: number, j: number, hingeStart: boolean, hingeEnd: boolean];

function frame(nodes: Array<[number, number, number]>, elements: El[], supports: Array<[number, number, string]>): SolverInput {
  return {
    nodes: new Map(nodes.map(([id, x, z]) => [id, { id, x, z }])),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map(elements.map(([id, nodeI, nodeJ, hingeStart, hingeEnd]) => [id, { id, type: 'frame', nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart, hingeEnd }])),
    supports: new Map(supports.map(([id, nodeId, type]) => [id, { id, nodeId, type }])),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }],
  } as unknown as SolverInput;
}

describe('a joint where every member is hinged and one is hinged at both ends', () => {
  it('is no mechanism under simply supported spans on columns fixed at their base', () => {
    const pier = frame(
      [[1, 0, 0], [2, 10, 0], [3, 20, 0], [4, 30, 0], [5, 10, -6], [6, 20, -6]],
      [[1, 1, 2, false, true], [2, 2, 3, true, true], [3, 3, 4, true, false], [4, 5, 2, false, true], [5, 6, 3, false, true]],
      [[1, 1, 'pinned'], [2, 4, 'rollerX'], [3, 5, 'fixed'], [4, 6, 'fixed']],
    );
    expect(advancedRefusal2D(pier)).toBeNull();
  });

  it('is a mechanism on a portal whose columns and beam are all pin-ended', () => {
    const portal = frame(
      [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]],
      [[1, 1, 2, true, true], [2, 2, 3, true, true], [3, 4, 3, true, true]],
      [[1, 1, 'pinned'], [2, 4, 'pinned']],
    );
    expect(advancedRefusal2D(portal)).not.toBeNull();
  });
});
