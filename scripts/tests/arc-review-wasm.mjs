import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

export function registerArcReviewTests(solve) {
  const arc = (input) => JSON.parse(solve(JSON.stringify(input)));
  const solver = JSON.parse(readFileSync(new URL('./fixtures/arc-tied-springs.json', import.meta.url)));
  const controls = { initialDs: 1, minDs: 1, maxDs: 1, maxSteps: 5, maxIter: 80, tolerance: 1e-8 };

  test('arc drivers require ordered positive radii and a positive tolerance', () => {
    for (const settings of [
      { minDs: 1, initialDs: 0.5, maxDs: 2 },
      { minDs: 0.5, initialDs: 2, maxDs: 1 },
      { minDs: 0 },
      { maxDs: -1 },
      { tolerance: 0 },
    ]) {
      assert.throws(() => arc({ solver, ...controls, ...settings }), /radius|radii|tolerance/i);
    }
    for (const initialDs of [0.5, 1]) {
      assert.equal(arc({ solver, ...controls, initialDs, minDs: 0.5 }).converged, true);
    }
  });

  test('arc drivers keep tied displacements equal at every returned load', () => {
    const pattern = structuredClone(solver);
    pattern.supports[1].dx = 0.1;
    for (let maxSteps = 1; maxSteps <= controls.maxSteps; maxSteps++) {
      const result = arc({ solver: pattern, ...controls, maxSteps });
      assert.equal(result.converged, true);
      const [master, slave] = result.results.displacements;
      assert.equal(master.ux, result.finalLoadFactor * pattern.supports[1].dx);
      assert.equal(slave.ux, master.ux, `step ${maxSteps}`);
    }
  });
}

export function registerDisplacementFixture(solve) {
  test('displacement control matches axial bar equilibrium', () => {
    const solver = JSON.parse(readFileSync(new URL('./fixtures/displacement-control-axial.json', import.meta.url)));
    const result = JSON.parse(solve(JSON.stringify({
      solver, controlNode: 2, controlDof: 0, targetDisplacement: 0.5,
      nSteps: 2, maxIter: 20, tolerance: 1e-8,
    })));
    assert.equal(result.converged, true);
    assert.deepEqual(result.steps.map((step) => [step.controlDisplacement, step.loadFactor, step.converged]), [
      [0.25, 0.125, true], [0.5, 0.25, true],
    ]);
    assert.equal(result.finalLoadFactor, 0.25);
    assert.equal(result.results.displacements[1].ux, 0.5);
    assert.equal(result.results.reactions[0].rx, -0.5);
    assert.equal(result.results.elementForces[0].nStart, 0.5);
    assert.equal(result.results.elementForces[0].nEnd, 0.5);
  });
}
