import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.ok(cases.some(row => row.dimension === 2) && cases.some(row => row.dimension === 3 && row.refuses));

for (const [index, { dimension, input, refuses }] of cases.entries()) {
  const call = () => JSON.parse(engine[`solve_nonlinear_material_${dimension}d`](JSON.stringify(input)));
  if (refuses) {
    assert.throws(call, error => /not supported.*rotation/i.test(String(error)), String(index));
    continue;
  }
  const result = call();
  assert.equal(result.converged, true, String(index));
  const support = Object.values(input.solver.supports).find(support => support.dx || support.dy || support.dz);
  const member = Object.values(input.solver.elements).find(member => member.id === 1);
  const node = member.nodeI === support.nodeId ? member.nodeJ : member.nodeI;
  const tip = result.results.displacements.find(d => d.nodeId === node);
  const translation = [support.dx ?? 0, support.dy ?? 0, support.dz ?? 0];
  const displacement = [tip.ux, tip.uy ?? 0, tip.uz];
  for (const [axis, expected] of translation.entries()) {
    assert.ok(Math.abs(displacement[axis] - expected) <= input.tolerance * Math.hypot(...translation), `${index} axis ${axis}`);
  }
}
