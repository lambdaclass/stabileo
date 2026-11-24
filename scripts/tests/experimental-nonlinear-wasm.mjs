import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const engine = require('../../target/experimental-nonlinear-wasm/dedaliano_engine.js');

const frame = {
  elements: { 1: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } },
  materials: { 1: { id: 1, e: 200, nu: 0.3 } },
};

const plane = {
  ...frame,
  nodes: { 1: { id: 1, x: 0, z: 0 }, 2: { id: 2, x: 6, z: 0 } },
  supports: { 1: { id: 1, nodeId: 1, type: 'fixed' } },
  sections: { 1: { id: 1, a: 0.01, iz: 1e-4 } },
  loads: [{ type: 'nodal', data: { nodeId: 2, fx: 2, fz: -30, my: 4 } }],
};

const space = {
  ...frame,
  nodes: { 1: { id: 1, x: 0, y: 0, z: 0 }, 2: { id: 2, x: 6, y: 0.5, z: 0 } },
  supports: { 1: { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true } },
  sections: { 1: { id: 1, a: 0.01, iy: 1e-4, iz: 2e-4, j: 1.5e-4 } },
  loads: [{
    type: 'nodal',
    data: { nodeId: 2, fx: 0.05, fy: 6 * 0.05, fz: -10 * 0.05, mx: 0.5 * 0.05, my: 0.05, mz: 0 },
  }],
};

for (const [dimension, input] of [[2, plane], [3, space]]) {
  const solve = engine[`solve_experimental_corotational_${dimension}d`];
  for (const stepping of ['equal', 'adaptive']) {
    test(`${dimension}D ${stepping} line search uses a fresh budget on each step`, () => {
      const run = (maxIter) => JSON.parse(solve(JSON.stringify(input), JSON.stringify({
        method: 'newtonLineSearch', stepping, nIncrements: 2, maxIter, tolerance: 1e-8,
      })));
      const expected = run(200);
      assert.equal(expected.converged, true);
      assert.ok(expected.loadIncrements >= 2);
      const actual = run(0xffffffff);
      assert.equal(actual.converged, true);
      assert.equal(actual.loadFactor, 1);
      assert.deepEqual(actual, expected);
    });
  }
}

test('experimental WASM continuation agrees with production on the same input', () => {
  const solver = { ...plane, loads: [{ type: 'nodal', data: { nodeId: 2, fx: 2, fz: 0, my: 0 } }] };
  const arc = JSON.stringify({ solver, maxSteps: 4 });
  const driven = JSON.stringify({ solver, controlNode: 2, controlDof: 0, targetDisplacement: 0.01 });
  for (const [method, input] of [['arc_length', arc], ['displacement_control', driven]]) {
    const production = JSON.parse(engine[`solve_${method}`](input));
    assert.equal(production.converged, true);
    assert.deepEqual(JSON.parse(engine[`solve_experimental_${method}`](input)), production);
  }
});

test('3D arc length follows a path and reads its model through the typed boundary', () => {
  const held = { nodeId: 2, rx: false, ry: true, rz: false, rrx: true, rry: false, rrz: true };
  const flat = {
    ...space,
    nodes: { 1: { id: 1, x: 0, y: 0, z: 0 }, 2: { id: 2, x: 6, y: 0, z: 0 } },
    supports: { ...space.supports, 2: held },
    sections: { 1: { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4 } },
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 2, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }],
  };
  const solver = { ...plane, loads: [{ type: 'nodal', data: { nodeId: 2, fx: 2, fz: 0, my: 0 } }] };
  const options = { maxSteps: 4, tolerance: 1e-9 };
  const planar = JSON.parse(engine.solve_arc_length(JSON.stringify({ solver, ...options })));
  const result = JSON.parse(engine.solve_experimental_arc_length_3d(JSON.stringify({ solver: flat, ...options })));
  assert.equal(result.converged, true);
  assert.equal(result.steps.length, 4);
  assert.equal(result.finalLoadFactor, result.steps[3].loadFactor);
  result.steps.forEach((step, i) => {
    assert.equal(step.converged, true);
    assert.ok(Math.abs(step.loadFactor - planar.steps[i].loadFactor) <= 1e-8, `step ${i + 1}`);
  });
  const tip = result.results.displacements.find((d) => d.nodeId === 2);
  const planarTip = planar.results.displacements.find((d) => d.nodeId === 2);
  assert.ok(Math.abs(tip.ux - planarTip.ux) <= 1e-10);
  assert.equal(tip.uy, 0);

  const malformed = { ...flat, sections: { 1: { id: 1, a: 'wide', iy: 1e-4, iz: 1e-4, j: 2e-4 } } };
  assert.throws(() => engine.solve_experimental_arc_length_3d(JSON.stringify({ solver: malformed, ...options })), /Parse error/);
  assert.throws(() => engine.solve_experimental_arc_length_3d(JSON.stringify({ solver: flat, ...options, targetIter: 0 })), /Target iterations/);
});
