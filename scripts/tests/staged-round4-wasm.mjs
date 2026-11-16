import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, solve_plastic_3d, certify_plastic_3d } from '../../web/src/lib/wasm/dedaliano_engine.js';

initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const source = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-round4-plastic.json', import.meta.url)));
const soft = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-round4-soft-hinge.json', import.meta.url)));
const failures = [];
let checks = 0;
function check(label, run) {
  checks++;
  try { run(); } catch (error) { failures.push(`${label}: ${error}`); }
}
function collapse(input, label, factor) {
  for (const [name, solve] of [['raw', solve_plastic_3d], ['certified', certify_plastic_3d]]) {
    check(`${label}, ${name}`, () => {
      const out = JSON.parse(solve(JSON.stringify(input)));
      const result = out.results ?? out;
      assert.equal(result.isMechanism, true);
      assert.ok(Number.isFinite(result.collapseFactor) && result.collapseFactor > 0);
      if (factor !== undefined) assert.ok(Math.abs(result.collapseFactor - factor) <= 1e-9);
    });
  }
}
for (const propped of [false, true]) {
  for (const torsion of [1e-5, 1e-11, 1e-15, 1e-17]) {
    for (const pads of [0, propped ? 10 : 8, propped ? 11 : 9]) {
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
      for (let i = 0; i < pads; i++) {
        const a = 100 + 2 * i;
        const b = a + 1;
        input.solver.nodes[a] = { ...input.solver.nodes[1], id: a };
        input.solver.nodes[b] = { ...input.solver.nodes[1], id: b, x: input.solver.nodes[1].x + 1 };
        input.solver.elements[a] = { ...input.solver.elements[1], id: a, nodeI: a, nodeJ: b };
        input.solver.supports[a] = { ...input.solver.supports[1], nodeId: a };
      }
      collapse(input, `propped=${propped}, torsion=${torsion}, pads=${pads}`, propped ? 100 : 200);
    }
  }
}
collapse(soft, 'hinge-induced coupled softness');
for (const torsion of [1e-11, 1e-13, 1e-15, 1e-17]) {
  const input = structuredClone(source);
  input.solver.nodes[3].y = 4;
  input.solver.nodes[4].y = 4;
  input.solver.sections[1].j = torsion;
  collapse(input, `hinge-induced conditioning, torsion=${torsion}`);
}
const initial = structuredClone(soft);
initial.solver = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-review-round3.json', import.meta.url))).soft3;
initial.solver.loads = [{ type: 'nodal', data: { nodeId: 2, fx: 1, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }];
for (const [name, solve] of [['raw', solve_plastic_3d], ['certified', certify_plastic_3d]]) {
  check(`initial elastic coupled-soft refusal, ${name}`, () => assert.throws(() => solve(JSON.stringify(initial)), /coupled/));
}
assert.deepEqual(failures, []);
console.log(`round 4 plastic WASM passed ${checks} raw/certified mechanism and initial-refusal checks`);
