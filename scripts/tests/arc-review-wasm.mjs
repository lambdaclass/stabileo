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

  test('issue 761 rotated split loads preserve the tangent resultant', () => {
    for (const angle of [0, Math.PI / 4]) {
      const solver = readFixture('displacement-control-axial');
      const tangent = [-Math.cos(angle), Math.sin(angle)];
      const normal = [tangent[1], -tangent[0]];
      const tip = solver.nodes[2];
      const length = tip.x;
      [tip.x, tip.z] = tangent.map(component => length * component);
      Object.assign(solver.supports[2], { type: 'inclinedRoller', angle });

      const load = ([x, z], magnitude) => ({
        type: 'nodal', data: { nodeId: 2, fx: x * magnitude, fz: z * magnitude, my: 0 },
      });
      const force = 0.25;
      const axial = force * length / (1000 * solver.materials[1].e * solver.sections[1].a);
      const ds = Math.hypot(force, axial) / 10;
      const input = { solver, maxSteps: 1, maxIter: 100, tolerance: 1e-10,
        initialDs: ds, minDs: ds, maxDs: ds };
      solver.loads = [load(normal, 2 ** 70)];
      assert.throws(() => arc(input), /Zero reference load/);
      solver.loads.push(load(tangent, force));

      const result = arc(input);
      assert.ok(Math.abs(result.finalLoadFactor / 0.1 - 1) < input.tolerance);
      for (const [answer, factor] of [[result, 0.1], ...corotational(solver, 2).map(r => [r, 1])]) {
        assert.equal(answer.converged, true);
        const { ux, uz } = answer.results.displacements.find(d => d.nodeId === 2);
        const expected = axial * factor;
        assert.ok(Math.hypot(ux - expected * tangent[0], uz - expected * tangent[1]) < expected * input.tolerance);
        const { nStart, nEnd } = answer.results.elementForces.find(e => e.elementId === 1);
        for (const end of [nStart, nEnd]) {
          assert.ok(Math.abs(end / (force * factor) - 1) < input.tolerance);
        }
      }

      assert.throws(() => displacement({
        solver, controlNode: 2, controlDof: 0, targetDisplacement: axial * tangent[0],
        nSteps: 2, maxIter: input.maxIter, tolerance: input.tolerance,
      }), /inclined supports/);
    }
  });

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

export function registerRounding2560Tests({ arc, displacement, corotational }) {
  const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
  const tolerance = 1e-8;
  const radius = 0.75 * Math.SQRT2;
  const arcAt = (solver) => arc({ solver, maxSteps: 1, maxIter: 20, tolerance,
    initialDs: radius, minDs: radius, maxDs: radius });
  const control = (solver, controlNode, targetDisplacement, nSteps) => displacement({
    solver, controlNode, controlDof: 0, targetDisplacement, nSteps, maxIter: 20, tolerance,
  });

  for (const [name, solve] of [
    ['arc length', (solver) => [arcAt(solver)]],
    ['co-rotation', (solver) => corotational(solver, 4)],
  ]) {
    test(`#2560 ${name} preserves axial action at an inclined support`, () => {
      const split = fixture('nonlinear-rounding-2560-inclined');
      const axial = structuredClone(split);
      axial.loads[0].data.p = 0;
      const expected = solve(axial);
      for (const [i, actual] of solve(split).entries()) {
        const reference = expected[i];
        assert.equal(actual.converged, true);
        assert.equal(reference.converged, true);
        assert.notEqual(reference.results.displacements[1].ux, 0);
        assert.deepEqual(actual.results.displacements, reference.results.displacements);
        assert.equal(actual.results.reactions[0].rx, reference.results.reactions[0].rx);
        assert.equal(actual.results.elementForces[0].nStart, reference.results.elementForces[0].nStart);
        assert.equal(actual.results.elementForces[0].nEnd, reference.results.elementForces[0].nEnd);
      }
    });
  }

  test('#2560 displacement control reconstructs the 3:1 tie at each final state', () => {
    const solver = fixture('arc-tied-springs');
    solver.constraints = [{ type: 'linearMPC', terms: [
      { nodeId: 2, dof: 0, coefficient: 1 },
      { nodeId: 3, dof: 0, coefficient: -3 },
    ] }];
    for (const nSteps of [1, 7]) {
      const result = control(solver, 3, 0.1, nSteps);
      assert.equal(result.converged, true);
      const [, slave, master] = result.results.displacements;
      assert.notEqual(master.ux, 0);
      assert.equal(slave.ux, 3 * master.ux);
    }
  });

  for (const [name, solve] of [
    ['arc length', (solver) => [arcAt(solver)]],
    ['displacement control', (solver) => [control(solver, 4, 0.75, 1)]],
    ['co-rotation', (solver) => corotational(solver, 4)],
  ]) {
    test(`#2560 ${name} recovers the resultant of coincident member loads`, () => {
      const split = fixture('nonlinear-rounding-2560-coincident');
      const single = structuredClone(split);
      single.loads.splice(1, 1);
      single.loads[0].data.px = 2;
      const expected = solve(single);
      for (const [i, actual] of solve(split).entries()) {
        const reference = expected[i];
        assert.equal(actual.converged, true);
        assert.equal(reference.converged, true);
        assert.equal(Math.abs(reference.results.elementForces[0].nEnd), 1.5 * (reference.finalLoadFactor ?? reference.loadFactor));
        assert.deepEqual(actual.results.elementForces, reference.results.elementForces);
        assert.deepEqual(actual.results.reactions, reference.results.reactions);
      }
    });
  }
}
