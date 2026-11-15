import { describe, expect, it } from 'vitest';
import { runBuckling2D } from '../run-buckling';
import { DEFAULT_SETTINGS } from '../settings';
import type { SolverInput } from '../../types';

const E = 200_000, A = 0.002, IZ = 2e-6;

function triangle(): SolverInput {
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 4, z: 0 }], [3, { id: 3, x: 2, z: 3 }]]),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: IZ }]]),
    elements: new Map([
      [1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'truss', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [3, { id: 3, type: 'truss', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }], [2, { id: 2, nodeId: 2, type: 'rollerX' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fz: -100, my: 0 } }],
  } as unknown as SolverInput;
}

describe('compressed truss bars in the critical load', () => {
  it('each compressed bar carries its pin-ended Euler factor, and the weakest is reported', () => {
    const got = runBuckling2D(triangle(), { ...DEFAULT_SETTINGS });
    if (!got.ok) throw new Error('buckling refused');
    const bars = got.result.secondOrder.trussEuler;
    expect(bars.map((b) => b.elementId).sort()).toEqual([2, 3]);
    const L = Math.hypot(2, 3);
    const N = -100 / 2 / (3 / L);
    const lambda = (Math.PI ** 2 * E * 1000 * IZ) / (L * L) / -N;
    for (const b of bars) {
      expect(b.axialForce).toBeCloseTo(N, 6);
      expect(b.lambda).toBeCloseTo(lambda, 6);
    }
  });
});
