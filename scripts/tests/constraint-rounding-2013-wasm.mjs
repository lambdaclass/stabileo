import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = process.argv.slice(2).flatMap(path => JSON.parse(readFileSync(path, 'utf8')));
assert.ok(cases.length > 0);

function verify(result, c) {
  if ('converged' in result) assert.equal(result.converged, true);
  const r = result.finalResults ?? result.results ?? result.steps?.at(-1) ?? result.combinationResults?.[0].results ?? result;
  assert.equal(r.displacements.length, c.expected.length);
  assert.deepEqual(r.displacements.map(d => d.nodeId).sort((a, b) => a - b), Object.values(c.model.nodes).map(n => n.id).sort((a, b) => a - b));
  const bound = Math.max(...c.expected.flat().map(Math.abs)) * 1e-8;
  for (const d of r.displacements) {
    const actual = c.dim === 2 ? [d.ux, d.uz] : [d.ux, d.uy, d.uz];
    actual.forEach((v, i) => assert.ok(Number.isFinite(v) && Math.abs(v - c.expected[d.nodeId - 1][i]) <= bound, `${v} != ${c.expected[d.nodeId - 1][i]}`));
    for (const v of c.dim === 2 ? [d.ry] : [d.rx, d.ry, d.rz]) assert.ok(Number.isFinite(v) && Math.abs(v) <= bound);
  }
}

for (const [index, c] of cases.entries()) {
  const s = c.model;
  const stage = { name: 'all', elementsAdded: Object.values(s.elements).map(e => e.id), supportsAdded: Object.keys(s.supports).map(Number), loadIndices: s.loads.map((_, i) => i) };
  const jsonCall = (api, input, ...args) => () => JSON.parse(engine[`${api}_${c.dim}d`](JSON.stringify(input), ...args));
  const runs = {
    linear: () => engine[`solve_${c.dim}d`](s),
    linearPcg: () => engine[`solve_${c.dim}d`]({ ...s, solverOptions: { method: 'pcg', tolerance: 1e-12, maxIterations: 100000 } }),
    certified: () => engine[`certify_linear_${c.dim}d`](s),
    session: () => {
      const session = new engine[`LoadSession${c.dim}D`](s);
      try { return session.solve(s.loads); } finally { session.free(); }
    },
    constrained: jsonCall('solve_constrained', { solver: s, constraints: s.constraints }),
    staged: jsonCall('solve_staged', { ...s, stages: [stage] }),
    stagedTwo: jsonCall('solve_staged', { ...s, stages: [stage, { name: 'second' }] }),
    creep: jsonCall('solve_creep_shrinkage', { solver: s, creepParams: {}, timeSteps: [{ tDays: 28, additionalLoads: [] }], agingCoefficient: 0.8 }),
    pdelta: jsonCall('solve_pdelta', s, 100, 1e-12),
    combinations: () => engine[`solve_multi_case_${c.dim}d`]({ solver: s, loadCases: [{ name: 'A', loads: s.loads }], combinations: [{ name: 'C', factors: { A: 1 } }] }),
  };
  for (const [name, run] of Object.entries(runs)) {
    if (name === 'pdelta' && !s.constraints.some(c => c.terms.every(t => t.dof >= (c.dim === 2 ? 2 : 3)))) continue;
    test(`${index} ${c.dim}D ${name} refused=${c.refused}`, () => {
      if (c.refused) assert.throws(run);
      else verify(run(), c);
    });
  }
}
