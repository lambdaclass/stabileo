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
    test(`${dimension}D ${stepping} profiling observes work without changing results or rollback`, () => {
      for (const maxIter of [1, 200]) {
        const options = { method: 'newtonKrylov', stepping, nIncrements: 4, maxIter, tolerance: 1e-10 };
        const plain = JSON.parse(solve(JSON.stringify(input), JSON.stringify(options)));
        const { result, work } = JSON.parse(solve(JSON.stringify(input), JSON.stringify({ ...options, profile: true })));
        assert.deepEqual(result, plain);
        assert.equal(work.linearizations, result.iterations);
        assert.ok(work.factorizationRequests > 0);
        const k = work.krylov;
        assert.equal(k.iterations, k.tangentProducts);
        assert.equal(k.attempts, k.acceptedSteps + k.noFactor + k.invalidTarget + k.invalidPreconditionedResidual + k.invalidCurvature + k.nonfiniteResidual + k.lostPreconditioner + k.iterationLimit);
        if (maxIter === 1) {
          assert.equal(result.converged, false);
          assert.equal(result.loadFactor, 0);
        } else {
          assert.equal(result.converged, true);
          assert.ok(k.acceptedSteps > 0);
        }
      }
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

test('Krylov profiling retains finite results near the Euler load of a cantilever', () => {
  const n = 30, length = 6, eMPa = 200, iz = 1e-4;
  const input = { nodes: {}, elements: {}, supports: { 1: { id: 1, nodeId: 1, type: 'fixed' } },
    materials: { 1: { id: 1, e: eMPa, nu: 0.3 } }, sections: { 1: { id: 1, a: 0.01, iz } }, loads: [] };
  for (let i = 0; i <= n; i++) input.nodes[i + 1] = { id: i + 1, x: length * i / n, z: 0 };
  for (let i = 0; i < n; i++) input.elements[i + 1] = { id: i + 1, type: 'frame', nodeI: i + 1, nodeJ: i + 2, materialId: 1, sectionId: 1 };
  const critical = Math.PI ** 2 * eMPa * 1000 * iz / (4 * length ** 2);
  input.loads.push({ type: 'nodal', data: { nodeId: n + 1, fx: -0.9 * critical, fz: -0.0002, my: 0 } });
  const options = { method: 'newtonKrylov', stepping: 'adaptive', nIncrements: 4, maxIter: 80, tolerance: 1e-8 };
  const solve = (over) => JSON.parse(engine.solve_experimental_corotational_2d(JSON.stringify(input), JSON.stringify({ ...options, ...over })));
  const plain = solve({});
  const profiled = solve({ profile: true });
  assert.equal(plain.converged, true);
  assert.equal(plain.loadFactor, 1);
  assert.deepEqual(profiled.result, plain);
  const direct = solve({ method: 'newton', nIncrements: 40 });
  assert.equal(direct.converged, true);
  sameFiniteResults(plain.results, direct.results);
  assert.ok(profiled.work.krylov.tangentProducts > 0);
});

test('prepared 3D members retain the legacy Newton result near the Euler load', () => {
  const n = 30, length = 6, eMPa = 200, inertia = 1e-4;
  const input = { ...structuredClone(space), nodes: {}, elements: {}, loads: [],
    materials: { 1: { id: 1, e: eMPa, nu: 0.3 } },
    sections: { 1: { id: 1, a: 0.01, iy: inertia, iz: inertia, j: 1.5e-4 } } };
  for (let i = 0; i <= n; i++) input.nodes[i + 1] = { id: i + 1, x: length * i / n, y: 0, z: 0 };
  for (let i = 0; i < n; i++) input.elements[i + 1] = { ...frame.elements[1], id: i + 1, nodeI: i + 1, nodeJ: i + 2 };
  const critical = Math.PI ** 2 * eMPa * 1000 * inertia / (4 * length ** 2);
  input.loads.push({ type: 'nodal', data: { nodeId: n + 1, fx: -0.9 * critical, fy: 0, fz: -0.0002, mx: 0, my: 0, mz: 0 } });
  const json = JSON.stringify(input);
  const options = { method: 'newton', stepping: 'equal', nIncrements: 4, maxIter: 80, tolerance: 1e-8 };
  const original = JSON.parse(engine.solve_corotational_3d(json, 80, 1e-8, 4));
  const prepared = JSON.parse(engine.solve_experimental_corotational_3d(json, JSON.stringify(options)));
  assert.equal(original.converged, true);
  assert.deepEqual(prepared, original);
  const krylov = JSON.parse(engine.solve_experimental_corotational_3d(json, JSON.stringify({ ...options, method: 'newtonKrylov' })));
  assert.equal(krylov.converged, true);
  sameFiniteResults(krylov.results, original.results);
});
