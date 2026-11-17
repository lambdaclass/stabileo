import { expect, it } from 'vitest';
import { buildLoadPlan, type LoadModelData } from '../load-plan';
import { input, witness } from './gravity-width-mass-fixture';


function check(model: LoadModelData, width: number, length: number, defaultMode = false) {
  const plan = buildLoadPlan(input(model, { tributaryWidth: width, ...(defaultMode ? { gravity: undefined } : {}) }));
  expect(plan.outcome).toBe('READY');
  expect(plan.levels).toHaveLength(1);
  const area = width * length;
  const level = plan.levels[0]!;
  expect(level.planAreaM2).toBeCloseTo(area, 10);
  expect(level.superimposedKN).toBeCloseTo(area, 10);
  expect(level.liveTotalKN).toBeCloseTo(2 * area, 10);
  expect(level.weightKN).toBeCloseTo(level.selfWeightKN + 1.5 * area, 10);
  for (const element of model.elements.values()) {
    const loads = plan.distributed.filter(load => load.elementId === element.id);
    if (element.type === 'truss' || width === 0) {
      expect(loads).toEqual([]);
      continue;
    }
    expect(loads.map(({ caseType, q, qJ, a, b, frame }) => [caseType, q, qJ ?? q, a, b, frame])).toEqual([
      ['D', -width, -width, undefined, undefined, 'global'],
      ['L', -2 * width, -2 * width, undefined, undefined, 'projected'],
    ]);
  }
  expect(plan.nodal).toEqual([]);
  return level;
}

it('#2269 level mass agrees with the two loaded carriers', () => {
  expect(check(witness(), 3, 20).weightKN).toBeCloseTo(140, 10);
  check(witness(6), 3, 20);
  check(witness(3, 37, 3, -1), 3, 20, true);
  const withTruss = witness();
  withTruss.elements.set(2, { ...withTruss.elements.get(2)!, type: 'truss' });
  check(withTruss, 3, 10);
});

it('#2210 a rectangular frame rotated 45 degrees has the same width-mode mass', () => {
  for (const angle of [45, 0]) {
    const model = witness(6, angle);
    model.elements.set(3, { ...model.elements.get(1)!, id: 3, nodeI: 1, nodeJ: 3 });
    model.elements.set(4, { ...model.elements.get(1)!, id: 4, nodeI: 2, nodeJ: 4 });
    check(model, 1, 2 * (10 + 6), true);
  }
});

it('#2269 zero width generates no superimposed area or mass', () => {
  expect(check(witness(), 0, 20).weightKN).toBeCloseTo(50, 10);
});

it('#2269 positive widths below the former emission cutoff still generate loads', () => {
  check(witness(), 0.0005, 20);
});

it('a footprint matching the carrier area has the same width-mode weight', () => {
  expect(check(witness(6), 3, 20).weightKN).toBeCloseTo(140, 10);
});
