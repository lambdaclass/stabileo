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

function sameFiniteResults(actual, expected, path = 'results') {
  if (typeof expected === 'number') {
    assert.ok(Number.isFinite(actual) && Number.isFinite(expected), path);
    assert.ok(Math.abs(actual - expected) <= 1e-7 * Math.max(1, Math.abs(expected)), `${path}: ${actual} vs ${expected}`);
  } else if (expected !== null && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    for (const key of Object.keys(expected)) sameFiniteResults(actual[key], expected[key], `${path}.${key}`);
  } else {
    assert.deepEqual(actual, expected, path);
  }
}

for (const [dimension, input] of [[2, plane], [3, space]]) {
  const solve = engine[`solve_experimental_corotational_${dimension}d`];
  for (const stepping of ['equal', 'adaptive']) {
    test(`${dimension}D ${stepping} bounded Krylov forcing retains Newton's finite results`, () => {
      const run = (method) => JSON.parse(solve(JSON.stringify(input), JSON.stringify({
        method, stepping, nIncrements: 4, maxIter: 200, tolerance: 1e-10,
      })));
      const expected = run('newton');
      const actual = run('newtonKrylov');
      assert.equal(expected.converged, true);
      assert.equal(actual.converged, true);
      assert.equal(actual.loadFactor, 1);
      sameFiniteResults(actual.results, expected.results);
    });
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
