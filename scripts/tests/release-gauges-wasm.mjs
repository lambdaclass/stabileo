import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({
  module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)),
});

const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(cases.length, 5);
for (const { label, input, expected, relTol } of cases) {
  const result = JSON.parse(engine.solve_nonlinear_material_3d(JSON.stringify(input)));
  assert.equal(result.converged, true, label);
  const actual = result.results.displacements.find(displacement => displacement.nodeId === 2).uz;
  assert.ok(Math.abs((actual - expected) / expected) <= relTol, `${label}: ${actual} vs ${expected}`);
}

const modalCases = JSON.parse(readFileSync(process.argv[3], 'utf8'));
assert.equal(modalCases.length, 5);
for (const { label, input, expected, nullModesExpected = 0 } of modalCases) {
  const json = JSON.stringify(input);
  const result = JSON.parse(engine.solve_modal_3d(json, 6));
  const certified = JSON.parse(engine.certify_modal_3d(json, 6));
  assert.deepEqual(certified.results, result, label);
  assert.equal(result.nullModes?.length ?? 0, nullModesExpected, label);
  assert.equal(result.modes.length, expected.length, label);
  for (const [i, mode] of result.modes.entries()) {
    assert.ok(Math.abs((mode.omega - expected[i]) / expected[i]) <= 1e-12, label);
  }
}
