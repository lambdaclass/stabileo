import { beforeAll, expect, it } from 'vitest';
import { initSolver } from '../wasm-solver';
import model from '../../../../../engine/tests/fixtures/narrow-span-2222.json';

let wasm: any;
beforeAll(async () => {
  await initSolver();
  wasm = await import('../../wasm/dedaliano_engine.js');
});

for (const dim of [2, 3]) for (const mode of ['linear', 'session', 'pdelta', 'corotational', 'fiber']) {
  it(`#2222 ${dim}D ${mode} accepts balanced cancelling nodal forces`, () => {
    const base: any = structuredClone(model);
    base.loads = [];
    if (dim === 3) {
      for (const n of Object.values(base.nodes) as any[]) n.y = 0;
      for (const s of Object.values(base.sections) as any[]) Object.assign(s, { iy: 1, j: 1 });
      for (const s of Object.values(base.supports) as any[]) Object.assign(s, { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
    }
    for (const axis of dim === 2 ? ['x', 'z'] : ['x', 'y', 'z']) for (const cancel of [true, false]) {
      const loads = (cancel ? [[1, 1e16], [3, 1], [1, -1e16]] : [[3, 1]]).map(([nodeId, force]) => ({ type: 'nodal', data: dim === 2 ? { nodeId, fx: 0, fz: 0, my: 0, ['f' + axis]: force } : { nodeId, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, ['f' + axis]: force } }));
      const input = { ...base, loads };
      const session = mode === 'session' ? new wasm[`LoadSession${dim}D`](base) : undefined;
      try {
        const result = mode === 'linear' ? wasm[`solve_${dim}d`](input)
          : mode === 'session' ? session.solve(loads)
          : mode === 'fiber' ? JSON.parse(wasm[`solve_fiber_nonlinear_${dim}d`](JSON.stringify({ solver: input, fiberSections: {}, nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-9, nIncrements: 1 }))).results
          : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input), 20, 1e-9)).linearResults
          : JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(input), 40, 1e-9, 1)).results;
        const k = dim === 2 ? axis === 'x' ? 0 : 1 : ['x', 'y', 'z'].indexOf(axis);
        if (mode !== 'corotational') {
          expect(result.equilibrium.appliedForceSum[k]).toBe(1);
          expect(result.equilibrium.equilibriumOk).toBe(true);
        }
        expect(result.reactions.find((r: any) => r.nodeId === 3)[dim === 2 ? axis === 'x' ? 'rx' : 'rz' : 'f' + axis]).toBe(-1);
      } finally { session?.free(); }
    }
  });
}
