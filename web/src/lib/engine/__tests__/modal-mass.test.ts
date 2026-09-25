import { describe, it, expect } from 'vitest';
import { cumulativeMassRatios } from '../modal-mass';
import { solveModal3D } from '../wasm-solver';
import type { SolverInput3D } from '../types-3d';

/** A 6 m cantilever along Z in 12 elements, fixed at the base. */
function cantilever(): SolverInput3D {
  const n = 12;
  const nodes = new Map(Array.from({ length: n + 1 }, (_, i) => [i + 1, { id: i + 1, x: 0, y: 0, z: (6 * i) / n }]));
  const elements = new Map(Array.from({ length: n }, (_, i) => [i + 1, {
    id: i + 1, type: 'frame' as const, nodeI: i + 1, nodeJ: i + 2, materialId: 1, sectionId: 1,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
  }]));
  return {
    nodes,
    materials: new Map([[1, { id: 1, e: 30_000, nu: 0.2 }]]),
    sections: new Map([[1, { id: 1, a: 0.09, iy: 6.75e-4, iz: 6.75e-4, j: 1.14e-3 }]]),
    elements,
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [],
  } as unknown as SolverInput3D;
}

describe('the modal table accumulates mass, not participation factors', () => {
  it('adds the mass ratio of each mode', () => {
    const modes = [{ massRatioX: 0.6 }, { massRatioX: 0.2 }, {}];
    expect(cumulativeMassRatios(modes, 'X')).toEqual([0.6, 0.8, 0.8]);
    expect(cumulativeMassRatios(modes, 'Y')).toEqual([0, 0, 0]);
  });

  it('a cantilever’s first mode carries about 61 % of the mass, though its Γ is above 1', () => {
    const res = solveModal3D(cantilever(), new Map([[1, 2446.5]]), 6);
    const first = res.modes.find((m: { massRatioX: number }) => m.massRatioX > 0.3);
    expect(Math.abs(first.participationX)).toBeGreaterThan(1.3);
    const cum = cumulativeMassRatios(res.modes, 'X');
    const i = res.modes.indexOf(first);
    expect(cum[i]).toBeGreaterThan(0.55);
    expect(cum[i]).toBeLessThan(0.7);
    // Never more than the whole mass, and never decreasing.
    expect(cum[cum.length - 1]).toBeLessThanOrEqual(1 + 1e-9);
    for (let k = 1; k < cum.length; k++) expect(cum[k]).toBeGreaterThanOrEqual(cum[k - 1]);
  });
});
