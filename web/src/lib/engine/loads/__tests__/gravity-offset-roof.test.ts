import { expect, it } from 'vitest';
import { buildLoadPlan, roofWeightFor } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { snowDriftRefusal } from '../snow-drift-loads';
import { offsetRoof, roofPlan } from './gravity-offset-roof-fixture';
import { input } from './gravity-width-mass-fixture';

const regression = process.env.RUN_KNOWN_WRONG === '2282' ? it : it.skip;
const options = { mode: 'panels', tributaryWidth: 3 } as const;

regression('known wrong result: #2282 an offset rafter tied to a loaded roof shell receives no duplicate member gravity', () => {
  const cos = 10 / Math.hypot(10, 2);
  for (const [offset, angle, mirror, subdivide] of [[0.02, 0, 1, false], [0.02, 0.53, 1, true], [-0.02, 1.21, -1, true]] as const) {
    const { model } = offsetRoof(offset, angle, mirror, subdivide);
    const layout = gravityLayout(model, options);
    const plan = roofPlan(model);
    const expectedShellAreas = subdivide ? [28, 12] : [40];
    expect(plan.outcome).toBe('READY');
    for (const member of model.elements.values()) {
      expect(layout.widthMembers.filter(load => load.elementId === member.id)).toEqual([]);
      expect(plan.distributed.filter(load => load.elementId === member.id)).toEqual([]);
    }
    expect(plan.nodal).toEqual([]);
    expect(layout.shellQuads).toHaveLength(expectedShellAreas.length);
    for (const [index, q] of layout.shellQuads.entries()) {
      expect(q.area).toBeCloseTo(expectedShellAreas[index]!, 10);
      expect(q.cos).toBeCloseTo(cos, 10);
      expect(plan.surface.find(load => load.caseType === 'D' && load.quadId === q.quadId)?.q).toBe(1);
      const live = plan.surface.find(load => load.caseType === 'L' && load.quadId === q.quadId);
      expect(live?.q).toBeCloseTo(plan.factors.occupancy.value * cos, 10);
    }
    expect(roofWeightFor(model, options, options.tributaryWidth, 1)).toBe(
      roofWeightFor(offsetRoof(0, angle, mirror, subdivide).model, options, options.tributaryWidth, 1),
    );
  }
});

regression('known wrong result: #2282 ambiguous rigid shell attachment refuses gravity transfer', () => {
  const gap = offsetRoof(0.02, 0, 1, false, true).model;
  const singleEnd = offsetRoof(0.02).model;
  singleEnd.constraints.pop();
  const reason = { key: 'loadPlan.gravity.unresolvedMember', params: { id: 1 } };
  for (const model of [gap, singleEnd]) {
    for (const loadEveryPanel of [false, true]) {
      const plan = buildLoadPlan(input(model, { gravity: { mode: 'panels', loadEveryPanel } }));
      expect(plan.outcome).toBe('BLOCKED');
      expect(plan.blockedKeys).toEqual([reason]);
      expect(plan.distributed).toEqual([]);
      expect(plan.surface).toEqual([]);
      expect(plan.nodal).toEqual([]);
      expect(plan.levels).toEqual([]);
      expect(() => gravityLayout(model, { ...options, loadEveryPanel })).toThrow(expect.objectContaining(reason));
      expect(() => roofWeightFor(model, { mode: 'panels', loadEveryPanel }, options.tributaryWidth, 1)).toThrow(expect.objectContaining(reason));
    }
    expect(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(reason));
  }
});

it('keeps the tributary-width profile for an independent rafter and for explicit width mode', () => {
  const { model } = offsetRoof(0.02);
  const widthPlan = roofPlan(model, 'width');
  expect(widthPlan.outcome).toBe('READY');
  expect(widthPlan.surface).toEqual([]);
  for (const dofs of [[], [0, 1]]) {
    const independent = { ...model, constraints: dofs.length ? model.constraints.map(c => ({ ...c, dofs })) : [] };
    const layout = gravityLayout(independent, options);
    const plan = roofPlan(independent);
    expect(plan.outcome).toBe('READY');
    expect(layout.widthMembers.map(load => load.elementId)).toEqual([1]);
    for (const candidate of [plan, widthPlan]) {
      expect(candidate.distributed.filter(load => load.caseType === 'D')).toEqual([
        { caseType: 'D', elementId: 1, q: -options.tributaryWidth, frame: 'global' },
      ]);
      expect(candidate.nodal).toEqual([]);
    }
  }
});
