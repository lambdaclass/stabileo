import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
let checks = 0;
for (const dim of [2, 3]) {
  const cases = JSON.parse(readFileSync(`${process.argv[2]}-${dim}.json`));
  for (const c of cases) {
    const m = c.model;
    const output = JSON.parse(engine[`solve_staged_${dim}d`](JSON.stringify(m)));
    const load = m.loads[0].data.fz, length = m.nodes[1].x;
    const ei = m.materials[1].e * 1000 * m.sections[1][dim === 2 ? 'iz' : 'iy'];
    for (const r of [...output.stages.map(s => s.results), output.finalResults]) {
      assert.ok(r.elementForces.length > 0);
      assert.ok(!(r.structuredDiagnostics ?? []).some(d => d.code === 'result_quantity_unavailable'));
      const root = r.reactions.find(r => r.nodeId === 0);
      assert.ok(Math.abs(root[dim === 2 ? 'rz' : 'fz'] + load) < 1e-9);
      assert.ok(Math.abs(root.my - (dim === 2 ? -load * length : load * length)) < 1e-9);
      const master = r.reactions.find(r => r.nodeId === 2);
      for (const [key, value] of Object.entries(master)) if (key !== 'nodeId') assert.equal(value, 0);
      for (const f of r.constraintForces ?? []) assert.equal(f.force, 0);
      const tip = r.displacements.find(d => d.nodeId === 1);
      assert.ok(Math.abs(tip.uz - load * length ** 3 / (3 * ei)) < 1e-9);
      assert.equal(r.displacements.find(d => d.nodeId === 2).ry, c.motion);
    }
    checks++;
  }
}
console.log(`${checks} staged physical reaction cases passed through WASM`);
