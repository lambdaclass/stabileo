import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.ok(cases.some(row => row.dimension === 2 && row.refuses) && cases.some(row => row.dimension === 3));

for (const [index, { dimension, input, refuses }] of cases.entries()) {
  const args = JSON.stringify(input);
  const solve = () => JSON.parse(engine[`solve_harmonic_${dimension}d`](args));
  const certified = () => JSON.parse(engine[`certify_harmonic_${dimension}d`](args));
  if (refuses) {
    const singular = error => /singular/.test(String(error));
    assert.throws(solve, singular, String(index));
    assert.throws(certified, singular, String(index));
    continue;
  }
  const result = solve();
  assert.equal(result.responsePoints.length, input.frequencies.length, String(index));
  assert.equal(result.responsePoints[0].frequency, 0, String(index));
  assert.ok(result.responsePoints[0].imag === 0, String(index));
  assert.deepEqual(certified().results, result, String(index));
}
