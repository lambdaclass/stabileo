import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, solve_2d, solve_3d, solve_staged_2d, solve_staged_3d } from '../../web/src/lib/wasm/dedaliano_engine.js';

initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const archived = JSON.parse(readFileSync(new URL('../../engine/tests/metamorphic_corpus/nightly/issue-1085.json', import.meta.url)));

function model(dim, copies, factor, linked) {
  const source = structuredClone(archived);
  source.supports[1].dz *= factor;
  if (dim === 3) {
    for (const node of Object.values(source.nodes)) node.y = 0;
    delete source.elements[1].hingeStart;
    delete source.elements[1].hingeEnd;
    Object.assign(source.sections[1], { iy: source.sections[1].iz, j: source.sections[1].iz });
    for (const axis of ['rx', 'ry', 'rz', 'rrx', 'rry', 'rrz']) source.supports[1][axis] = true;
  }
  if (!linked) {
    delete source.nodes[3];
    source.constraints = [];
  }
  const result = { ...source, nodes: {}, elements: {}, supports: {}, constraints: [] };
  for (let copy = 0; copy < copies; copy++) {
    for (const node of Object.values(source.nodes)) {
      const id = node.id + 3 * copy;
      result.nodes[id] = { ...node, id };
    }
    const id = copy + 1;
    result.elements[id] = { ...source.elements[1], id, nodeI: 1 + 3 * copy, nodeJ: 2 + 3 * copy };
    result.supports[id] = { ...source.supports[1], id, nodeId: 1 + 3 * copy };
    if (linked) result.constraints.push({ ...source.constraints[0], masterNode: 2 + 3 * copy, slaveNode: 3 + 3 * copy });
  }
  return result;
}

function reference(result, input, dim) {
  const dz = input.supports[1].dz;
  const a = input.nodes[1];
  const b = input.nodes[2];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const force = input.materials[1].e * input.sections[1].a * Math.abs(dz) / length;
  for (const [group, fields, scale, count] of [
    ['displacements', dim === 2 ? ['ux', 'uz'] : ['ux', 'uy', 'uz'], Math.abs(dz), Object.keys(input.nodes).length],
    ['displacements', dim === 2 ? ['ry'] : ['rx', 'ry', 'rz'], Math.abs(dz) / length, Object.keys(input.nodes).length],
    ['reactions', dim === 2 ? ['rx', 'rz'] : ['fx', 'fy', 'fz'], force, Object.keys(input.supports).length],
    ['reactions', dim === 2 ? ['my'] : ['mx', 'my', 'mz'], force * length, Object.keys(input.supports).length],
    ['elementForces', dim === 2 ? ['nStart', 'nEnd', 'vStart', 'vEnd'] : ['nStart', 'nEnd', 'vyStart', 'vyEnd', 'vzStart', 'vzEnd'], force, Object.keys(input.elements).length],
    ['elementForces', dim === 2 ? ['mStart', 'mEnd'] : ['mxStart', 'mxEnd', 'myStart', 'myEnd', 'mzStart', 'mzEnd'], force * length, Object.keys(input.elements).length],
  ]) {
    assert.equal(result[group]?.length, count, group);
    for (const item of result[group]) for (const field of fields) {
      const actual = item[field];
      const expected = group === 'displacements' && field === 'uz' ? dz : 0;
      assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 2.5e-10 * scale, `${group} ${field}: ${actual} != ${expected}`);
    }
  }
}

let histories = 0;
for (const dim of [2, 3]) for (const linked of [false, true]) for (const copies of [1, 22]) for (const factor of [1, -1, 0]) {
  const input = model(dim, copies, factor, linked);
  reference((dim === 2 ? solve_2d : solve_3d)(input), input, dim);
  const solve = dim === 2 ? solve_staged_2d : solve_staged_3d;
  assert.throws(() => solve(JSON.stringify({ ...input, stages: [] })), /No construction stages defined/);
  for (const count of [1, 2, 3]) {
    input.stages = [{ name: 'settle', elementsAdded: Object.values(input.elements).map(e => e.id), supportsAdded: Object.values(input.supports).map(s => dim === 2 ? s.id : s.nodeId) }];
    for (let i = 1; i < count; i++) input.stages.push({ name: 'hold' });
    const result = JSON.parse(solve(JSON.stringify(input)));
    assert.equal(result.stages.length, count);
    for (const stage of result.stages) reference(stage.results, input, dim);
    reference(result.finalResults, input, dim);
    if (factor !== 0) {
      const wrong = structuredClone(result.finalResults);
      wrong.displacements.find(d => d.nodeId === 2).uz *= 2;
      assert.throws(() => reference(wrong, input, dim));
    }
    assert.throws(() => reference({ ...result.finalResults, displacements: [] }, input, dim));
    for (const [group, key] of [['displacements', 'nodeId'], ['reactions', 'nodeId'], ['elementForces', 'elementId']]) {
      const missing = structuredClone(result.finalResults);
      missing[group].pop();
      assert.throws(() => reference(missing, input, dim), `${group} missing ID`);
      const unknown = structuredClone(result.finalResults);
      unknown[group][0][key] = -1;
      assert.throws(() => reference(unknown, input, dim), `${group} unknown ID`);
      const absent = structuredClone(result.finalResults);
      delete absent[group][0][key];
      assert.throws(() => reference(absent, input, dim), `${group} absent ID`);
      if (result.finalResults[group].length > 1) {
        const duplicate = structuredClone(result.finalResults);
        duplicate[group][1] = structuredClone(duplicate[group][0]);
        assert.throws(() => reference(duplicate, input, dim), `${group} duplicate replaces missing ID`);
      }
      const reordered = structuredClone(result.finalResults);
      reordered[group].reverse();
      reference(reordered, input, dim);
    }
    histories++;
  }
}
console.log(`#1085 WASM passed ${histories} settlement histories against the rigid-translation reference`);
