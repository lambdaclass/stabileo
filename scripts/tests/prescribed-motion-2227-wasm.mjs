import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });

const fixture = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/equilibrium-oracle-2109.json', import.meta.url)));
const motions = [0, 0.0013, 1.0000000000000003e-15, 1e-16, -1e-16, 9.999999999999999e-16, 1e-15];

function axialModel(dim, free, pcg, dx) {
  const model = { ...structuredClone(fixture), loads: [], nodes: {}, supports: {}, elements: {} };
  const last = free + 2;
  for (let id = 1; id <= last; id++) {
    const restrained = id === 1 || id === last;
    model.nodes[id] = dim === 2 ? { id, x: id - 1, z: 0 } : { id, x: id - 1, y: 0, z: 0 };
    model.supports[id] = dim === 2
      ? { id, nodeId: id, type: restrained ? 'fixed' : 'guidedX' }
      : { nodeId: id, rx: restrained, ry: true, rz: true, rrx: true, rry: true, rrz: true };
    if (id < last) {
      model.elements[id] = { id, type: 'truss', nodeI: id, nodeJ: id + 1, materialId: 1, sectionId: 1 };
    }
  }
  model.supports[last].dx = dx;
  if (pcg) model.solverOptions = { method: 'pcg', preconditioner: 'ic0' };
  return model;
}

function assertForce(actual, expected, name) {
  if (expected === 0) {
    assert.ok(actual === 0, `${name}: ${actual}, expected zero`);
  } else {
    assert.ok(Math.abs(actual / expected - 1) < 1e-12, `${name}: ${actual}, expected ${expected}`);
  }
}

function checkAxial(model, result, dim, free, path, dx) {
  assert.equal(result.solverRunMeta.solverPath, path);
  assert.equal(result.solverRunMeta.nFreeDofs, free);
  const expected = model.materials[1].e * 1000 * model.sections[1].a * dx / (free + 1);
  const last = free + 2;
  assert.equal(result.displacements.find(d => d.nodeId === last).ux, dx);
  assert.equal(result.elementForces.length, free + 1);
  for (const force of result.elementForces) {
    assertForce(force.nStart, expected, 'member start axial force');
    assertForce(force.nEnd, expected, 'member end axial force');
  }
  const key = dim === 2 ? 'rx' : 'fx';
  assertForce(-result.reactions.find(r => r.nodeId === 1)[key], expected, 'left reaction');
  assertForce(result.reactions.find(r => r.nodeId === last)[key], expected, 'right reaction');
}

const entries = {
  static: (dim, model) => engine[`solve_${dim}d`](model),
  prepared: (dim, model) => {
    const session = new engine[`LoadSession${dim}D`](model);
    try {
      return session.solve([]);
    } finally {
      session.free();
    }
  },
  'P-Delta linear state': (dim, model) =>
    JSON.parse(engine[`solve_pdelta_${dim}d`](JSON.stringify(model), 20, 1e-10)).linearResults,
};

test('issue #2227 fixed-end shear from the #2109 model', () => {
  for (const dx of motions) {
    const model = structuredClone(fixture);
    model.loads = [];
    model.supports[2].dx = dx;
    const result = engine.solve_3d(model);
    const length = model.nodes[2].z - model.nodes[1].z;
    const shear = 12 * (model.materials[1].e * 1000) * model.sections[1].iy * dx / length ** 3;
    assertForce(-result.elementForces[0].vzStart, shear, 'member start shear');
    assertForce(-result.elementForces[0].vzEnd, shear, 'member end shear');
    assertForce(-result.reactions.find(r => r.nodeId === 1).fx, shear, 'start reaction');
    assertForce(result.reactions.find(r => r.nodeId === 2).fx, shear, 'end reaction');
  }
});

for (const dim of [2, 3]) {
  for (const [free, pcg, path] of [
    [0, false, 'fully_restrained'],
    [1, false, 'dense_lu'],
    [64, false, 'sparse_cholesky'],
    [64, true, 'pcg_ic0'],
  ]) {
    for (const [entry, solve] of Object.entries(entries)) {
      if (free === 0 && entry === 'P-Delta linear state') continue;
      test(`issue #2227 ${dim}D ${path} ${entry}`, () => {
        for (const dx of motions) {
          const model = axialModel(dim, free, pcg, dx);
          checkAxial(model, solve(dim, model), dim, free, path, dx);
        }
      });
    }
  }
}
