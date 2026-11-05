import { describe, it, expect, vi } from 'vitest';
import type { SolverInput } from '../../types';
import { E, I } from './fixtures';

const seen = vi.hoisted(() => ({ largest: 0 }));
vi.mock('../dense', async (orig) => {
  const mod = await orig<typeof import('../dense')>();
  return { ...mod, matMul: (a: number[][], b: number[][]) => { seen.largest = Math.max(seen.largest, a.length * (b[0]?.length ?? 0)); return mod.matMul(a, b); } };
});

const { buildSystem } = await import('../system');

function heldChain(n: number): SolverInput {
  const nodes = new Map(Array.from({ length: n + 1 }, (_, k) => [k + 1, { id: k + 1, x: k, z: 0 }]));
  const elements = new Map(Array.from({ length: n }, (_, k) => [k + 1, { id: k + 1, type: 'frame' as const, nodeI: k + 1, nodeJ: k + 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]));
  const supports = new Map(Array.from({ length: n }, (_, k) => [k + 1, { id: k + 1, nodeId: k + 1, type: 'fixed' as const }]));
  return {
    nodes, elements, supports,
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: I }]]),
    loads: [{ type: 'nodal', data: { nodeId: n + 1, fx: -10, fz: -1, my: 0 } }],
  };
}

describe('axially rigid members are counted before any matrix over them is built', () => {
  it('refuses 2000 members held at every joint but the last as indeterminate, with no member-by-member product', () => {
    seen.largest = 0;
    const b = buildSystem(heldChain(2000), { method: 'consistent', axialRigid: true });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason.key).toBe('course.second-order.refuse.rigidIndeterminate');
    expect(seen.largest).toBeLessThan(2000 * 2000);
  });

  it('still builds a single rigid cantilever', () => {
    const b = buildSystem(heldChain(1), { method: 'consistent', axialRigid: true });
    expect(b.ok).toBe(true);
  });
});
