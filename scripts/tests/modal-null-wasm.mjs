import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = readFileSync(process.argv[2], 'utf8').trim().split('\n').map(JSON.parse);
for (const [index, { api, count, input, expected }] of cases.entries()) {
  test(`${api} case ${index + 1}`, () => {
    const solve = () => JSON.parse(engine[api](JSON.stringify(input), count));
    if (expected.refusal) {
      assert.throws(solve, error => {
        const diagnostic = String(error);
        return diagnostic.includes(expected.refusal)
          && (expected.detail === undefined || diagnostic.includes(expected.detail))
          && (expected.node === undefined || diagnostic.includes(`moves node ${expected.node} along u`));
      });
      return;
    }
    const response = solve();
    const result = response.results ?? response;
    assert.equal(result.modes.length, expected.modes);
    assert.equal(result.nullModes?.length ?? 0, expected.nulls);
    assert.ok(result.modes.every(mode => mode.omega > 0));
    if (expected.omegaSquared !== undefined) {
      assert.ok(Math.abs(result.modes[0].omega ** 2 / expected.omegaSquared - 1) < 1e-12);
    }
  });
}
