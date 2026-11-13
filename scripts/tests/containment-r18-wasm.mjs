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
      if (kind !== 'time' && !c.output.results.equilibrium.residualOk) {
        assert.throws(solve, e => {
          const refusal = JSON.parse(String(e));
          assert.equal(refusal.structuredDiagnostics[0].code, 'non_finite_result');
          assert.equal(refusal.structuredDiagnostics[0].severity, 'error');
          return true;
        });
        assert.throws(certify, /non-finite/);
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
