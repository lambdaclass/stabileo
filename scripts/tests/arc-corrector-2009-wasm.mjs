import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(cases.length, 24);
let snapshots = 0;
for (const c of cases) {
  assert.equal(c.snapshots.length, c.input.maxSteps);
  for (const [index, expected] of c.snapshots.entries()) {
    const input = { ...c.input, maxSteps: index + 1 };
    const result = JSON.parse(engine.solve_arc_length(JSON.stringify(input)));
    assert.equal(result.converged, true);
    assert.equal(result.steps.length, input.maxSteps);
    assert.ok(result.finalLoadFactor > 0);
    assert.ok(Math.abs(result.finalLoadFactor - expected.loadFactor) <= 1e-11);
    for (const step of result.steps) {
      assert.equal(step.converged, true);
      if (c.motion !== 0) assert.ok(step.iterations >= 3);
    }
    const master = result.results.displacements.find(d => d.nodeId === 2);
    const slave = result.results.displacements.find(d => d.nodeId === 1);
    const field = c.rotation ? 'ry' : 'uz';
    assert.ok(Math.abs(master[field] - result.finalLoadFactor * c.motion) <= 1e-11);
    assert.ok(Math.abs(slave[field] - master[field]) <= 1e-11);
    assert.equal(result.results.displacements.length, expected.displacements.length);
    for (const d of expected.displacements) {
      const actual = result.results.displacements.find(a => a.nodeId === d.nodeId);
      assert.ok(actual);
      for (const field of ['ux', 'uz', 'ry']) {
        assert.ok(Math.abs(actual[field] - d[field]) <= 1e-11, `node ${d.nodeId} ${field}: ${actual[field]}, native equilibrium ${d[field]}`);
      }
    }
    snapshots++;
  }
}
console.log(`Arc corrector: ${snapshots} WASM step snapshots match native free equilibrium and prescribed motion`);
