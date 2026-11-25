import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

export function registerExactMemberActionTests({ arc, displacement, corotational }) {
  const { solver: base, cases } = JSON.parse(readFileSync(
    new URL('./fixtures/planar-exact-member-actions.json', import.meta.url),
  ));
  const tolerance = 1e-8;
  const radius = 0.75 * Math.SQRT2;
  for (const [driver, solve] of [
    ['arc length', (solver) => [arc({ solver, maxSteps: 1, maxIter: 20, tolerance,
      initialDs: radius, minDs: radius, maxDs: radius })]],
    ['displacement control', (solver) => [displacement({ solver, controlNode: 4, controlDof: 0,
      targetDisplacement: 0.75, nSteps: 1, maxIter: 20, tolerance })]],
    ['co-rotation', (solver) => corotational(solver, 4)],
  ]) {
    for (const {
      name, loads, elementType, hingeStart = false, hingeEnd = false,
      shearFlexible = false, farAxialLoad = 0,
    } of cases) {
      test(`#2560 exact member actions: ${driver}, ${name}`, () => {
        const solver = structuredClone(base);
        solver.loads.push(...loads);
        const memberInput = solver.elements[1];
        Object.assign(memberInput, { hingeStart, hingeEnd });
        if (elementType) memberInput.type = elementType;
        if (shearFlexible) {
          solver.materials[1].nu = 0;
          Object.assign(solver.sections[1], { asY: 1, iz: 3 });
        }
        for (const result of solve(solver)) {
          assert.equal(result.converged, true);
          const factor = result.finalLoadFactor ?? result.loadFactor;
          assert.ok(factor > 0);
          const axial = -farAxialLoad * factor;
          const reaction = result.results.reactions.find((r) => r.nodeId === 2);
          const member = result.results.elementForces.find((m) => m.elementId === 1);
          assert.ok(reaction.rx === axial && member.nEnd === axial,
            `far-end axial action: reaction ${reaction.rx}, member ${member.nEnd}, expected ${axial}`);
          assert.ok(reaction.rz === 0 && reaction.my === 0 && member.vEnd === 0 && member.mEnd === 0,
            `far-end bending actions: reaction ${reaction.rz}, ${reaction.my}, member ${member.vEnd}, ${member.mEnd}`);
        }
      });
    }
  }
}

export function registerMemberRotationTests({ arc, displacement, corotational }) {
  const { solver: base, displacementControl } = JSON.parse(readFileSync(
    new URL('./fixtures/planar-member-rotation.json', import.meta.url),
  ));
  const knownWrong = process.env.RUN_KNOWN_WRONG !== '2560' && 'known wrong result: #2560';
  const tolerance = 1e-8;
  const check = (result, motion, axial) => {
    assert.equal(result.converged, true);
    const tip = result.results.displacements.find((d) => d.nodeId === 2);
    assert.deepEqual([tip.ux, tip.uz], motion);
    const member = result.results.elementForces.find((m) => m.elementId === 1);
    assert.equal(member.nEnd, axial);
  };

  test('member recovery resolves both signs of chord rotation', () => {
    for (const [motion, axial] of [[[-3, 1], -3], [[2, -4], 4]]) {
      const solver = structuredClone(base);
      [solver.supports[2].dx, solver.supports[2].dz] = motion;
      solver.loads[1].data.p = 5;
      for (const result of corotational(solver, 1)) {
        assert.equal(result.loadFactor, 1);
        check(result, motion, axial);
      }
    }
  });

  test('#2560 member rotation after axial stretch: co-rotation', { skip: knownWrong }, () => {
    for (const [motion, axial] of [[[0, 0], 0], [[3, 4], 2], [[-1.5, -2], -1]]) {
      const solver = structuredClone(base);
      [solver.supports[2].dx, solver.supports[2].dz] = motion;
      for (const result of corotational(solver, 4)) {
        assert.equal(result.loadFactor, 1);
        check(result, motion, axial);
      }
    }
  });

  test('#2560 member rotation after axial stretch: arc length', { skip: knownWrong }, () => {
    const radius = 0.75 * Math.SQRT2;
    const result = arc({
      solver: base, maxSteps: 1, maxIter: 20, tolerance,
      initialDs: radius, minDs: radius, maxDs: radius,
    });
    assert.equal(result.finalLoadFactor, 0.75);
    check(result, [2.25, 3], 1.5);
  });

  test('#2560 member rotation after axial stretch: displacement control', { skip: knownWrong }, () => {
    const solver = { ...structuredClone(base), ...displacementControl };
    delete solver.supports[2];
    const result = displacement({
      solver, controlNode: 4, controlDof: 0, targetDisplacement: 4,
      nSteps: 1, maxIter: 20, tolerance,
    });
    check(result, [3, 4], 2);
  });
}
