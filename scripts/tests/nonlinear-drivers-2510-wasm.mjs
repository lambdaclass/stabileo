import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { registerArcReviewTests, registerDisplacementFixture, registerRoundTwoTests, registerRounding2560Tests } from './arc-review-wasm.mjs';
import { registerExactMemberActionTests, registerMemberRotationTests } from './planar-exact-member-actions.mjs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const arc = (input) => JSON.parse(engine.solve_arc_length(JSON.stringify(input)));

function twoBar(rise, e, radius, maxSteps, maxIter) {
  const solver = read('./fixtures/experimental-nonlinear-two-bar.json');
  solver.nodes[2].z = rise;
  solver.materials[1].e = e;
  return { solver, maxSteps, maxIter, tolerance: 1e-8, initialDs: radius, minDs: radius, maxDs: radius };
}

function radius(previous, step) {
  return Math.hypot(step.controlDisplacement - previous.controlDisplacement, step.loadFactor - previous.loadFactor);
}

test('production two-bar arc accepts only the requested sphere', () => {
  const input = twoBar(2, 0.01, 3, 2, 20);
  const result = arc(input);
  assert.ok(result.steps.length > 0);
  let previous = { controlDisplacement: 0, loadFactor: 0 };
  for (const step of result.steps) {
    assert.ok(Math.abs(radius(previous, step) / input.initialDs - 1) <= input.tolerance, JSON.stringify(step));
    previous = step;
  }
  assert.equal(result.converged, false);
  assert.equal(result.steps.length, 1);

  const retry = { ...input, minDs: input.initialDs / 2 };
  const reached = arc(retry);
  assert.equal(reached.converged, true);
  assert.equal(reached.steps.length, retry.maxSteps);
  assert.ok(Math.abs(radius(...reached.steps) / retry.minDs - 1) <= retry.tolerance);
});

test('production two-bar arc does not retrace the fold', () => {
  const input = twoBar(1, 0.01, 0.25, 9, 20);
  input.solver.loads[0].data.fz = -0.1;
  const result = arc(input);
  assert.equal(result.converged, true);
  assert.equal(result.steps.length, input.maxSteps);
  for (let i = 1; i < result.steps.length; i++) {
    assert.ok(result.steps[i].controlDisplacement < result.steps[i - 1].controlDisplacement, 'path reversed at step ' + (i + 1));
  }
  assert.ok(result.steps[8].loadFactor < result.steps[7].loadFactor);
});

test('production arc final state is its last accepted point', () => {
  const result = arc(twoBar(0.5, 0.001, 0.25, 5, 3));
  assert.equal(result.converged, false);
  const last = result.steps.at(-1);
  assert.ok(last);
  assert.equal(result.finalLoadFactor, last.loadFactor);
  assert.equal(result.results.displacements.find((d) => d.nodeId === 2).uz, last.controlDisplacement);
});

test('production 3D co-rotation checks curved frame sections after expansion', () => {
  const solver = read('../../engine/tests/metamorphic_corpus/feature_matrix/3d-curved-beam-arch-with.json');
  assert.equal(Object.keys(solver.elements).length, 0);
  solver.curvedBeams[0].numSegments = 4;
  for (const key of ['fx', 'fy', 'fz']) solver.loads[0].data[key] *= 0.01;
  solver.sections[6].shearCenterY = 0.01;
  const run = () => JSON.parse(engine.solve_corotational_3d(JSON.stringify(solver), 30, 1e-8, 2));
  for (const [y, z] of [[undefined, undefined], [0, -0], [-0.01, undefined], [undefined, 0.01]]) {
    solver.sections[1].shearCenterY = y;
    solver.sections[1].shearCenterZ = z;
    assert.ok(engine.solve_3d(solver).displacements.length > 0);
    if (y || z) assert.throws(run, /shear-centre offset \(section 1\)/);
    else assert.equal(run().converged, true);
  }
});

for (const [method, settings] of [
  ['arc_length', { maxSteps: 2, initialDs: 0.003, minDs: 0.003, maxDs: 0.003 }],
  ['displacement_control', { nSteps: 2, controlNode: 2, controlDof: 0, targetDisplacement: 0.02 }],
]) {
  test('production ' + method + ' recovers the canonical member load', () => {
    const b = 6.000000000000001;
    const scale = b / 6;
    const run = (data) => {
      const solver = {
        nodes: { 1: { id: 1, x: 100, z: 0 }, 2: { id: 2, x: 106, z: 0 } },
        elements: { 1: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } },
        materials: { 1: { id: 1, e: 200, nu: 0.3 } },
        supports: { 1: { id: 1, nodeId: 1, type: 'fixed' } },
        sections: { 1: { id: 1, a: 0.01, iz: 1e-4 } },
        loads: [{ type: 'axialDistributed', data: { elementId: 1, ...data } }],
      };
      return JSON.parse(engine['solve_' + method](JSON.stringify({ solver, ...settings, maxIter: 20, tolerance: 1e-8 })));
    };
    const canonical = run({ qI: 0.25 * scale, qJ: 0.19 * scale, a: 0.5 / scale });
    assert.equal(canonical.converged, true);
    assert.ok(canonical.finalLoadFactor > 0);
    assert.deepEqual(run({ qI: 0.25, qJ: 0.19, a: 0.5, b }), canonical);
  });
}

registerArcReviewTests(engine.solve_arc_length);
registerDisplacementFixture(engine.solve_displacement_control);

const reviewDrivers = {
  arc,
  displacement: (input) => JSON.parse(engine.solve_displacement_control(JSON.stringify(input))),
  corotational: (solver, increments) => [
    JSON.parse(engine.solve_corotational_2d(JSON.stringify(solver), 20, 1e-8, increments)),
  ],
};
registerRoundTwoTests(reviewDrivers);
registerRounding2560Tests(reviewDrivers);
registerExactMemberActionTests(reviewDrivers);
registerMemberRotationTests(reviewDrivers);
