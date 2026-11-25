import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const fixtures = ['column', 'arch'].map(name => JSON.parse(readFileSync(new URL(`./fixtures/experimental-beam-${name}.json`, import.meta.url), 'utf8')));

function compare(actual, expected, path = '') {
  if (typeof expected === 'number') {
    assert.ok(Number.isFinite(actual), `${path}: nonfinite`);
    assert.ok(Math.abs(actual - expected) <= 1e-8 * (1 + Math.abs(expected)), `${path}: ${actual} != ${expected}`);
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    for (const key of Object.keys(expected)) compare(actual[key], expected[key], `${path}/${key}`);
  } else assert.equal(actual, expected, path);
}

export function registerBeamStudyTests(engine) {
  const run = request => JSON.parse(engine.solve_experimental_beam_study_2d(JSON.stringify(request)));
  for (const [i, request] of fixtures.entries()) {
    test(`beam study ${i}: finite equilibria and critical point survive the WASM boundary`, () => {
      const result = run(request);
      assert.equal(result.completed, true);
      assert.equal(result.states.length, i ? 80 : 12);
      assert.equal(result.critical.resolution, 'bracketed');
      assert.equal(result.critical.kind, i ? 'limitPointCandidate' : 'bifurcationCandidate');
      assert.equal(result.critical.stable.stability.verdict, 'stable');
      assert.equal(result.critical.unstable.stability.verdict, 'unstable');
      for (const state of result.states) {
        assert.ok(state.equilibrium.relativeResidual < request.equilibriumTolerance);
        assert.ok(Number.isFinite(state.stability.minimum));
        assert.ok(Number.isFinite(state.stability.uncertainty));
      }
      if (process.env.BEAM_STUDY_NATIVE_OUTPUT) {
        const native = JSON.parse(readFileSync(process.env.BEAM_STUDY_NATIVE_OUTPUT, 'utf8'));
        compare(result, native[i]);
      }
    });
  }
  test('beam study preserves unresolved localization and refuses unsupported inputs', () => {
    const request = structuredClone(fixtures[1]);
    request.refinement.maxCorrectorIterations = 1;
    const failed = run(request).critical;
    assert.equal(failed.resolution, 'correctionFailed');
    assert.equal(failed.kind, 'unresolved');
    assert.equal(typeof failed.correctorError, 'string');
    request.model.followerLoads = true;
    assert.throws(() => run(request));
    delete request.model.followerLoads;
    request.control.steps = 1001;
    assert.throws(() => run(request));
    assert.throws(() => engine.solve_experimental_beam_study_2d(' '.repeat(1_048_577)));
    assert.throws(() => engine.solve_experimental_beam_study_2d('{"model":NaN}'));
  });
  test('beam study imperfection cannot move a support and reports physical offsets', () => {
    const request = structuredClone(fixtures[0]);
    const n = request.model.positions.length - 1;
    request.model.loads[n][1] *= 0.5;
    request.imperfection = { amplitude: 0.0001, shape: Array.from({ length: n + 1 }, (_, i) => [i === n ? 0 : Math.sin(Math.PI * i / n), 0]) };
    const result = run(request);
    assert.equal(result.completed, true);
    assert.equal(result.critical, null);
    assert.ok(Math.abs(result.offsets[n / 2][0] - 0.0001) < 1e-14);
    request.imperfection.shape[0][0] = 1;
    assert.throws(() => run(request));
  });
}
