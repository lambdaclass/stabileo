import { expect, it } from 'vitest';
import { teAt } from '../../../i18n/engine-text';
import { buildLoadPlan } from '../load-plan';
import { areaLoads, bay } from './gravity-regions-fixture';
import { input } from './gravity-width-mass-fixture';


function check(covered: number, fixture: ReturnType<typeof bay>, forceFirst: 'force' | 'moment') {
  const { model, physical } = fixture;
  const out = areaLoads(model);
  let force = 0;
  let firstX = 0;
  let firstY = 0;
  for (const load of out.distributed) {
    const beam = model.elements.get(load.elementId)!;
    const [xi, yi] = physical.get(beam.nodeI)!;
    const [xj, yj] = physical.get(beam.nodeJ)!;
    const length = Math.hypot(xj - xi, yj - yi);
    const a = load.a ?? 0, b = load.b ?? length;
    const qi = -load.q, qj = -(load.qJ ?? load.q);
    const f = (qi + qj) * (b - a) / 2;
    const station = a + (b - a) * (qi + 2 * qj) / (3 * (qi + qj));
    force += f;
    firstX += f * (xi + (xj - xi) * station / length);
    firstY += f * (yi + (yj - yi) * station / length);
  }
  for (const load of out.surface) {
    const points = model.quads.get(load.quadId)!.nodes.map(id => physical.get(id)!);
    const f = load.q * covered * (points[2]![1] - points[1]![1]);
    force += f;
    firstX += f * covered / 2;
    firstY += f * (points[2]![1] + points[1]![1]) / 2;
  }
  if (forceFirst === 'force') expect(force).toBeCloseTo(60, 8);
  expect(firstX).toBeCloseTo(300, 8);
  expect(firstY).toBeCloseTo(180, 8);
  expect(force).toBeCloseTo(60, 8);
  expect(out.nodal).toEqual([]);
  for (const [id, member] of model.elements) {
    const [xi, yi] = physical.get(member.nodeI)!;
    const [xj, yj] = physical.get(member.nodeJ)!;
    const loads = out.distributed.filter(load => load.elementId === id);
    if (yi !== yj || xj <= covered) {
      expect(loads).toEqual([]);
    } else {
      expect(loads).toHaveLength(1);
      const [load] = loads;
      expect(load!.a ?? 0).toBeCloseTo(Math.max(0, covered - xi), 10);
      expect(load!.b ?? xj - xi).toBeCloseTo(xj - xi, 10);
      expect(load!.q).toBeCloseTo(-3, 10);
      expect(load!.qJ ?? load!.q).toBeCloseTo(-3, 10);
    }
  }
}

it('#2199 partial coverage retains the shell and carrier load separately', () => {
  check(4.76, bay(4.76), 'force');
  check(4.76, bay(4.76, 0.37, 1, 3, true), 'force');
  check(4.76, bay(4.76, 1.16, -1, 2, true), 'force');
});

it('#2200 the uncovered beam load begins at the shell boundary', () => {
  check(5, bay(5), 'moment');
  check(5, bay(5, 0.37, -1, 3, true), 'moment');
});

it('#2199 a thin uncovered band is loaded and full coverage loads the shells alone', () => {
  check(9.99, bay(9.99, 0.37, -1, 3, true), 'force');
  expect(areaLoads(bay(10, 0.37, -1, 3, true).model).distributed).toEqual([]);
  check(10 - 1e-8, bay(10 - 1e-8), 'force');
  const refusal = { key: 'loadPlan.gravity.stripInterval', params: { id: 1 } };
  expect(() => areaLoads(bay(10 - 1e-11).model)).toThrow(expect.objectContaining(refusal));
  expect(teAt(refusal, 'en')).toMatch(/below the supported member-load span/);
});

it('#2200 unsupported partial shell geometry blocks the plan', () => {
  const plan = buildLoadPlan(input(bay(4, 0.37, 1, 1, false, 1).model, { gravity: { mode: 'panels', loadEveryPanel: true } }));
  expect(plan.outcome).toBe('BLOCKED');
  expect(plan.blockedKeys).toEqual([{ key: 'loadPlan.gravity.unsupportedStrips' }]);
  expect(teAt(plan.blockedKeys[0]!, 'en')).toMatch(/partial shell coverage.*full-span/i);
  expect(plan.distributed).toEqual([]);
  expect(plan.surface).toEqual([]);
});

it('a wholly uncovered bay still loads every side', () => {
  const { model } = bay(0);
  const out = areaLoads(model);
  expect(new Set(out.distributed.map(load => load.elementId))).toEqual(new Set(model.elements.keys()));
  expect(out.surface).toEqual([]);
});
