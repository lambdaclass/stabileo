import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
let checks = 0;
for (const c of JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-removal-r20.json', import.meta.url)))) {
  const solve = () => JSON.parse(engine[`solve_staged_${c.dim}d`](JSON.stringify(c.model)));
  if (c.refused) {
    assert.throws(solve, /#1996/, c.name);
  } else {
    const output = solve();
    for (const { results: r } of output.stages.slice(1)) {
      assert.ok(!(r.structuredDiagnostics ?? []).some(d => d.code === 'result_quantity_unavailable'), c.name);
      const expected = c.load * 5 / (200000 * 1000 * 0.01);
      const u = r.displacements.find(d => d.nodeId === 1).ux;
      assert.ok(Math.abs(u - expected) <= 1e-12 * Math.max(Math.abs(expected), 1e-30), `${c.name}: ${u} != ${expected}`);
      const reaction = r.reactions.find(r => r.nodeId === 0)[c.dim === 2 ? 'rx' : 'fx'];
      assert.ok(Math.abs(reaction + c.load) <= 1e-12 * Math.max(Math.abs(c.load), 1e-30), c.name);
      assert.equal(r.elementForces.length, 1);
    }
    assert.deepEqual(output.finalResults, output.stages[2].results);
  }
  checks++;
}
for (const c of JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-global-springs-r20.json', import.meta.url)))) {
  const solve = () => JSON.parse(engine[`solve_staged_${c.dim}d`](JSON.stringify(c.model)));
  if (c.refused) {
    assert.throws(solve, /Inclined supports/);
  } else {
    const r = solve().finalResults;
    assert.equal(r.displacements.length, 1);
    assert.equal(r.reactions.length, 1);
    const fields = c.dim === 2 ? [['ux','uz'], ['rx','rz']] : [['ux','uy','uz'], ['fx','fy','fz']];
    for (const [i, group] of ['displacements', 'reactions'].entries()) {
      for (const [j, key] of fields[i].entries()) assert.ok(Math.abs(r[group][0][key] - (i === 0 ? c.u : c.r)[j]) < 1e-12, JSON.stringify(c));
    }
  }
  checks++;
}
console.log(`round 20 WASM passed ${checks} removal and global spring checks`);
