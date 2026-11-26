import { expect, it } from 'vitest';
import { buildLoadPlan, roofWeightFor, roofWeightOf } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';
import { snowDriftRefusal } from '../snow-drift-loads';
import { doubleAttachedRoof, offsetRoof, roofPlan, triangulateRoof } from './gravity-offset-roof-fixture';
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
      const shellWidth = Math.max(...[...model.nodes.values()].map(n => mirror * (-n.x * Math.sin(angle) + n.y * Math.cos(angle))));
      expect(dead[0]).toMatchObject({ elementId: subdivided ? 2 : 1, frame: 'global' });
      expect(dead[0]!.q).toBeCloseTo(-shellWidth, 10);
      const load = dead[0]!;
      const el = model.elements.get(load.elementId)!;
      const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z! - a.z!);
      const localRun = a.x * Math.cos(angle) + a.y * Math.sin(angle);
      const firstStation = load.a ?? 0, lastStation = load.b ?? length;
      expect(localRun + firstStation / developed).toBeCloseTo(start, 10);
      expect(localRun + lastStation / developed).toBeCloseTo(end, 10);
      const shellArea = 4 * (10 - (end - start)) * developed;
      const beamForce = -load.q * (lastStation - firstStation);
      expect(beamForce).toBeCloseTo(shellWidth * (end - start) * developed, 10);
      expect(plan.surface.filter(load => load.caseType === 'D')).toEqual([
        { quadId: 1, caseType: 'D', q: 1 }, { quadId: 2, caseType: 'D', q: 1 },
      ]);
      expect(plan.levels.reduce((sum, l) => sum + l.superimposedKN, 0)).toBeCloseTo(shellArea + beamForce, 10);
      const actualFirst = (localRun + (firstStation + lastStation) / (2 * developed)) * beamForce
        + 2 * (start ** 2 + 100 - end ** 2) * developed;
      expect(actualFirst).toBeCloseTo(200 * developed, 10);
    }
  }
});


it('#2295 two attached shell traces leave the same bounded gap and load it once', () => {
  const developed = Math.hypot(10, 2) / 10;
  for (const split of [false, true]) for (const reverse of [false, true]) {
    const model = doubleAttachedRoof(split);
    if (reverse) model.constraints.reverse();
    const id = split ? 2 : 1;
    const plan = roofPlan(model);
    expect(plan.outcome).toBe('READY');
    const dead = plan.distributed.filter(load => load.caseType === 'D');
    expect(dead).toEqual([expect.objectContaining({ elementId: id, q: -3, frame: 'global' })]);
    expect(dead[0]?.a ?? 0).toBeCloseTo(split ? 0 : 4 * developed, 10);
    expect(dead[0]?.b ?? 2 * developed).toBeCloseTo((split ? 2 : 6) * developed, 10);
    expect(plan.surface.filter(load => load.caseType === 'D')).toHaveLength(4);
    expect(plan.levels.reduce((sum, level) => sum + level.superimposedKN, 0)).toBeCloseTo((64 + 6) * developed, 10);
    expect(gravityLayout(model, options).roofAreaOf.get(id)).toBeCloseTo(6, 10);
    expect(() => roofWeightFor(model, options, options.tributaryWidth, 1)).not.toThrow();
    expect(() => snowDriftRefusal(model)).not.toThrow();
  }
});

it('#2295 conflicting bounded gaps refuse the attached run', () => {
  const reason = { key: 'loadPlan.gravity.unresolvedMember', params: { id: 1 } };
  for (const split of [false, true]) for (const reverse of [false, true]) {
    const model = doubleAttachedRoof(split, [3, 6]);
    if (reverse) model.constraints.reverse();
    expect(roofPlan(model)).toMatchObject({ outcome: 'BLOCKED', blockedKeys: [reason], distributed: [], surface: [] });
    expect(() => gravityLayout(model, options)).toThrow(expect.objectContaining(reason));
    expect(() => roofWeightFor(model, options, options.tributaryWidth, 1)).toThrow(expect.objectContaining(reason));
    expect(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(reason));
  }
});

