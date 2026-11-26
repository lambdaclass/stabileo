import { expect, it } from 'vitest';
import { buildLoadPlan, roofWeightFor, roofWeightOf } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { snowDriftRefusal } from '../snow-drift-loads';
import { offsetRoof, roofPlan } from './gravity-offset-roof-fixture';
import { input } from './gravity-width-mass-fixture';

const options = { mode: 'panels', tributaryWidth: 3 } as const;

it('#2282 an offset rafter tied to a loaded roof shell receives no duplicate member gravity', () => {
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
    expect(plan.levels.reduce((sum, level) => sum + level.planAreaM2, 0)).toBeCloseTo(40, 10);
    expect(plan.levels.reduce((sum, level) => sum + level.superimposedKN, 0)).toBeCloseTo(4 * Math.hypot(10, 2), 10);
    expect(layout.shells).toHaveLength(expectedShellAreas.length);
    for (const [index, q] of layout.shells.entries()) {
      expect(q.area).toBeCloseTo(expectedShellAreas[index]!, 10);
      expect(q.cos).toBeCloseTo(cos, 10);
      expect(plan.surface.find(load => load.caseType === 'D' && load.quadId === q.target.quadId)?.q).toBe(1);
      const live = plan.surface.find(load => load.caseType === 'L' && load.quadId === q.target.quadId);
      expect(live?.q).toBeCloseTo(plan.factors.occupancy.value * cos, 10);
    }
    for (const shell of model.quads.values()) shell.thickness = 0.01;
    expect(roofWeightOf(model, layout, 0).structure).toBeCloseTo(0.01 * model.materials.get(1)!.rho / cos, 10);
    expect(roofWeightFor(model, options, options.tributaryWidth, 0)).toBe('light');
  }
});

