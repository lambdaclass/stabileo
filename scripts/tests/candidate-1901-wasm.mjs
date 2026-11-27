import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nightlySolverFixture } from './nightly-solver-fixture.mjs';
import { assertPDeltaEquilibriumRefusal } from './pdelta-equilibrium-refusal.mjs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const input = nightlySolverFixture(read('../../engine/tests/fixtures/candidate-replay.json')['1901-body-0']);
const embeddings = read('../../engine/tests/fixtures/candidate-1901-embeddings.json');
const reference = read('../../testing/docs/audits/candidate-1901-reference.json')[1];

function compare(displacements, expected, axes) {
  assert.equal(displacements.length, expected.length);
  for (const d of displacements) {
    const e = expected.find(e => e.nodeId === d.nodeId);
    for (const [key, actualKey, sign] of axes) {
      const actual = sign * d[actualKey];
      const value = Number(e[key]);
      assert.ok(Number.isFinite(actual));
      assert.ok(Math.abs(actual - value) <= 1e-8 * Math.max(1, Math.abs(value)),
        `node ${d.nodeId} ${key}: ${actual} versus independent ${value}`);
    }
  }
}

function assertRefusal(solve, model) {
  assert.throws(() => solve(JSON.stringify(model), 100, 1e-12),
    error => assertPDeltaEquilibriumRefusal(error, 1e-12));
}

const axes2 = [['ux', 'ux', 1], ['uz', 'uz', 1], ['ry', 'ry', 1]];
test('1901 2D linear agrees with independent reference', () => {
  compare(engine.solve_2d(input).displacements, reference.linear, axes2);
});
test('1901 2D P-Delta retains explicit nonconvergence', () => {
  assertRefusal(engine.solve_pdelta_2d, input);
  assertRefusal(engine.certify_pdelta_2d, input);
});
for (const [plane, axes] of Object.entries({
  XZ: [['ux', 'ux', 1], ['uz', 'uz', 1], ['ry', 'ry', -1]],
  XY: [['ux', 'ux', 1], ['uz', 'uy', 1], ['ry', 'rz', 1]],
  YZ: [['ux', 'uy', 1], ['uz', 'uz', 1], ['ry', 'rx', 1]],
})) {
  test(`1901 ${plane} linear agrees with independent 2D reference`, () => {
    compare(engine.solve_3d(embeddings[plane]).displacements, reference.linear, axes);
  });
  test(`1901 ${plane} P-Delta retains explicit nonconvergence`, () => {
    assertRefusal(engine.solve_pdelta_3d, embeddings[plane]);
    assertRefusal(engine.certify_pdelta_3d, embeddings[plane]);
  });
}

test('1901 rigidly rotated 2D P-Delta retains explicit nonconvergence', () => {
  const angle = 37 * Math.PI / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rotated = structuredClone(input);
  for (const n of Object.values(rotated.nodes)) {
    const { x, z } = n;
    n.x = c*x - s*z;
    n.z = s*x + c*z;
  }
  assertRefusal(engine.solve_pdelta_2d, rotated);
  assertRefusal(engine.certify_pdelta_2d, rotated);
});

for (const [name, model, solve, fields] of [
  ['2D', input, engine.solve_pdelta_2d, ['ux', 'uz', 'ry']],
  ...Object.entries(embeddings).map(([plane, model]) => [plane, model, engine.solve_pdelta_3d, ['ux', 'uy', 'uz', 'rx', 'ry', 'rz']]),
]) {
  test(`1901 unloaded ${name} P-Delta retains its exact answer`, () => {
    const unloaded = structuredClone(model);
    unloaded.loads = [];
    const result = JSON.parse(solve(JSON.stringify(unloaded), 100, 1e-12));
    assert.equal(result.converged, true);
    assert.equal(result.isStable, true);
    assert.equal(result.iterations, 1);
    assert.equal(result.results.displacements.length, Object.keys(unloaded.nodes).length);
    for (const d of result.results.displacements) {
      for (const field of fields) {
        assert.ok(Number.isFinite(d[field]));
        assert.equal(Math.abs(d[field]), 0);
      }
    }
  });
}
