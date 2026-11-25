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
