import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
let checked = 0;
for (const dim of [2, 3]) {
  for (const kind of (dim === 3 ? ['pdelta', 'time', 'shells', 'mpc'] : ['pdelta', 'time', 'mpc'])) {
    const cases = JSON.parse(readFileSync(`${process.argv[2]}-${kind}-${dim}.json`));
    for (const c of cases) {
      const api = kind === 'time' ? 'time_history' : 'pdelta';
      const args = [JSON.stringify(c.model), ...(kind !== 'time' ? [c.iterations, c.tolerance] : [])];
      const solve = () => JSON.parse(engine[`solve_${api}_${dim}d`](...args));
      const certify = () => JSON.parse(engine[`certify_${api}_${dim}d`](...args));
      if (c.error) {
        const nativeRefusal = JSON.parse(c.error);
        for (const invoke of [solve, certify]) {
          assert.throws(invoke, error => {
            const refusal = JSON.parse(String(error));
            const diagnostic = refusal.structuredDiagnostics[0];
            assert.equal(refusal.message, nativeRefusal.message);
            assert.equal(diagnostic.code, 'result_quantity_unavailable');
            assert.equal(diagnostic.severity, 'error');
            assert.equal(diagnostic.phase, 'equilibrium');
            assert.equal(diagnostic.threshold, c.tolerance);
            assert.ok(Number.isFinite(diagnostic.value) && diagnostic.value > c.tolerance);
            return true;
          });
        }
        checked++;
        continue;
      }
      const result = solve();
      assert.deepEqual(result, c.output);
      assert.deepEqual(certify().results, result);
      if (kind === 'time') assert.deepEqual(result.peakReactions, []);
      checked++;
    }
  }
}
console.log(`${checked} native/WASM P-Delta and time-history cases passed through solve and certify`);
