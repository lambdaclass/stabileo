import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, solve_3d, solve_plastic_3d, certify_plastic_3d, analyze_kinematics_3d } from '../../web/src/lib/wasm/dedaliano_engine.js';

initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const source = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/final-review-plastic-conditioning.json', import.meta.url)));
const failures = [];
let checks = 0;
for (const inertia of [1e-14, 0.001]) for (const pads of [0, 10, 11]) for (const rotated of [false, true]) {
  const input = structuredClone(source);
  input.solver.sections[1].iy = inertia;
  input.solver.sections[1].iz = inertia;
  if (rotated) {
    for (const n of Object.values(input.solver.nodes)) [n.x, n.y, n.z] = [n.z, n.x, n.y];
    Object.assign(input.solver.loads[0].data, { fx: 1, fz: 0 });
  }
  for (let i = 0; i < pads; i++) {
    const a = 100 + 2 * i;
    const b = a + 1;
    input.solver.nodes[a] = { ...input.solver.nodes[1], id: a };
    input.solver.nodes[b] = { ...input.solver.nodes[1], id: b, x: 1 };
    input.solver.elements[a] = { ...input.solver.elements[1], id: a, nodeI: a, nodeJ: b };
    input.solver.supports[a] = { ...input.solver.supports[1], nodeId: a };
  }
  for (const [name, solve] of [['raw', solve_plastic_3d], ['certified', certify_plastic_3d]]) {
    checks++;
    try {
      if (inertia === 1e-14) {
        assert.equal(JSON.parse(analyze_kinematics_3d(JSON.stringify(input.solver))).isSolvable, false);
        assert.throws(() => solve_3d(input.solver), /conditioning limit/);
        assert.throws(() => solve(JSON.stringify(input)), /conditioning limit/);
      } else {
        const out = JSON.parse(solve(JSON.stringify(input)));
        const r = out.results ?? out;
        assert.equal(r.isMechanism, true);
        assert.ok(Math.abs(r.collapseFactor - 200 / Math.hypot(4, 2)) <= 1e-9, `${r.collapseFactor}`);
      }
    } catch (error) {
      failures.push(`inertia=${inertia} pads=${pads} rotated=${rotated} ${name}: ${error}`);
    }
  }
}
assert.deepEqual(failures, []);
console.log(`final plastic WASM passed ${checks} initial conditioning refusals and valid controls`);
