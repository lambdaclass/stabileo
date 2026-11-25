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
        if (expected.code) {
          const prefix = 'MODAL-MECHANISM: ';
          assert.ok(diagnostic.startsWith(prefix));
          const [witness] = JSON.parse(diagnostic.slice(prefix.length)).structuredDiagnostics;
          assert.equal(witness.code, expected.code);
          assert.equal(witness.severity, 'error');
          if (expected.node !== undefined) assert.deepEqual(witness.nodeIds, [expected.node]);
          if (expected.component !== undefined) assert.deepEqual(witness.dofIndices, [expected.component]);
        }
        return diagnostic.includes(expected.refusal)
          && (expected.detail === undefined || diagnostic.includes(expected.detail))
          && (expected.node === undefined || diagnostic.includes(`has a mechanism at node ${expected.node} (dominant component: u`));
      });
      return;
    }
    const response = solve();
    const result = response.results ?? response;
    assert.equal(result.modes.length, expected.modes);
    assert.equal(result.nullModes?.length ?? 0, expected.nulls);
    assert.ok(result.modes.every(mode => mode.omega > 0));
    if (expected.omegaSquared !== undefined) {
      const actual = result.modes[0].omega ** 2;
      if (expected.omegaSquaredBound === undefined) {
        assert.ok(Math.abs(actual / expected.omegaSquared - 1) < 1e-12);
      } else {
        assert.ok(Math.abs(actual - expected.omegaSquared) <= expected.omegaSquaredBound);
      }
    }
  });
}
