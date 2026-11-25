import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { registerArcReviewTests, registerDisplacementFixture, registerRoundTwoTests, registerRounding2560Tests } from './arc-review-wasm.mjs';
import { registerChordEquilibriumTests, registerExactMemberActionTests, registerMemberRotationTests } from './planar-exact-member-actions.mjs';

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
      'trustRegion',
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
test('issue 2484 refuses a shear-centre offset on a curved-only section', () => {
  const solver = JSON.parse(readFileSync(new URL(
    '../../engine/tests/metamorphic_corpus/feature_matrix/3d-curved-beam-arch-with.json',
    import.meta.url,
  ), 'utf8'));
  solver.curvedBeams[0].numSegments = 4;
  const load = solver.loads[0].data;
  for (const key of ['fx', 'fy', 'fz']) load[key] *= 0.01;
  solver.sections[6].shearCenterY = 0.01;
  for (const stepping of ['equal', 'adaptive']) {
    const options = JSON.stringify({
      method: 'newton', stepping, nIncrements: 2, maxIter: 30, tolerance: 1e-8,
    });
    const run = () => JSON.parse(engine.solve_experimental_corotational_3d(JSON.stringify(solver), options));
    assert.equal(run().converged, true);
    solver.sections[1].shearCenterY = 0;
    solver.sections[1].shearCenterZ = -0;
    assert.equal(run().converged, true);
    solver.sections[1].shearCenterY = -0.01;
    assert.throws(run, /shear-centre offset \(section 1\)/);
    solver.sections[1].shearCenterY = 0;
    solver.sections[1].shearCenterZ = 0.01;
    assert.throws(run, /shear-centre offset \(section 1\)/);
    solver.sections[1].shearCenterZ = 0;
  }
});

for (const [method, settings] of [
  ['arc_length', { maxSteps: 2, initialDs: 0.003, minDs: 0.003, maxDs: 0.003 }],
  ['displacement_control', { nSteps: 2, controlNode: 2, controlDof: 0, targetDisplacement: 0.02 }],
]) {
  test(`issue 2484 ${method} recovers the canonical member load`, () => {
    const b = 6.000000000000001;
    const scale = b / 6;
    const run = (data) => {
      const solver = {
        ...plane,
        nodes: { 1: { id: 1, x: 100, z: 0 }, 2: { id: 2, x: 106, z: 0 } },
        loads: [{ type: 'axialDistributed', data: { elementId: 1, ...data } }],
      };
      return JSON.parse(engine[`solve_experimental_${method}`](JSON.stringify({
        solver, ...settings, maxIter: 20, tolerance: 1e-8,
      })));
    };
    const canonical = run({ qI: 0.25 * scale, qJ: 0.19 * scale, a: 0.5 / scale });
    assert.equal(canonical.converged, true);
    assert.ok(canonical.finalLoadFactor > 0);
    assert.deepEqual(run({ qI: 0.25, qJ: 0.19, a: 0.5, b }), canonical);
  });
}

function twoBarArc(rise, e, radius, maxSteps, maxIter) {
  const solver = JSON.parse(readFileSync(
    new URL('./fixtures/experimental-nonlinear-two-bar.json', import.meta.url), 'utf8',
  ));
  solver.nodes[2].z = rise;
  solver.materials[1].e = e;
  return {
    solver, maxSteps, maxIter, tolerance: 1e-8,
    initialDs: radius, minDs: radius, maxDs: radius,
  };
}

test('issue 2484 the two-bar arc stays on the sphere and follows the fold', () => {
  const run = (input) => JSON.parse(engine.solve_experimental_arc_length(JSON.stringify(input)));
  const input = twoBarArc(2, 0.01, 3, 2, 20);
  const result = run(input);
  assert.ok(result.steps.length > 0);
  let displacement = 0;
  let load = 0;
  for (const step of result.steps) {
    const radius = Math.hypot(step.controlDisplacement - displacement, step.loadFactor - load);
    assert.ok(Math.abs(radius / input.initialDs - 1) <= input.tolerance, `radius ${radius}`);
    displacement = step.controlDisplacement;
    load = step.loadFactor;
  }
  assert.equal(run(twoBarArc(2, 0.01, 1.5, 2, 20)).converged, true);

  const fold = twoBarArc(1, 0.01, 0.25, 9, 20);
  fold.solver.loads[0].data.fz = -0.1;
  const path = run(fold);
  assert.equal(path.converged, true);
  assert.equal(path.steps.length, fold.maxSteps);
  for (let i = 1; i < path.steps.length; i++) {
    assert.ok(
      path.steps[i].controlDisplacement < path.steps[i - 1].controlDisplacement,
      `path reversed at step ${i + 1}`,
    );
  }
  assert.ok(path.steps.at(-1).loadFactor < path.steps.at(-2).loadFactor);
});

test('issue 2484 the final arc state matches its last accepted point', () => {
  const input = twoBarArc(0.5, 0.001, 0.25, 5, 3);
  const result = JSON.parse(engine.solve_experimental_arc_length(JSON.stringify(input)));
  assert.equal(result.converged, false);
  const last = result.steps.at(-1);
  assert.ok(last);
  assert.equal(result.finalLoadFactor, last.loadFactor);
  assert.equal(result.results.displacements.find((d) => d.nodeId === 2).uz, last.controlDisplacement);
});

registerArcReviewTests(engine.solve_experimental_arc_length);
registerDisplacementFixture(engine.solve_experimental_displacement_control);

const solvePlanar = (solver, nIncrements, method, stepping) =>
  JSON.parse(engine.solve_experimental_corotational_2d(JSON.stringify(solver), JSON.stringify({
    method, stepping, nIncrements, maxIter: 20, tolerance: 1e-8,
  })));

const reviewDrivers = {
  arc: (input) => JSON.parse(engine.solve_experimental_arc_length(JSON.stringify(input))),
  displacement: (input) => JSON.parse(engine.solve_experimental_displacement_control(JSON.stringify(input))),
  corotational: (solver, nIncrements) => ['newton', 'modifiedNewton', 'newtonLineSearch'].map((method) =>
    solvePlanar(solver, nIncrements, method, 'equal'),
  ),
};
registerRoundTwoTests(reviewDrivers);
const allReviewDrivers = {
  ...reviewDrivers,
  corotational: (solver, nIncrements) => [
    ...reviewDrivers.corotational(solver, nIncrements),
    solvePlanar(solver, nIncrements, 'newtonLineSearch', 'adaptive'),
  ],
};
registerRounding2560Tests(allReviewDrivers);
registerExactMemberActionTests(allReviewDrivers);
registerMemberRotationTests(allReviewDrivers);
registerChordEquilibriumTests(allReviewDrivers);
