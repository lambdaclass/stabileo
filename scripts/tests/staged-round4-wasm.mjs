import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, solve_plastic_3d, certify_plastic_3d } from '../../web/src/lib/wasm/dedaliano_engine.js';

initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const source = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-round4-plastic.json', import.meta.url)));
for (const propped of [false, true]) {
  for (const torsion of [1e-5, 1e-11, 1e-15, 1e-17]) {
    const input = structuredClone(source);
    input.solver.sections[1].j = torsion;
    if (propped) {
      delete input.solver.nodes[3];
      delete input.solver.nodes[4];
      delete input.solver.elements[2];
      delete input.solver.elements[3];
      delete input.solver.supports[4];
      input.solver.supports[2] = { ...input.solver.supports[1], nodeId: 2, rry: false, rrz: false };
    }
    const raw = JSON.parse(solve_plastic_3d(JSON.stringify(input)));
    const certified = JSON.parse(certify_plastic_3d(JSON.stringify(input))).results;
    for (const result of [raw, certified]) {
      assert.equal(result.isMechanism, true);
      assert.ok(Number.isFinite(result.collapseFactor));
      assert.ok(Math.abs(result.collapseFactor - (propped ? 100 : 200)) <= 1e-9, `propped=${propped}, torsion=${torsion}: ${JSON.stringify(result)}`);
    }
  }
}
console.log('round 4 raw and certified plastic WASM joint-moment mechanisms passed');

const soft = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-round4-soft-hinge.json', import.meta.url)));
for (const solve of [solve_plastic_3d, certify_plastic_3d]) {
  const out = JSON.parse(solve(JSON.stringify(soft)));
  const result = out.results ?? out;
  assert.equal(result.isMechanism, true);
  assert.ok(Number.isFinite(result.collapseFactor) && result.collapseFactor > 0);
}
console.log('round 4 hinge-induced coupled-soft WASM state passed');
