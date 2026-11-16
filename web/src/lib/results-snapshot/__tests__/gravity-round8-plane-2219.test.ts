import { beforeAll, expect, it } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { solve_2d, solve_pdelta_2d, solve_corotational_2d } from '../../wasm/dedaliano_engine.js';

beforeAll(async () => { await initSolver(); });
const solves = {
  linear: (s: object) => solve_2d(s),
  pdelta: (s: object) => solve_pdelta_2d(JSON.stringify(s), 100, 1e-10),
  corotational: (s: object) => solve_corotational_2d(JSON.stringify(s), 100, 1e-10, 4),
};
for (const [entry, solve] of Object.entries(solves)) for (const axis of ['x', 'y', 'z']) {
  it.skip(`known wrong result: #2219 plane ${entry} refuses member moment fields ${axis}`, () => {
    const s = {
      nodes: { 1: { id: 1, x: 0, z: 0 }, 2: { id: 2, x: 1, z: 0 } },
      elements: { 1: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } },
      materials: { 1: { id: 1, e: 1000, nu: 0, rho: 1 } },
      sections: { 1: { id: 1, a: 0.1, iz: 0.001 } },
      supports: { 1: { id: 1, nodeId: 1, type: 'fixed' } },
      loads: [{ type: 'distributed', data: { elementId: 1, qI: 0, qJ: 0, a: 0, b: 1, moments: { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0], [axis]: [1, 1, 1] } } }],
    };
    expect(() => solve(s)).toThrow(/moments/);
  });
}
