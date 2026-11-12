import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, analyze_kinematics_2d, analyze_kinematics_3d, solve_staged_2d, solve_staged_3d } from '../../web/src/lib/wasm/dedaliano_engine.js';
initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const models = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-round7.json', import.meta.url)));
const failures = [];
let checks = 0;
for (const dim of [2, 3]) for (const unit of [1e-3, 1, 1e3]) for (const unrelated of [1, 1e12]) for (const spring of [0, 1e-30, 1]) {
  checks++;
  try {
    const input = structuredClone(models[dim]);
    for (const n of Object.values(input.nodes)) for (const axis of ['x', 'y', 'z']) if (axis in n) n[axis] *= unit;
    input.materials[1].e = 0.001 * unit;
    input.materials[2].e = 0.001 * unit * unrelated;
    input.supports[2].kx = spring;
    const analyze = dim === 2 ? analyze_kinematics_2d : analyze_kinematics_3d;
    const out = JSON.parse(analyze(JSON.stringify(input)));
    assert.equal(out.invalidInput, undefined);
    assert.equal(out.isSolvable, spring > 0);
    assert.equal(out.mechanismModes, spring === 0 ? 1 : 0);
  } catch (e) { failures.push(`${dim}D unit=${unit} unrelated=${unrelated} spring=${spring}: ${e}`); }
}
for (const dim of [2, 3]) {
  const input = structuredClone(models.inclined);
  if (dim === 3) {
    for (const n of Object.values(input.nodes)) n.y = 0;
    input.sections[1] = structuredClone(models[3].sections[1]);
    input.supports[1] = { ...models[3].supports[4], id: 1, nodeId: 1 };
    input.supports[2] = { ...models[3].supports[2], isInclined: true, normalX: 1 };
    for (const load of input.loads) Object.assign(load.data, { fy: 0, mx: 0, mz: 0 });
  }
  const solve = dim === 2 ? solve_staged_2d : solve_staged_3d;
  assert.throws(() => solve(JSON.stringify(input)), /Inclined supports are not yet supported/);
}
const flat = structuredClone(models.inclined);
flat.supports[2].type = 'rollerX';
const out = JSON.parse(solve_staged_2d(JSON.stringify(flat)));
assert.deepEqual(out.finalResults.reactions.map(r => r.nodeId).sort((a, b) => a - b), [1, 2]);
const tip = out.finalResults.reactions.find(r => r.nodeId === 2);
assert.equal(tip.rx, 0);
assert.equal(tip.rz, 2);
assert.deepEqual(failures, []);
console.log(`round 7 WASM passed ${checks} constrained spring checks`);
