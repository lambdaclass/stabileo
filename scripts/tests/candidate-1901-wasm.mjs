import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const input = read('../../engine/tests/fixtures/candidate-replay.json')['1901-body-0'];
const embeddings = read('../../engine/tests/fixtures/candidate-1901-embeddings.json');
const reference = read('../../docs/verification/candidate-1901-reference.json')[1];

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

const axes2 = [['ux', 'ux', 1], ['uz', 'uz', 1], ['ry', 'ry', 1]];
test('1901 2D linear agrees with independent reference', () => {
  compare(engine.solve_2d(input).displacements, reference.linear, axes2);
});
test('1901 2D P-Delta retains explicit nonconvergence', () => {
  const result = JSON.parse(engine.solve_pdelta_2d(JSON.stringify(input), 100, 1e-12));
  assert.equal(result.converged, false);
  assert.equal(result.isStable, false);
  assert.equal(result.iterations, 100);
  compare(result.linearResults.displacements, reference.linear, axes2);
});
for (const [plane, axes] of Object.entries({
  XZ: [['ux', 'ux', 1], ['uz', 'uz', 1], ['ry', 'ry', -1]],
  XY: [['ux', 'ux', 1], ['uz', 'uy', 1], ['ry', 'rz', 1]],
  YZ: [['ux', 'uy', 1], ['uz', 'uz', 1], ['ry', 'rx', 1]],
})) {
  test(`1901 ${plane} linear agrees with independent 2D reference`, () => {
    compare(engine.solve_3d(embeddings[plane]).displacements, reference.linear, axes);
  });
  test(`1901 ${plane} P-Delta agrees with independent reference`, () => {
    const result = JSON.parse(engine.solve_pdelta_3d(JSON.stringify(embeddings[plane]), 100, 1e-12));
    assert.equal(result.converged, true);
    compare(result.results.displacements, reference.pdelta.displacements, axes);
  });
}

test('1901 rigidly rotated 2D P-Delta agrees with independent reference', () => {
  const angle = 37 * Math.PI / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rotated = structuredClone(input);
  for (const n of Object.values(rotated.nodes)) {
    const { x, z } = n;
    n.x = c*x - s*z;
    n.z = s*x + c*z;
  }
  const result = JSON.parse(engine.solve_pdelta_2d(JSON.stringify(rotated), 100, 1e-12));
  assert.equal(result.converged, true);
  const displacements = result.results.displacements.map(d => ({
    nodeId: d.nodeId, ux: c*d.ux + s*d.uz, uz: -s*d.ux + c*d.uz, ry: d.ry,
  }));
  compare(displacements, reference.pdelta.displacements, axes2);
});
