import { describe, expect, it } from 'vitest';
import { solveForceMethod } from '../solve';
import type { SolverInput } from '../../types';

function twoSpanOnSpring(): SolverInput {
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 5, z: 0 }], [3, { id: 3, x: 10, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 30_000, nu: 0.2 }]]),
    sections: new Map([[1, { id: 1, a: 0.06, iz: 4.5e-4 }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'fixed' }],
      [2, { id: 2, nodeId: 2, type: 'spring', ky: 2000 }],
      [3, { id: 3, nodeId: 3, type: 'rollerX' }],
    ]),
    loads: [
      { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } },
      { type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10 } },
    ],
  } as unknown as SolverInput;
}

describe('a spring support in the force method', () => {
  for (const [name, releases] of [['kept in the primary', undefined], ['taken as a redundant', ['s:2:1', 'r:1:2']]] as const) {
    it(`lists the spring force among the reactions, as the stiffness method gives it (${name})`, () => {
      const r = solveForceMethod(twoSpanOnSpring(), releases ? { releases: [...releases] } : {});
      const spring = r.final.reactions.find((q) => q.nodeId === 2 && q.component === 1);
      const dsm = r.stiffness.reactions.find((q) => q.nodeId === 2 && q.component === 1);
      expect(dsm).toBeDefined();
      expect(spring).toBeDefined();
      expect(spring!.value).toBeGreaterThan(1);
      expect(spring!.value).toBeCloseTo(dsm!.value, 6);
      expect(r.verification.ok).toBe(true);
      const sumZ = r.final.reactions.filter((q) => q.component === 1).reduce((s, q) => s + q.value, 0);
      expect(sumZ).toBeCloseTo(100, 6);
    });
  }
});
