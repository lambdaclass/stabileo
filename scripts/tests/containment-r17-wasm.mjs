import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
let checks = 0;
for (const dim of [2, 3]) {
  for (const kind of ['staged', 'pdelta']) {
    const cases = JSON.parse(readFileSync(`${process.argv[2]}-${kind}-${dim}.json`));
    for (const c of cases) {
      const solve = () => engine[`solve_${kind}_${dim}d`](JSON.stringify(c.model), ...(kind === 'pdelta' ? [40, 1e-9] : []));
      if (c.error) {
        assert.throws(solve, /Nodal moment|free rotation/);
      } else {
        const output = JSON.parse(solve());
        const results = kind === 'staged' ? [...output.stages.map(s => s.results), output.finalResults] : [output.results];
        for (const r of results) {
          const diagnostics = (r.structuredDiagnostics ?? []).filter(d => d.code === 'result_quantity_unavailable');
          for (const d of diagnostics) {
            const fields = d.phase === 'stageResults' ? ['reactions', 'elementForces', 'constraintForces', 'plateStresses', 'quadStresses', 'quadNodalStresses'] : [d.phase];
            for (const field of fields) assert.deepEqual(r[field] ?? [], [], `${kind} ${dim}D ${field}`);
          }
          if (!diagnostics.length) {
            assert.ok(r.reactions.length > 0);
            assert.ok(r.elementForces.length > 0);
          }
        }
        assert.deepEqual(output, c.output);
      }
      checks++;
    }
  }
}
console.log(`${checks} native/WASM containment cases passed`);
