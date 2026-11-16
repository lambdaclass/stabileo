import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const controls = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/modal-full-rank-main.json', import.meta.url)));
for (const item of controls) {
  assert.deepEqual(JSON.parse(engine[`solve_modal_${item.dim}`](JSON.stringify(item.input), 6)), item.expected);
}
const triage = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/nightly-triage-2026-11-12.json', import.meta.url)));
for (const [name, expected] of [
  ['1965', [229973.5106775624807203244627724831574865, 6243695.142236023281772709849489862244977]],
  ['rotated-1965', [229973.5106775600935160982784968364555173, 6243695.142236013914171040611438743782218]],
]) {
  const input = JSON.stringify({ solver: triage[name], densities: triage['1965']._nightly_dens });
  const raw = JSON.parse(engine.solve_modal_2d(input, 6));
  const checked = JSON.parse(engine.certify_modal_2d(input, 6));
  assert.deepEqual(raw, checked.results);
  assert.equal(raw.modes.length, 2);
  assert.equal(checked.certificate.status, 'certified');
  assert.equal(checked.certificate.completeModes, 2);
  for (let i=0; i<2; i++) {
    const bound = checked.certificate.modes[i];
    assert.ok(bound.omega2Lower <= expected[i] && expected[i] <= bound.omega2Upper);
  }
}
if (process.argv[2]) {
  const cases = readFileSync(process.argv[2], 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(cases.length > 0);
  assert.ok(cases.some(item => item.refusal), 'exported family must include massless mechanism refusals');
  for (const item of cases) {
    const dim = item.spatial ? '3d' : '2d';
    const input = JSON.stringify(item.input);
    if (item.refusal) {
      for (const api of ['solve_modal', 'certify_modal']) {
        assert.throws(() => engine[`${api}_${dim}`](input, 3), /Eigenvalue decomposition failed/);
      }
      continue;
    }
    const raw = JSON.parse(engine[`solve_modal_${dim}`](input, item.expected.length+3));
    const checked = JSON.parse(engine[`certify_modal_${dim}`](input, item.expected.length+3));
    assert.deepEqual(raw, checked.results);
    assert.equal(raw.modes.length, item.expected.length);
    assert.equal(checked.certificate.status, 'certified');
    assert.equal(checked.certificate.completeModes, item.expected.length);
    for (const count of [1, item.expected.length]) {
      const partial = JSON.parse(engine[`certify_modal_${dim}`](input, count));
      assert.equal(partial.results.modes.length, count);
      assert.equal(partial.certificate.modes.length, count);
      for (let i=0; i<count; i++) {
        assert.ok(Math.abs(partial.results.modes[i].omega**2-item.expected[i]) <= 1e-12*Math.abs(item.expected[i]));
        const bound = partial.certificate.modes[i];
        assert.ok(bound.omega2Lower <= item.expected[i] && item.expected[i] <= bound.omega2Upper);
      }
    }
    for (let i=0; i<item.expected.length; i++) {
      assert.ok(Math.abs(raw.modes[i].omega**2-item.expected[i]) <= 1e-12*Math.abs(item.expected[i]));
      const bound = checked.certificate.modes[i];
      assert.ok(bound.omega2Lower <= item.expected[i] && item.expected[i] <= bound.omega2Upper);
    }
  }
  console.log(`${cases.length} modal mass range WASM family cases passed`);
}
console.log('Modal mass range WASM issue witnesses passed');
const restrained = JSON.stringify({solver:{
  nodes:{1:{id:1,x:0,y:0,z:0}}, materials:{},sections:{},elements:{},loads:[],
  supports:{1:{nodeId:1,rx:false,ry:false,rz:false,rrx:false,rry:false,rrz:false,kx:1,ky:1,kz:1,isInclined:true,normalX:1,normalY:0,normalZ:0}},
  masses:{nodal:[{nodeId:1,massX:1}]}
},densities:{}});
for (const api of ['solve_modal_3d','certify_modal_3d']) {
  assert.throws(() => engine[api](restrained, 3), /physical_mass_range/);
}
console.log('Restrained physical mass refuses through raw and certified WASM APIs');
