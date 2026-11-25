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
    test(`${dimension}D ${stepping} refuses an overflowing damped tangent`, () => {
      assert.throws(() => solve(JSON.stringify(input), JSON.stringify({
        method: { pseudoTransient: { damping: Number.MAX_VALUE } },
        stepping, nIncrements: 1, maxIter: 50, tolerance: 1e-8,
      })), /Pseudo-transient damping exceeds the finite tangent range/);
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

const mild = {
  ...plane,
  loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0.4, fz: -6, my: 0.8 } }],
};

for (const [dimension, input, moved] of [[2, mild, (d) => [d.ux, d.uz]], [3, space, (d) => [d.ux, d.uy, d.uz]]]) {
  const solve = engine[`solve_experimental_corotational_${dimension}d`];
  const run = (method) => solve(JSON.stringify(input), JSON.stringify({
    method, stepping: 'adaptive', nIncrements: 4, maxIter: 200, tolerance: 1e-9,
  }));
  test(`${dimension}D every iteration method reaches Newton's displacements`, () => {
    const newton = JSON.parse(run('newton'));
    assert.equal(newton.converged, true);
    const reference = moved(newton.results.displacements.find((d) => d.nodeId === 2));
    const largest = Math.max(...reference.map(Math.abs));
    assert.ok(largest > 0);
    for (const method of [
      'modifiedNewton',
      'newtonLineSearch',
      'newtonKrylov',
      { anderson: { depth: 3 } },
      { broyden: { memory: 10 } },
      { lineSearch: { direction: 'newton' } },
      { lineSearch: { direction: 'modifiedNewton' } },
      { lineSearch: { direction: 'newtonKrylov' } },
      { pseudoTransient: { damping: 0.001 } },
    ]) {
      const result = JSON.parse(run(method));
      const name = JSON.stringify(method);
      assert.equal(result.converged, true, name);
      assert.equal(result.loadFactor, 1, name);
      moved(result.results.displacements.find((d) => d.nodeId === 2)).forEach((value, i) => {
        assert.ok(Number.isFinite(value) && Math.abs(value - reference[i]) <= 1e-6 * largest, `${name}: ${value} vs ${reference[i]}`);
      });
    }
  });

  test(`${dimension}D a method the driver cannot run is refused`, () => {
    assert.throws(() => run({ broyden: { memory: 0 } }), /memory from 1 to 50/);
    assert.throws(() => run({ broyden: { memory: 51 } }), /memory from 1 to 50/);
    assert.throws(() => run({ anderson: { depth: 0 } }), /depth from 1 to 50/);
    assert.throws(() => run({ pseudoTransient: { damping: 0 } }), /finite, positive first damping/);
    assert.throws(() => run({ pseudoTransient: { damping: -1 } }), /finite, positive first damping/);
    assert.throws(() => run({ lineSearch: { direction: 'anderson' } }), /Parse error/);
    assert.throws(() => run('steepestDescent'), /Parse error/);
  });
}
