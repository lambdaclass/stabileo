import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
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
  for (const item of cases) {
    const dim = item.spatial ? '3d' : '2d';
    const input = JSON.stringify(item.input);
    const raw = JSON.parse(engine[`solve_modal_${dim}`](input, item.expected.length+3));
    const checked = JSON.parse(engine[`certify_modal_${dim}`](input, item.expected.length+3));
    assert.deepEqual(raw, checked.results);
    assert.equal(raw.modes.length, item.expected.length);
    assert.equal(checked.certificate.status, 'certified');
    assert.equal(checked.certificate.completeModes, item.expected.length);
    for (let i=0; i<item.expected.length; i++) {
      assert.ok(Math.abs(raw.modes[i].omega**2-item.expected[i]) <= 1e-12*Math.abs(item.expected[i]));
      const bound = checked.certificate.modes[i];
      assert.ok(bound.omega2Lower <= item.expected[i] && item.expected[i] <= bound.omega2Upper);
    }
  }
  console.log(`${cases.length} modal mass range WASM family cases passed`);
}
console.log('Modal mass range WASM issue witnesses passed');