function roofWithTwoGaps(split: boolean, shelter: boolean) {
  const { model, rafter } = offsetRoof(0.02, 0, 1, false, [2, 8], options.tributaryWidth);
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
  shell(4, 6, -options.tributaryWidth / 2, options.tributaryWidth / 2, 3.8, 4.2);
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
    const { model } = offsetRoof(0.02, 0, 1, subdivided, [4, 6], options.tributaryWidth);
    const nodes = [[4, -options.tributaryWidth / 2], [end, -options.tributaryWidth / 2],
      [end, options.tributaryWidth / 2], [4, options.tributaryWidth / 2]].map(([x, y]) => {
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

it.each([[4, 6], [2, 4]] as const)(
  '#2607 shell and rafter conserve a full-width gap [%s, %s]', (start, end) => {
    const developed = Math.hypot(10, 2) / 10;
    const { model } = offsetRoof(0.02, 0, 1, false, [start, end]);
    const plan = roofPlan(model);
    expect(plan.outcome).toBe('READY');
    expect(plan.levels.reduce((total, level) => total + level.superimposedKN, 0)).toBeCloseTo(40 * developed, 10);
  },
);

it.each(['unequal edges', 'two rafters'] as const)(
  '#2607 refuse a gap without one certified transfer (%s)', mode => {
    const { model } = offsetRoof(0.02, 0, 1, false, [4, 6], 4, 4, 2);
    const upper = model.quads.get(2)!.nodes;
    if (mode === 'unequal edges') {
      model.nodes.get(upper[2]!)!.y = 3;
      model.nodes.get(upper[3]!)!.y = 3;
    } else {
      const farEnds = [model.quads.get(1)!.nodes[3]!, upper[2]!];
      const ends = farEnds.map(masterNode => {
        const master = model.nodes.get(masterNode)!;
        const id = model.nodes.size + 1;
        model.nodes.set(id, { ...master, id, z: master.z! - 0.02 });
        model.constraints.push({ type: 'rigidLink', masterNode, slaveNode: id, dofs: [0, 1, 2, 3, 4, 5] });
        return id;
      });
      model.elements.set(2, { ...model.elements.get(1)!, id: 2, nodeI: ends[0]!, nodeJ: ends[1]! });
    }
    expect(roofPlan(model)).toMatchObject({
      outcome: 'BLOCKED', blockedKeys: [expect.objectContaining({ key: 'loadPlan.gravity.unresolvedMember' })],
      distributed: [], surface: [],
    });
    expect(roofPlan(model, 'width').outcome).toBe('READY');
  },
);

it('#2607 a cover crossing the rafter only shelters part of its certified gap footprint', () => {
  const reason = { key: 'loadPlan.gravity.mixedExposure' };
  for (const split of [false, true]) for (const mirror of [1, -1]) {
    for (const [lo, hi, exposure] of [
      [-1, 1, 'mixed'], [1, 2, 'mixed'], [-4, -2, 'exposed'], [-2, 2, 'sheltered'],
    ] as const) {
      const { model } = offsetRoof(0.02, 0, mirror, split, [4, 6]);
      const nodes = [[4, lo], [6, lo], [6, hi], [4, hi]].map(([x, y]) => {
        const id = model.nodes.size + 1;
        model.nodes.set(id, { id, x: x!, y: mirror * y!, z: 8 });
        return id;
      });
      model.quads.set(3, { id: 3, nodes, materialId: 1, thickness: 0.1 });
      const plan = buildLoadPlan(input(model, {
        gravity: { mode: 'panels' },
        roof: { use: 'maintenance', weight: 'heavy', dead: 1, slopeDeg: Math.atan(0.2) * 180 / Math.PI },
      }));
      const explicitWidth = roofPlan(model, 'width');
      expect.soft(explicitWidth.outcome, JSON.stringify(explicitWidth.blockedKeys)).toBe('READY');
      expect(() => gravityLayout(model, { ...options, uniformPressure: true })).not.toThrow();
      if (exposure === 'mixed') {
        expect.soft(plan).toMatchObject({ outcome: 'BLOCKED', blockedKeys: [reason], distributed: [], surface: [] });
        expect.soft(() => gravityLayout(model, options)).toThrow(expect.objectContaining(reason));
        expect.soft(() => roofWeightFor(model, options, options.tributaryWidth, 1)).toThrow(expect.objectContaining(reason));
        expect.soft(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(reason));
      } else {
        expect.soft(roofPlan(model).outcome).toBe('READY');
        expect.soft(plan.blockedKeys).toEqual([{ key: 'loadPlan.blocked.concentratedRoof' }]);
        const layout = gravityLayout(model, options);
        const elementId = split ? 2 : 1;
        const areas = exposure === 'exposed' ? layout.roofAreaOf : layout.areaOf;
        expect.soft(areas.get(elementId)).toBeCloseTo(8, 10);
        const floorLive = 2, roofLive = 3;
        const rows = planAreaLoads({
          layout, tributaryWidth: options.tributaryWidth,
          floor: { dead: 1, lo: floorLive, liveOf: () => floorLive },
          roof: { use: 'occupancy', weight: 'heavy', dead: 1, slopePercent: 20, lo: roofLive, liveOf: () => roofLive },
        }).distributed.filter(row => row.caseType === 'L');
        expect.soft(rows).toEqual([expect.objectContaining({ elementId, q: -4 * (exposure === 'exposed' ? roofLive : floorLive) })]);
      }
    }
  }
});
it.each([[false, false], [true, false], [false, true], [true, true]] as const)('#2607 distinct attached decks refuse a single gap transfer (split %s, triangles %s)', (split, triangles) => {
  const reason = { key: 'loadPlan.gravity.unresolvedMember', params: { id: 1 } };
  for (const reverse of [false, true]) {
    const quads = doubleAttachedRoof(split, [4, 6], true);
    const model = triangles ? triangulateRoof(quads) : quads;
    if (reverse) model.constraints.reverse();
    expect.soft(roofPlan(model)).toMatchObject({ outcome: 'BLOCKED', blockedKeys: [reason], distributed: [], surface: [] });
    expect.soft(() => gravityLayout(model, { ...options, uniformPressure: true })).toThrow(expect.objectContaining(reason));
    expect.soft(() => roofWeightFor(model, options, options.tributaryWidth, 1)).toThrow(expect.objectContaining(reason));
    expect.soft(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(reason));
    expect.soft(roofPlan(model, 'width').outcome).toBe('READY');
  }
});

it.each([[false, false], [true, false], [false, true], [true, true]] as const)('#2607 gap exposure uses the attached plane (split %s, triangles %s)', (split, triangles) => {
  for (const [rise, width, sheltered] of [[-0.02, 4, false], [0.03, 4, false], [0.03, 2, false], [0.07, 4, true]] as const) {
    const { model: quads } = offsetRoof(0.04, 0, 1, split, [4, 6]);
    const nodes = [[4, -2], [6, -2], [6, width - 2], [4, width - 2]].map(([x, y]) => {
      const id = quads.nodes.size + 1;
      quads.nodes.set(id, { id, x: x!, y: y!, z: 3 + x! / 5 + rise });
      return id;
    });
    quads.quads.set(3, { id: 3, nodes, materialId: 1, thickness: 0.1 });
    const model = triangles ? triangulateRoof(quads) : quads;
    expect.soft(() => roofWeightFor(model, options, options.tributaryWidth, 1)).not.toThrow();
    expect.soft(() => snowDriftRefusal(model)).not.toThrow();
    expect.soft(roofPlan(model).outcome).toBe('READY');
    const layout = gravityLayout(model, options);
    const elementId = split ? 2 : 1;
    expect.soft((sheltered ? layout.areaOf : layout.roofAreaOf).get(elementId), `rise ${rise}`).toBeCloseTo(8, 10);
    const distributed = planAreaLoads({
      layout, tributaryWidth: options.tributaryWidth,
      floor: { dead: 1, lo: 2, liveOf: () => 2 },
      roof: { use: 'occupancy', weight: 'heavy', dead: 1, slopePercent: 20, lo: 3, liveOf: () => 3 },
    }).distributed.filter(row => row.caseType === 'L');
    const developed = Math.hypot(10, 2) / 10;
    const expected = { elementId, q: -4 * (sheltered ? 2 : 3) };
    expect.soft(distributed, `rise ${rise}`).toEqual([expect.objectContaining(expected)]);
    if (distributed.length === 1) {
      expect.soft(distributed[0]!.a ?? 0).toBeCloseTo(split ? 0 : 4 * developed, 10);
      expect.soft(distributed[0]!.b ?? 2 * developed).toBeCloseTo((split ? 2 : 6) * developed, 10);
    }
  }
});

it.each([0, 0.5, -0.5, 1e-8])(
  '#2607 panel gravity checks a 2 m gap strip offset by %s m', offset => {
    for (const split of [false, true]) for (const angle of [0, 0.53]) {
      const { model } = offsetRoof(0.02, angle, 1, split, [4, 6], 2, 2, offset);
      expect.soft(roofPlan(model, 'width').outcome).toBe('READY');
      if (offset === 0) {
        expect.soft(roofPlan(model).outcome).toBe('READY');
      } else {
        expect.soft(roofPlan(model)).toMatchObject({
          outcome: 'BLOCKED', blockedKeys: [expect.objectContaining({ key: 'loadPlan.gravity.unresolvedMember' })],
          distributed: [], surface: [],
        });
      }
    }
  },
);

it.each([0, 5])(
  '#2607 aligned certified rafter gaps with lateral offset %s', lateralOffset => {
    const { model } = offsetRoof(0.02, 0, 1, false, [4, 6]);
    const sheltered = lateralOffset === 0;
    const lowerId = 1;
    const { model: upper } = offsetRoof(0.02, 0, 1, false, [4, 6]);
    const offset = model.nodes.size;
    for (const [id, node] of upper.nodes) model.nodes.set(id + offset, { ...node, id: id + offset, y: node.y + lateralOffset, z: node.z! + 1 });
    for (const [id, shell] of upper.quads) model.quads.set(id + 2, { ...shell, id: id + 2, nodes: shell.nodes.map(node => node + offset) });
    for (const [id, member] of upper.elements) model.elements.set(id + 1, { ...member, id: id + 1, nodeI: member.nodeI + offset, nodeJ: member.nodeJ + offset });
    for (const link of upper.constraints) model.constraints.push({ ...link, masterNode: link.masterNode + offset, slaveNode: link.slaveNode + offset });
    const layout = gravityLayout(model, options);
    expect.soft((sheltered ? layout.areaOf : layout.roofAreaOf).get(lowerId)).toBeCloseTo(8, 10);
    expect.soft(layout.roofAreaOf.get(2)).toBeCloseTo(8, 10);
    const plan = buildLoadPlan(input(model, {
      gravity: { mode: 'panels' },
      roof: { use: 'occupancy', occupancyKey: 'vivienda', weight: 'heavy', dead: 2, slopeDeg: Math.atan(0.2) * 180 / Math.PI },
    }));
    expect.soft(roofPlan(model).outcome).toBe('READY');
    expect.soft(plan.blockedKeys).toEqual([{ key: 'loadPlan.blocked.concentratedRoof' }]);
    expect.soft(plan.distributed.find(row => row.elementId === lowerId && row.caseType === 'D')?.q).toBeCloseTo(sheltered ? -4 : -8, 10);
    expect.soft(plan.distributed.find(row => row.elementId === 2 && row.caseType === 'D')?.q).toBeCloseTo(-8, 10);
  },
);

function checkRafterBelowGap(y: number, sheltered: boolean) {
  const { model } = offsetRoof(0.02, 0, 1, false, [4, 6]);
  const nodeI = model.nodes.size + 1, nodeJ = nodeI + 1;
  model.nodes.set(nodeI, { id: nodeI, x: 4.5, y, z: 2.9 });
  model.nodes.set(nodeJ, { id: nodeJ, x: 5.5, y, z: 3.1 });
  model.elements.set(2, { id: 2, nodeI, nodeJ, sectionId: 1, materialId: 1, type: 'frame' });
  const layout = gravityLayout(model, options);
  expect.soft(layout.roof.has(2)).toBe(!sheltered);
  expect.soft((sheltered ? layout.areaOf : layout.roofAreaOf).get(2)).toBeCloseTo(3, 10);
  const actions = planAreaLoads({
    layout, tributaryWidth: 3, floor: { dead: 1, lo: 2, liveOf: () => 2 },
    roof: { use: 'occupancy', weight: 'heavy', dead: 2, slopePercent: 0 },
  });
  expect.soft(actions.distributed.filter(row => row.elementId === 2 && row.caseType === 'D'))
    .toMatchObject([{ q: sheltered ? -3 : -6 }]);
  expect.soft(roofPlan(model).outcome).toBe('READY');
  const plan = buildLoadPlan(input(model, {
    gravity: { mode: 'panels' },
    roof: { use: 'occupancy', occupancyKey: 'vivienda', weight: 'heavy', dead: 2, slopeDeg: 0 },
  }));
  expect.soft(plan.distributed.filter(row => row.elementId === 2 && row.caseType === 'D'))
    .toMatchObject([{ q: sheltered ? -3 : -6 }]);
}

it.each([1, 2])('#2607 shelters the individual rafter at y = %s beneath a certified gap', y => {
  checkRafterBelowGap(y, true);
});

it('#2607 exposes the individual rafter outside the certified gap footprint', () => {
  checkRafterBelowGap(2 + 1e-6, false);
});
