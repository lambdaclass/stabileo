import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, solve_3d, solve_staged_3d } from '../../web/src/lib/wasm/dedaliano_engine.js';

initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const fixture = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-round8.json', import.meta.url)));
const failures = [];
let checks = 0;
const close = (got, expected) => assert.ok(Number.isFinite(got) && Math.abs(got - expected) <= 1e-10, `${got} != ${expected}`);
function check(label, run) {
  checks++;
  try { run(); } catch (error) { failures.push(`${label}: ${error}`); }
}
function history(axis, pads, constrained, residual) {
  const input = structuredClone(fixture);
  for (const [i, field] of ['x', 'y', 'z'].entries()) input.nodes[2][field] = axis[i];
  for (const [i, field] of ['mx', 'my', 'mz'].entries()) {
    input.loads[0].data[field] = axis[i] / 4;
    input.loads[1].data[field] = (-1 + residual) * axis[i] / 4;
  }
  if (constrained) {
    input.nodes[3] = { ...input.nodes[2], id: 3 };
    input.supports[3] = { ...input.supports[2], nodeId: 3 };
    input.constraints = [{ type: 'equalDOF', masterNode: 2, slaveNode: 3, dofs: [3, 4, 5] }];
    for (const load of input.loads) load.data.nodeId = 3;
  }
  for (let i = 0; i < pads; i++) {
    const a = 100 + 2 * i;
    const b = a + 1;
    input.nodes[a] = { ...input.nodes[1], id: a };
    input.nodes[b] = { ...input.nodes[1], id: b, x: 1 };
    input.elements[a] = { ...input.elements[1], id: a, nodeI: a, nodeJ: b };
    input.supports[a] = { ...input.supports[1], nodeId: a };
  }
  input.stages[0].elementsAdded = Object.values(input.elements).map(e => e.id);
  input.stages[0].supportsAdded = Object.values(input.supports).map(s => s.nodeId);
  return input;
}
const axes = [[4, 4, 0], [4, -4, 0], [0, 4, 4], [4, 0, 4], [4, 0, 0]];
for (const pads of [0, 4, 5]) for (const constrained of [false, true]) {
  for (const axis of axes) for (const residual of [0, Number.EPSILON, -Number.EPSILON]) {
    check(`axis=${axis} pads=${pads} constrained=${constrained} residual=${residual}`, () => {
      const input = history(axis, pads, constrained, residual);
      assert.throws(() => solve_staged_3d(JSON.stringify(input)), /#1996/);
      const prefix = structuredClone(input);
      prefix.stages = prefix.stages.slice(0, 1);
      const out = JSON.parse(solve_staged_3d(JSON.stringify(prefix)));
      const shear = input.materials[1].e * 1000 / (2 * (1 + input.materials[1].nu));
      const expected = axis.map(x => x / 4 * Math.hypot(...axis) / (shear * input.sections[1].j));
      for (const stage of out.stages) {
        const tip = stage.results.displacements.find(d => d.nodeId === 2);
        for (const [i, field] of ['rx', 'ry', 'rz'].entries()) close(tip[field], expected[i]);
      }
      const unloadedControl = structuredClone(input);
      for (const load of unloadedControl.loads) Object.assign(load.data, { mx: 0, my: 0, mz: 0 });
      {
      const out = JSON.parse(solve_staged_3d(JSON.stringify(unloadedControl)));
      assert.deepEqual(out.finalResults.elementForces.map(e => e.elementId).sort((a,b) => a-b), Object.values(input.elements).filter(e => e.id !== 1).map(e => e.id).sort((a,b) => a-b));
      assert.deepEqual(out.finalResults.reactions.map(r => r.nodeId).sort((a,b) => a-b), Object.values(input.supports).map(s => s.nodeId).sort((a,b) => a-b));
      for (const [group, fields] of [
        ['reactions', ['fx', 'fy', 'fz', 'mx', 'my', 'mz']],
        ['elementForces', ['nStart', 'nEnd', 'vyStart', 'vyEnd', 'vzStart', 'vzEnd', 'mxStart', 'mxEnd', 'myStart', 'myEnd', 'mzStart', 'mzEnd']],
      ]) for (const row of out.finalResults[group]) for (const field of fields) close(row[field], 0);
      }
    });
  }
  check(`supported increment pads=${pads} constrained=${constrained}`, () => {
    const input = history([4, 4, 0], pads, constrained, 0);
    const load = structuredClone(input.loads[1]);
    Object.assign(load.data, { mx: -1, my: 1 });
    input.loads.push(load);
    input.stages[1].loadIndices.push(2);
    const referenceInput = structuredClone(input);
    delete referenceInput.elements[1];
    referenceInput.loads = [load];
    const reference = solve_3d(referenceInput);
    assert.throws(() => solve_staged_3d(JSON.stringify(input)), /#1996/);
    assert.ok(Math.abs(reference.displacements.find(d => d.nodeId === 2).rx) > 0);
    const unloadedControl = structuredClone(input);
    for (const load of unloadedControl.loads.slice(0, 2)) Object.assign(load.data, { mx: 0, my: 0, mz: 0 });
    {
    const out = JSON.parse(solve_staged_3d(JSON.stringify(unloadedControl)));
    for (const tip of reference.displacements) {
      const got = out.finalResults.displacements.find(d => d.nodeId === tip.nodeId);
      for (const field of ['rx', 'ry', 'rz']) close(got[field], tip[field]);
    }
    assert.deepEqual(out.finalResults.reactions.map(r => r.nodeId).sort((a,b) => a-b), reference.reactions.map(r => r.nodeId).sort((a,b) => a-b));
    for (const reaction of reference.reactions) {
      const got = out.finalResults.reactions.find(r => r.nodeId === reaction.nodeId);
      for (const field of ['fx', 'fy', 'fz', 'mx', 'my', 'mz']) close(got[field], reaction[field]);
    }
    }
  });
}
assert.deepEqual(failures, []);
console.log(`round 8 WASM passed ${checks} rotated cancellation, residual-load and supported-increment checks`);
