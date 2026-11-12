import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, analyze_kinematics_2d, analyze_kinematics_3d } from '../../web/src/lib/wasm/dedaliano_engine.js';
initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const models = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-round7.json', import.meta.url)));
const failures = [];
let checks = 0;
for (const dim of [2, 3]) for (const unit of [1e-3, 1, 1e3]) for (const unrelated of [1, 1e12]) for (const spring of [0, 1e-30, 1]) {
  checks++;
  try {
    const input = structuredClone(models[dim]);
    for (const n of Object.values(input.nodes)) for (const axis of ['x', 'y', 'z']) if (axis in n) n[axis] *= unit;
    input.materials[1].e = unit;
    input.materials[2].e = unit * unrelated;
    input.supports[2].kx = spring;
    const analyze = dim === 2 ? analyze_kinematics_2d : analyze_kinematics_3d;
    const out = JSON.parse(analyze(JSON.stringify(input)));
    assert.equal(out.invalidInput, undefined);
    assert.equal(out.isSolvable, spring > 0);
    assert.equal(out.mechanismModes, spring === 0 ? 1 : 0);
  } catch (e) { failures.push(`${dim}D unit=${unit} unrelated=${unrelated} spring=${spring}: ${e}`); }
}
assert.deepEqual(failures, []);
console.log(`round 7 WASM passed ${checks} constrained spring checks`);
