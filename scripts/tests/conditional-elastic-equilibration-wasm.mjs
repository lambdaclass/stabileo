import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(cases.length, 10);

for (const [index, { dimension, input, stage }] of cases.entries()) {
  const suffix = dimension + 'd';
  const label = suffix + ' case ' + index;
  const result = engine['solve_' + suffix](input);
  assert.ok(result.displacements.length > 0, label);
  const checked = engine['certify_linear_' + suffix](input);
  assert.deepEqual(checked.results.displacements, result.displacements, label);
  const constrained = JSON.parse(engine['solve_constrained_' + suffix](JSON.stringify({ solver: input, constraints: [] })));
  assert.deepEqual(constrained.displacements, result.displacements, label);
  const staged = JSON.parse(engine['solve_staged_' + suffix](JSON.stringify({ ...input, stages: [stage] })));
  assert.equal(staged.stages.length, 1, label);
  assert.equal(staged.finalResults.displacements.length, result.displacements.length, label);
}
