import { expect, it } from 'vitest';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { witness, input } from './gravity-width-mass-fixture';

const regression = process.env.RUN_KNOWN_WRONG === '2269' ? it : it.skip;

function check(model: LoadModelData, overrides: Partial<LoadPlanInput> = {}, expectedArea = 60) {
  const plan = buildLoadPlan(input(model, overrides));
  expect(plan.outcome).toBe('READY');
  expect(plan.levels).toHaveLength(1);
  for (const element of model.elements.values()) {
    const loads = plan.distributed.filter(load => load.elementId === element.id);
    if (element.type === 'truss') {
      expect(loads).toEqual([]);
      continue;
    }
    expect(loads).toHaveLength(2);
    for (const [caseType, q, frame] of [['D', -3, 'global'], ['L', -6, 'projected']] as const) {
      const load = loads.find(load => load.caseType === caseType)!;
      expect(load).toBeDefined();
      expect(load.q).toBe(q);
      expect(load.qJ ?? load.q).toBe(q);
      expect(load.frame).toBe(frame);
      expect(load.a).toBeUndefined();
      expect(load.b).toBeUndefined();
    }
  }
  const level = plan.levels[0]!;
  expect(level.planAreaM2).toBeCloseTo(expectedArea, 10);
  expect(level.selfWeightKN).toBeCloseTo(50, 10);
  expect(level.superimposedKN).toBeCloseTo(expectedArea, 10);
  expect(level.liveTotalKN).toBeCloseTo(2 * expectedArea, 10);
  expect(level.liveParticipatingKN).toBeCloseTo(0.5 * expectedArea, 10);
  expect(level.weightKN).toBeCloseTo(50 + 1.5 * expectedArea, 10);
  expect(plan.nodal).toEqual([]);
  return plan;
}

for (const separation of [3, 6]) {
  regression(`known wrong result: #2269 width area follows carriers at y=${separation}`, () => {
    check(witness(separation));
  });
  regression(`known wrong result: #2269 every total survives 37 degree rotation at y=${separation}`, () => {
    check(witness(separation, 37));
  });
  regression(`known wrong result: #2269 every total survives three-member subdivision at y=${separation}`, () => {
    check(witness(separation, 0, 3));
    check(witness(separation, 37, 3, -1));
  });
}

regression('known wrong result: #2269 default width mode accounts for its loads', () => {
  check(witness(), { gravity: undefined });
});

regression('known wrong result: #2269 only carriers receiving width loads contribute area', () => {
  const model = witness();
  model.elements.set(2, { ...model.elements.get(2)!, type: 'truss' });
  check(model, {}, 30);
});

regression('known wrong result: #2269 dead level weight equals generated D load integral plus self-weight', () => {
  const model = witness(3, 37, 3);
  const plan = buildLoadPlan(input(model, {
    seismic: { enabled: false, coefficient: 0.1, liveParticipation: 0, directions: { x: true, y: false } },
  }));
  const dead = plan.distributed.filter(load => load.caseType === 'D').reduce((sum, load) => {
    const member = model.elements.get(load.elementId)!;
    const a = model.nodes.get(member.nodeI)!, b = model.nodes.get(member.nodeJ)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    return sum - (load.q + (load.qJ ?? load.q)) / 2 * ((load.b ?? length) - (load.a ?? 0));
  }, 0);
  expect(dead).toBeCloseTo(60, 10);
  expect(plan.levels[0]!.weightKN).toBeCloseTo(dead + plan.levels[0]!.selfWeightKN, 10);
  expect(plan.levels[0]!.weightKN).toBeCloseTo(110, 10);
  const participating = buildLoadPlan(input(model));
  const level = participating.levels[0]!;
  expect(level.weightKN).toBeCloseTo(dead + level.selfWeightKN + level.liveParticipatingKN, 10);
  expect(level.weightKN).toBeCloseTo(140, 10);
});

it('zero tributary width retains zero area loads and structural self-weight', () => {
  const plan = buildLoadPlan(input(witness(), { tributaryWidth: 0 }));
  expect(plan.outcome).toBe('READY');
  expect(plan.distributed).toEqual([]);
  expect(plan.levels[0]).toMatchObject({ planAreaM2: 0, selfWeightKN: 50, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 50 });
});

it('panel-mode width fallback retains the correct carrier area', () => {
  check(witness(), { gravity: { mode: 'panels' } });
});

regression('known wrong result: #2269 positive width immediately above zero contributes its exact area', () => {
  const width = Number.EPSILON;
  const plan = buildLoadPlan(input(witness(), { tributaryWidth: width }));
  expect(plan.levels[0]!.planAreaM2).toBeGreaterThan(0);
  expect(plan.levels[0]!.planAreaM2 / width).toBeCloseTo(20, 10);
});
