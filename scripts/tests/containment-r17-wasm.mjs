import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const kinds = process.argv[3] ? [process.argv[3]] : ['staged', 'pdelta'];
assert.ok(kinds.every(kind => ['staged', 'pdelta'].includes(kind)));
let checks = 0;
for (const dim of [2, 3]) {
  for (const kind of kinds) {
    const cases = JSON.parse(readFileSync(`${process.argv[2]}-${kind}-${dim}.json`));
    for (const c of cases) {
      const width = dim === 2 ? 3 : 6;
      for (const padding of [0, Math.floor(64 / width) - 1, Math.floor(64 / width)]) {
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
          } else if (kind === 'pdelta' && iterations === 0 && c.model.loads[0].data.fx !== 0) {
            assert.throws(solve, /non_finite_result/);
          } else {
            const output = JSON.parse(solve());
            const results = kind === 'staged' ? [...output.stages.map(s => s.results), output.finalResults] : [output.results];
            const active = new Set();
            const expectedCounts = kind === 'staged' ? model.stages.map(stage => {
              for (const id of stage.elementsAdded ?? []) active.add(id);
              for (const id of stage.elementsRemoved ?? []) active.delete(id);
              return active.size;
            }) : [Object.keys(model.elements).length];
            if (kind === 'staged') expectedCounts.push(active.size);
            for (const [index, r] of results.entries()) {
              const diagnostics = (r.structuredDiagnostics ?? []).filter(d => d.code === 'result_quantity_unavailable');
              for (const d of diagnostics) {
                const fields = d.phase === 'stageResults' ? ['reactions', 'elementForces', 'constraintForces', 'plateStresses', 'quadStresses', 'quadNodalStresses'] : [d.phase];
                for (const field of fields) {
                  if (kind === 'pdelta') {
                    for (const row of r[field] ?? []) {
                      const keys = field === 'reactions' ? (dim === 2 ? ['rx', 'rz', 'my'] : ['fx', 'fy', 'fz', 'mx', 'my', 'mz']) : field === 'elementForces' ? ['nStart', 'nEnd'] : ['force'];
                      for (const key of keys) assert.equal(row[key], null);
                    }
                  } else assert.deepEqual(r[field] ?? [], [], `${kind} ${dim}D ${field}`);
                }
              }
              if (!diagnostics.length) {
                assert.ok(r.reactions.length > 0);
                assert.equal(r.elementForces.length, expectedCounts[index]);
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
