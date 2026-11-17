import { beforeAll, expect, it } from 'vitest';
import { initSolver } from '../wasm-solver';
import model from '../../../../../engine/tests/fixtures/narrow-span-2222.json';

let wasm: any;
beforeAll(async () => { await initSolver(); wasm = await import('../../wasm/dedaliano_engine.js'); });

for (const dim of [2, 3]) for (const mode of ['linear', 'session', 'pdelta', 'corotational', 'fiber']) {
  it.skip(`known wrong result: #2223 — ${dim}D ${mode} saved diagrams integrate huge intensities without an overflowing slope`, () => {
    const input: any = structuredClone(model);
    input.loads = [];
    if (dim === 3) {
      for (const node of Object.values(input.nodes) as any[]) node.y = 0;
      for (const section of Object.values(input.sections) as any[]) Object.assign(section, { iy: 1, j: 1 });
      for (const support of Object.values(input.supports) as any[]) Object.assign(support, { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
    }
    const session = new wasm[`LoadSession${dim}D`](input);
    try {
      const result = mode === 'linear' ? wasm[`solve_${dim}d`](input)
        : mode === 'session' ? session.solve([])
        : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input), 20, 1e-9)).results
        : mode === 'corotational' ? JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(input), 40, 1e-12, 1)).results
        : JSON.parse(wasm[`solve_fiber_nonlinear_${dim}d`](JSON.stringify({ solver: input, fiberSections: {}, nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-9, nIncrements: 1 }))).results;
      const a = 2 ** -20;
      const span = 2 ** -28;
      for (const q of [2 ** 1000, 1]) for (const [left, right] of [[0, 1], [1, 0], [1, 1], [-1, 1]]) {
        const saved = structuredClone(result);
        const ef = saved.elementForces[0];
        for (const key of dim === 2 ? ['distributedLoads'] : ['distributedLoadsY', 'distributedLoadsZ']) ef[key] = [{ a, b: a + span, qI: q * left, qJ: q * right }];
        const kinds = dim === 2 ? ['shear', 'moment'] : ['shearY', 'shearZ', 'momentY', 'momentZ'];
        for (const kind of kinds) for (const x of [0, a / 2, a, a + span / 2, a + span, a + 2 * span, 3]) {
          const value = wasm[dim === 2 ? 'compute_diagram_value_at' : 'compute_diagram_value_at_3d'](JSON.stringify({ kind, t: x / ef.length, elementForces: ef }));
          if (x <= a) { expect(value).toBe(0); continue; }
          const u = Math.min((x - a) / span, 1);
          const g = Math.sqrt(3 / 5);
          let expected = 0;
          for (const [t, weight] of [[-g, 5 / 9], [0, 8 / 9], [g, 5 / 9]]) {
            const station = (t + 1) * u / 2;
            let contribution = (left * (1 - station) + right * station) * weight * u / 2;
            if (kind.startsWith('moment')) contribution *= u - station;
            expected += contribution;
          }
          if (kind.startsWith('moment')) expected += (left * (u - u * u / 2) + right * u * u / 2) * ((x - a) / span - u);
          if (kind === 'moment' || kind === 'momentZ') expected = -expected;
          const actual = value / (q * span) / (kind.startsWith('moment') ? span : 1);
          expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-13 * Math.max(1, Math.abs(expected)));
        }
        const diagrams = JSON.parse(wasm[`compute_diagrams_${dim}d`](JSON.stringify(dim === 2 ? { input, results: saved } : saved)));
        for (const kind of kinds) for (const diagram of diagrams[kind]) {
          expect(diagram.points.every((point: any) => Number.isFinite(point.value))).toBe(true);
          expect(diagram.points[0].value).toBe(0);
        }
      }
    } finally { session.free(); }
  });
}
