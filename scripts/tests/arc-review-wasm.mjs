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


export function registerRoundTwoTests({ arc, displacement, corotational }) {
  const readFixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));

  test('round two co-rotation reconstructs the absolute scaled tie', () => {
    const solver = readFixture('arc-tied-springs');
    solver.supports[1].dx = 0.1;
    solver.constraints = [{ type: 'linearMPC', terms: [
      { nodeId: 2, dof: 0, coefficient: 1 },
      { nodeId: 1, dof: 0, coefficient: -3 },
    ] }];
    for (const increments of [1, 7]) {
      for (const result of corotational(solver, increments)) {
        assert.equal(result.converged, true);
        const [master, slave, independent] = result.results.displacements;
        assert.equal(master.ux, 0.1);
        assert.equal(slave.ux, 3 * master.ux);
        assert.equal(independent.ux, 1);
      }
    }
  });

  test('round two continuation reactions retain an exact cancelling resultant', () => {
    const solver = readFixture('displacement-control-axial');
    solver.loads[0].data.fx = 1;
    const b = 3 * 2 ** 51;
    for (const fx of [b + 3, -(b + 2)]) {
      solver.loads.push({ type: 'nodal', data: { nodeId: 1, fx, fz: 0, my: 0 } });
    }
    for (const factor of [0.5, 0.75, 1]) {
      const radius = factor * Math.SQRT2;
      const controls = { solver, maxSteps: 1, maxIter: 20, tolerance: 1e-8,
        initialDs: radius, minDs: radius, maxDs: radius };
      for (const result of [
        arc(controls),
        displacement({ solver, controlNode: 2, controlDof: 0, targetDisplacement: factor,
          nSteps: 1, maxIter: 20, tolerance: controls.tolerance }),
      ]) {
        assert.equal(result.converged, true);
        assert.equal(result.finalLoadFactor, factor);
        assert.equal(result.results.displacements[1].ux, factor);
        assert.equal(result.results.reactions[0].rx, -2 * factor);
        assert.equal(result.results.elementForces[0].nStart, factor);
        assert.equal(result.results.elementForces[0].nEnd, factor);
      }
    }
  });

  test('round two arc retries a backwards root from the last accepted point', () => {
    const solver = readFixture('experimental-nonlinear-two-bar');
    solver.materials[1].e = 0.01;
    const controls = { solver, maxSteps: 1, maxIter: 30, tolerance: 1e-8,
      initialDs: 0.375, minDs: 0.375, maxDs: 0.375 };
    const first = arc(controls);
    assert.equal(first.converged, true);
    const fixed = arc({ ...controls, maxSteps: 2 });
    assert.equal(fixed.converged, false);
    assert.deepEqual(fixed.steps, first.steps);
    assert.deepEqual(fixed.results.displacements, first.results.displacements);

    const minDs = controls.minDs / 2;
    const retried = arc({ ...controls, maxSteps: 2, minDs });
    assert.equal(retried.converged, true);
    assert.equal(retried.steps.length, 2);
    assert.deepEqual(retried.steps[0], first.steps[0]);
    const [a, b] = retried.steps;
    const du = b.controlDisplacement - a.controlDisplacement;
    const dl = b.loadFactor - a.loadFactor;
    assert.ok(a.controlDisplacement * du + a.loadFactor * dl > 0);
    assert.ok(Math.abs(Math.hypot(du, dl) / minDs - 1) <= controls.tolerance);
  });
}
