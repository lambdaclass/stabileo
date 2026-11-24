import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

export function registerArcReviewTests(solve) {
  const arc = (input) => JSON.parse(solve(JSON.stringify(input)));
  const solver = JSON.parse(readFileSync(new URL('./fixtures/arc-tied-springs.json', import.meta.url)));
  const controls = { initialDs: 1, minDs: 1, maxDs: 1, maxSteps: 5, maxIter: 80, tolerance: 1e-8 };
  const options = { skip: !process.env.REPRODUCE_2539 };

  test('arc drivers require ordered positive radii and a positive tolerance', options, () => {
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

  test('arc drivers keep tied displacements equal at every returned load', options, () => {
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
