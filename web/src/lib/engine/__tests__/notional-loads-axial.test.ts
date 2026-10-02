/**
 * Notional loads count a member's load along its own axis too.
 *
 * Since main passes a frame's distributed load to the engine in all three local directions, a
 * column's own weight reaches the solver input as an axial load (qX), not as two nodal forces.
 * `lumpedNodalForces` read only qY and qZ, so the notional loads of a column under its own weight
 * left that weight out: 0.005 × 100 kN where the column carries 100 + its 3.14 kN.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { buildSolverInput3D } from '../solver-service';
import { isSolverReady } from '../wasm-solver';
import { withNotionalLoads } from '../advanced-analyses';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(isSolverReady()).toBe(true);
});
beforeEach(() => modelStore.clear());

const A = 0.01, RHO = 78.5, H = 4;

describe('notional loads', () => {
  it('are 0.005 of the whole vertical load, the column\'s own weight included', () => {
    modelStore.restore({
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: H }]],
      materials: [[1, { id: 1, name: 'S', e: 200_000, nu: 0.3, rho: RHO }]],
      sections: [[1, { id: 1, name: 'S', a: A, iz: 1e-5, iy: 2e-5, j: 1e-6 }]],
      elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
      supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }]],
      loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }], combinations: [],
      nextId: { node: 10, material: 10, section: 10, element: 10, support: 10, load: 1 },
    } as never);
    modelStore.addNodalLoad3D(2, 0, 0, -100, 0, 0, 0, 1);
    const m = modelStore.model;
    const input = buildSolverInput3D({ ...m, loads: modelStore.loads } as never, true, false, { expandMemberOffsets: false })!;
    const { totalH, totalV } = withNotionalLoads(input, 0.005, 'X');
    const W = RHO * A * H;
    expect(totalV).toBeCloseTo(100 + W, 6);
    expect(totalH).toBeCloseTo(0.005 * (100 + W), 9);
  });
});