it('#2282 ambiguous rigid shell attachment refuses gravity transfer', () => {
  const gap = offsetRoof(0.02, 0, 1, false, true).model;
  gap.constraints.pop();
  const unequal = offsetRoof(0.02).model;
  unequal.nodes.get(unequal.constraints[1]!.slaveNode)!.z! += 0.005;
  const singleEnd = offsetRoof(0.02).model;
  singleEnd.constraints.pop();
  const reason = { key: 'loadPlan.gravity.unresolvedMember', params: { id: 1 } };
  for (const model of [gap, unequal, singleEnd]) {
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

it('#2295 the rafter receives the uncovered part of a rigidly attached roof run', () => {
  const developed = Math.hypot(10, 2) / 10;
  for (const [start, end] of [[4, 6], [2, 4]] as const) {
    for (const [angle, mirror, subdivided] of [[0, 1, false], [0.53, -1, true]] as const) {
      const { model } = offsetRoof(0.02, angle, mirror, subdivided, [start, end]);
      const plan = roofPlan(model);
      expect(plan.outcome).toBe('READY');
      const dead = plan.distributed.filter(load => load.caseType === 'D');
      expect(dead).toHaveLength(1);
      expect(dead[0]).toMatchObject({ elementId: subdivided ? 2 : 1, frame: 'global', q: -options.tributaryWidth });
      const load = dead[0]!;
      const el = model.elements.get(load.elementId)!;
      const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z! - a.z!);
      const localRun = a.x * Math.cos(angle) + a.y * Math.sin(angle);
      const firstStation = load.a ?? 0, lastStation = load.b ?? length;
      expect(localRun + firstStation / developed).toBeCloseTo(start, 10);
      expect(localRun + lastStation / developed).toBeCloseTo(end, 10);
      const shellArea = 4 * (10 - (end - start)) * developed;
      const beamForce = options.tributaryWidth * (lastStation - firstStation);
      expect(beamForce).toBeCloseTo(3 * (end - start) * developed, 10);
      expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([
        { quadId: 1, caseType: 'D', q: 1 }, { quadId: 2, caseType: 'D', q: 1 },
      ]);
      expect(plan.levels.reduce((sum, l) => sum + l.superimposedKN, 0)).toBeCloseTo(shellArea + beamForce, 10);
      const actualFirst = (localRun + (firstStation + lastStation) / (2 * developed)) * beamForce
        + 2 * (start ** 2 + 100 - end ** 2) * developed;
      expect(actualFirst).toBeCloseTo((200 - (end ** 2 - start ** 2) / 2) * developed, 10);
    }
  }
});


function roofWithTwoGaps(split: boolean, shelter: boolean) {
  const { model, rafter } = offsetRoof(0.02, 0, 1, false, [2, 8]);
  const addNode = (x: number, y: number, z: number) => {
    const id = model.nodes.size + 1;
    model.nodes.set(id, { id, x, y, z });
    return id;
  };
  const shell = (a: number, b: number, y0: number, y1: number, za: number, zb: number) => {
    const id = model.quads.size + 1;
    const nodes = [addNode(a, y0, za), addNode(b, y0, zb), addNode(b, y1, zb), addNode(a, y1, za)];
    model.quads.set(id, { id, nodes, materialId: 1, thickness: 0.1 });
  };
  shell(4, 6, 0, 4, 3.8, 4.2);
  if (shelter) shell(2, 4, -1, 1, 8, 8);
  if (split) {
    const middle = addNode(5, 0, 3.98);
    const member = model.elements.get(1)!;
    model.elements.set(1, { ...member, nodeJ: middle });
    model.elements.set(2, { ...member, id: 2, nodeI: middle, nodeJ: rafter[1]! });
  }
  return model;
}

it('mixed gap exposure refuses the physical run under subdivision', () => {
  const reason = { key: 'loadPlan.gravity.mixedExposure' };
  for (const split of [false, true]) {
    const model = roofWithTwoGaps(split, true);
    expect.soft(() => gravityLayout(model, options)).toThrow(expect.objectContaining(reason));
    expect.soft(buildLoadPlan(input(model, {
      gravity: { mode: 'panels' }, roof: { use: 'maintenance', weight: 'heavy', dead: 1, slopeDeg: Math.atan(0.2) * 180 / Math.PI },
    }))).toMatchObject({ outcome: 'BLOCKED', blockedKeys: [reason] });
    expect.soft(() => roofWeightFor(model, options, options.tributaryWidth, 1)).toThrow(expect.objectContaining(reason));
    expect.soft(() => gravityLayout(model, { ...options, uniformPressure: true })).not.toThrow();
    const exposed = roofWithTwoGaps(split, false);
    const expected = roofPlan(exposed);
    expect(expected.outcome).toBe('READY');
    const layout = gravityLayout(exposed, options);
    expect([...layout.roofAreaOf.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(12, 10);
  }
});

it('#2586 keeps the full explicit width on a rigidly attached rafter with a bounded gap', () => {
  for (const subdivided of [false, true]) {
    const { model } = offsetRoof(0.02, 0, 1, subdivided, [4, 6]);
    const plan = roofPlan(model, 'width');
    expect(plan.outcome).toBe('READY');
    expect(plan.surface).toEqual([]);
    expect(plan.distributed.filter(load => load.caseType === 'D')).toEqual([...model.elements.keys()].map(elementId => ({
      caseType: 'D', elementId, q: -options.tributaryWidth, frame: 'global',
    })));
  }
});

it('#2586 partitions one attached gap at a canopy edge', () => {
  const reason = { key: 'loadPlan.gravity.mixedExposure' };
  for (const subdivided of [false, true]) for (const end of [4, 5, 6]) {
    const { model } = offsetRoof(0.02, 0, 1, subdivided, [4, 6]);
    const nodes = [[4, -1], [end, -1], [end, 1], [4, 1]].map(([x, y]) => {
      const id = model.nodes.size + 1;
      model.nodes.set(id, { id, x: x!, y: y!, z: 8 + y! });
      return id;
    });
    if (end > 4) model.quads.set(3, { id: 3, nodes, materialId: 1, thickness: 0.1 });
    const plan = (mode: 'panels' | 'width') => buildLoadPlan(input(model, {
      gravity: { mode }, roof: { use: 'maintenance', weight: 'heavy', dead: 1, slopeDeg: Math.atan(0.2) * 180 / Math.PI },
    }));
    expect.soft(roofPlan(model, 'width').outcome).toBe('READY');
    expect.soft(() => gravityLayout(model, { ...options, uniformPressure: true })).not.toThrow();
    if (end === 5) {
      expect.soft(plan('panels')).toMatchObject({ outcome: 'BLOCKED', blockedKeys: [reason], distributed: [], surface: [] });
      expect.soft(() => roofWeightFor(model, options, options.tributaryWidth, 1)).toThrow(expect.objectContaining(reason));
    } else {
      expect.soft(roofPlan(model).outcome).toBe('READY');
      const layout = gravityLayout(model, options);
      const areas = end === 4 ? layout.roofAreaOf : layout.areaOf;
      expect.soft([...model.elements.keys()].reduce((sum, id) => sum + (areas.get(id) ?? 0), 0)).toBeCloseTo(6, 10);
    }
  }
});

it.skipIf(process.env.STABILEO_REPLAY_2607 !== '1').each([[4, 6], [2, 4]] as const)(
  'known wrong result: #2607 — shell and rafter conserve a full-width gap [%s, %s]', (start, end) => {
    const developed = Math.hypot(10, 2) / 10;
    const { model } = offsetRoof(0.02, 0, 1, false, [start, end]);
    const plan = roofPlan(model);
    expect(plan.outcome).toBe('READY');
    expect(plan.levels.reduce((total, level) => total + level.superimposedKN, 0)).toBeCloseTo(40 * developed, 10);
  },
);
