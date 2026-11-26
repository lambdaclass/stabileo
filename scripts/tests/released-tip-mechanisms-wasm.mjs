import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const mechanism = error => /the structure is a mechanism/.test(String(error));

for (const dimension of [2, 3]) {
  const rows = cases.filter(row => row.dimension === dimension);
  assert.ok(rows.some(row => row.refuses) && rows.some(row => !row.refuses));
  const suffix = dimension === 2 ? '2d' : '3d';
  for (const [index, { input, stage, refuses }] of rows.entries()) {
    const pdeltaInput = refuses ? input : {
      ...input,
      loads: input.loads.map(load => ({ ...load, data: { ...load.data, nodeId: 1 } })),
    };
    const calls = {
      linear: () => engine[`solve_${suffix}`](input),
      certified: () => engine[`certify_linear_${suffix}`](input),
      constrained: () => engine[`solve_constrained_${suffix}`](JSON.stringify({ solver: input, constraints: [] })),
      staged: () => engine[`solve_staged_${suffix}`](JSON.stringify({ ...input, stages: [stage] })),
      pdelta: () => engine[`solve_pdelta_${suffix}`](JSON.stringify(pdeltaInput), 100, 1e-12),
    };
    for (const [name, call] of Object.entries(calls)) {
      if (refuses) {
        const inclinedStage = dimension === 2 && name === 'staged' &&
          Object.values(input.supports).some(support => support.type === 'inclinedRoller');
        const expected = inclinedStage
          ? error => /Inclined supports are not yet supported in staged construction analysis/.test(String(error))
          : mechanism;
        assert.throws(call, expected, `${suffix} ${name} case ${index}`);
      } else {
        assert.doesNotThrow(call, `${suffix} ${name} control`);
      }
    }
  }
}
