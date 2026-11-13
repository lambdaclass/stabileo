import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
let checks = 0;
for (const dim of [2, 3]) {
  for (const kind of ['staged', 'pdelta']) {
    const cases = JSON.parse(readFileSync(`${process.argv[2]}-${kind}-${dim}.json`));
    for (const c of cases) {
      const width = dim === 2 ? 3 : 6;
      for (const padding of [0, Math.floor(64 / width) - 2, Math.floor(64 / width) - 1]) {
        for (const iterations of kind === 'pdelta' ? [0, 40] : [40]) {
          const model = structuredClone(c.model);
          for (let i = 0; i < padding; i++) {
            const id = 100 + i;
            model.nodes[id] = { ...model.nodes[1], id, x: model.nodes[1].x + i + 1 };
            model.elements[id] = { ...model.elements[1], id, nodeJ: id, [dim === 2 ? 'hingeEnd' : 'releaseMyEnd']: false };
            if (kind === 'staged') model.stages.at(-1).elementsAdded.push(id);
          }
          const solve = () => engine[`solve_${kind}_${dim}d`](JSON.stringify(model), ...(kind === 'pdelta' ? [iterations, 1e-9] : []));
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
            if (padding === 0 && iterations === 40) assert.deepEqual(output, c.output);
            if (kind === 'pdelta' && iterations === 0 && c.model.loads[0].data.fx !== 0) assert.equal(output.results.equilibrium.residualOk, false);
          }
          checks++;
        }
      }
    }
  }
}
console.log(`${checks} native/WASM containment cases passed`);
