import { expect, it } from 'vitest';
import { buildLoadPlan, roofWeightFor, roofWeightOf, type LoadModelData } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { snowDriftRefusal } from '../snow-drift-loads';
import { doubleAttachedRoof, offsetRoof, roofPlan, triangulateRoof } from './gravity-offset-roof-fixture';
import { input } from './gravity-width-mass-fixture';

const options = { mode: 'panels', tributaryWidth: 3 } as const;

function expectGapRefusal(model: LoadModelData, members: string, gap: string) {
  const reason = { key: 'loadPlan.gravity.rafterGap', params: { members, gap } };
  expect.soft(roofPlan(model)).toMatchObject({
    outcome: 'BLOCKED', blockedKeys: [reason], distributed: [], surface: [], nodal: [],
  });
  expect.soft(() => gravityLayout(model, options)).toThrow(expect.objectContaining(reason));
  expect.soft(() => gravityLayout(model, { ...options, uniformPressure: true })).toThrow(expect.objectContaining(reason));
  expect.soft(() => roofWeightFor(model, options, options.tributaryWidth, 1)).toThrow(expect.objectContaining(reason));
  expect.soft(() => snowDriftRefusal(model)).toThrow(expect.objectContaining(reason));
}

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

it('#2295 refuses an opening along a rigidly attached roof run', () => {
  for (const gap of [[4, 6], [2, 4]] as const) {
    for (const [angle, mirror, split] of [[0, 1, false], [0.53, -1, true]] as const) {
      const { model } = offsetRoof(0.02, angle, mirror, split, gap);
      expectGapRefusal(model, split ? '1, 2, 3' : '1', gap.join('–'));
    }
  }
});

it.each([[4, 6], [3, 6]] as const)('#2295 refuses two attached shell traces with gaps at %s–%s', (a, b) => {
  for (const split of [false, true]) for (const reverse of [false, true]) {
    const model = doubleAttachedRoof(split, [a, b]);
    if (reverse) model.constraints.reverse();
    expectGapRefusal(model, split ? '1, 2, 3' : '1', '4–6');
  }
});

function roofWithTwoGaps(split: boolean, shelter: boolean) {
  const { model, rafter } = offsetRoof(0.02, 0, 1, false, [2, 8], options.tributaryWidth);
  const addNode = (x: number, y: number, z: number) => {
    const id = model.nodes.size + 1;
    model.nodes.set(id, { id, x, y, z });
    return id;
  };
  const shell = (a: number, b: number, y0: number, y1: number, za: number, zb: number, seam?: [number, number]) => {
    const id = model.quads.size + 1;
    const [first, second] = seam ?? [addNode(a, y0, za), addNode(b, y0, zb)];
    const nodes = [first, second, addNode(b, y1, zb), addNode(a, y1, za)] as [number, number, number, number];
    model.quads.set(id, { id, nodes, materialId: 1, thickness: 0.1 });
    return nodes;
  };
  const [, , right, left] = shell(4, 6, -options.tributaryWidth / 2, 0, 3.8, 4.2);
  shell(4, 6, 0, options.tributaryWidth / 2, 3.8, 4.2, [left, right]);
  const anchor = addNode(4, 0, 3.78);
  model.constraints.push({ ...model.constraints[0]!, masterNode: left, slaveNode: anchor });
  if (shelter) shell(2, 4, -1, 1, 8, 8);
  const member = model.elements.get(1)!;
  model.elements.set(1, { ...member, nodeJ: anchor });
  const middle = split ? addNode(5, 0, 3.98) : rafter[1]!;
  model.elements.set(2, { ...member, id: 2, nodeI: anchor, nodeJ: middle });
  if (split) model.elements.set(3, { ...member, id: 3, nodeI: middle, nodeJ: rafter[1]! });
  return model;
}

it('refuses both openings in a physical run under subdivision', () => {
  for (const split of [false, true]) for (const shelter of [false, true]) {
    expectGapRefusal(roofWithTwoGaps(split, shelter), split ? '1, 2, 3' : '1, 2', '2–4, 6–8');
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

it('#2586 refuses an attached gap across canopy edges', () => {
  for (const subdivided of [false, true]) for (const end of [4, 5, 6]) {
    const { model } = offsetRoof(0.02, 0, 1, subdivided, [4, 6], options.tributaryWidth);
    const nodes = [[4, -options.tributaryWidth / 2], [end, -options.tributaryWidth / 2],
      [end, options.tributaryWidth / 2], [4, options.tributaryWidth / 2]].map(([x, y]) => {
      const id = model.nodes.size + 1;
      model.nodes.set(id, { id, x: x!, y: y!, z: 8 + y! });
      return id;
    });
    if (end > 4) model.quads.set(3, { id: 3, nodes, materialId: 1, thickness: 0.1 });
    expectGapRefusal(model, subdivided ? '1, 2, 3' : '1', '4–6');
    expect(roofPlan(model, 'width').outcome).toBe('READY');
  }
});

it.each([[4, 6], [2, 4]] as const)('#2607 refuses a full-width gap at %s–%s', (start, end) => {
  const { model } = offsetRoof(0.02, 0, 1, false, [start, end]);
  expectGapRefusal(model, '1', `${start}–${end}`);
});

it.each(['unequal edges', 'two rafters'] as const)(
  '#2607 refuses a gap with %s', mode => {
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
    expectGapRefusal(model, '1', '4–6');
    expect(roofPlan(model, 'width').outcome).toBe('READY');
  },
);

it('#2607 refuses a gap with full, partial, or no canopy cover', () => {
  for (const split of [false, true]) for (const mirror of [1, -1]) {
    for (const [lo, hi] of [
      [-1, 1], [1, 2], [-4, -2], [-2, 2],
    ] as const) {
      const { model } = offsetRoof(0.02, 0, mirror, split, [4, 6]);
      const nodes = [[4, lo], [6, lo], [6, hi], [4, hi]].map(([x, y]) => {
        const id = model.nodes.size + 1;
        model.nodes.set(id, { id, x: x!, y: mirror * y!, z: 8 });
        return id;
      });
      model.quads.set(3, { id: 3, nodes, materialId: 1, thickness: 0.1 });
      expectGapRefusal(model, split ? '1, 2, 3' : '1', '4–6');
      expect(roofPlan(model, 'width').outcome).toBe('READY');
    }
  }
});

it.each([[false, false], [true, false], [false, true], [true, true]] as const)('#2607 refuses gaps between distinct attached decks (split %s, triangles %s)', (split, triangles) => {
  for (const reverse of [false, true]) {
    const quads = doubleAttachedRoof(split, [4, 6], true);
    const model = triangles ? triangulateRoof(quads) : quads;
    if (reverse) model.constraints.reverse();
    expectGapRefusal(model, split ? '1, 2, 3' : '1', '4–6');
    expect.soft(roofPlan(model, 'width').outcome).toBe('READY');
  }
});

it.each([[false, false], [true, false], [false, true], [true, true]] as const)('#2607 refuses a gap with a deck at several clearances (split %s, triangles %s)', (split, triangles) => {
  for (const [rise, width] of [[-0.02, 4], [0.03, 4], [0.03, 2], [0.07, 4]] as const) {
    const { model: quads } = offsetRoof(0.04, 0, 1, split, [4, 6]);
    const nodes = [[4, -2], [6, -2], [6, width - 2], [4, width - 2]].map(([x, y]) => {
      const id = quads.nodes.size + 1;
      quads.nodes.set(id, { id, x: x!, y: y!, z: 3 + x! / 5 + rise });
      return id;
    });
    quads.quads.set(3, { id: 3, nodes, materialId: 1, thickness: 0.1 });
    const model = triangles ? triangulateRoof(quads) : quads;
    expectGapRefusal(model, split ? '1, 2, 3' : '1', '4–6');
  }
});

it.each([0, 0.5, -0.5, 1e-8])(
  '#2607 refuses a 2 m wide gap with transverse offset %s m', offset => {
    for (const split of [false, true]) for (const angle of [0, 0.53]) {
      const { model } = offsetRoof(0.02, angle, 1, split, [4, 6], 2, 2, offset);
      expect.soft(roofPlan(model, 'width').outcome).toBe('READY');
      expectGapRefusal(model, split ? '1, 2, 3' : '1', '4–6');
    }
  },
);

it.each([0, 5])(
  '#2607 refuses stacked rafter gaps with lateral offset %s', lateralOffset => {
    const { model } = offsetRoof(0.02, 0, 1, false, [4, 6]);
    const { model: upper } = offsetRoof(0.02, 0, 1, false, [4, 6]);
    const offset = model.nodes.size;
    for (const [id, node] of upper.nodes) model.nodes.set(id + offset, { ...node, id: id + offset, y: node.y + lateralOffset, z: node.z! + 1 });
    for (const [id, shell] of upper.quads) model.quads.set(id + 2, { ...shell, id: id + 2, nodes: shell.nodes.map(node => node + offset) });
    for (const [id, member] of upper.elements) model.elements.set(id + 1, { ...member, id: id + 1, nodeI: member.nodeI + offset, nodeJ: member.nodeJ + offset });
    for (const link of upper.constraints) model.constraints.push({ ...link, masterNode: link.masterNode + offset, slaveNode: link.slaveNode + offset });
    expectGapRefusal(model, '1', '4–6');
  },
);

it.each([1, 2, 2 + 1e-6])('#2607 refuses a gap over a separate rafter at y = %s', y => {
  const { model } = offsetRoof(0.02, 0, 1, false, [4, 6]);
  const nodeI = model.nodes.size + 1, nodeJ = nodeI + 1;
  model.nodes.set(nodeI, { id: nodeI, x: 4.5, y, z: 2.9 });
  model.nodes.set(nodeJ, { id: nodeJ, x: 5.5, y, z: 3.1 });
  model.elements.set(2, { id: 2, nodeI, nodeJ, sectionId: 1, materialId: 1, type: 'frame' });
  expectGapRefusal(model, '1', '4–6');
});

it.each([[false, false], [true, true]] as const)(
  '#2607 refuses a gap next to attached and detached shell wings (split %s, triangles %s)', (split, triangles) => {
    for (const attachment of ['detached', 'one node', 'shared edge']) {
      const { model: quads } = offsetRoof(0.02, 0, 1, split, [4, 6], 2);
      const addNode = (x: number, y: number) => {
        const id = quads.nodes.size + 1;
        quads.nodes.set(id, { id, x, y, z: 3 + x / 5 });
        return id;
      };
      for (const shell of [...quads.quads.values()]) {
        const [a, b, c, d] = shell.nodes;
        for (const [start, end, direction] of [[a!, b!, -1], [d!, c!, 1]] as const) {
          const p = quads.nodes.get(start)!, q = quads.nodes.get(end)!;
          const sharesNode = (x: number) => attachment === 'shared edge'
            || (attachment === 'one node' && (x === 4 || x === 6));
          const from = sharesNode(p.x) ? start : addNode(p.x, p.y);
          const to = sharesNode(q.x) ? end : addNode(q.x, q.y);
          const id = quads.quads.size + 1;
          quads.quads.set(id, { ...shell, id, nodes: [from, to, addNode(q.x, q.y + direction * 2), addNode(p.x, p.y + direction * 2)] });
        }
      }
      const model = triangles ? triangulateRoof(quads) : quads;
      expectGapRefusal(model, split ? '1, 2, 3' : '1', '4–6');
    }
  },
);

it.each([4, 6])('#2607 a detached shell reaching station %s must be identified', end => {
  for (const connected of [false, true]) {
    const { model } = offsetRoof(0.02, 0, 1, false, [3, 6], 2);
    const addNode = (x: number, y: number) => {
      const id = model.nodes.size + 1;
      model.nodes.set(id, { id, x, y, z: 3 + x / 5 });
      return id;
    };
    const shell = model.quads.get(1)!;
    const left = connected ? [shell.nodes[1]!, shell.nodes[2]!] : [addNode(3, -1), addNode(3, 1)];
    const right = connected && end === 6 ? [model.quads.get(2)!.nodes[0]!, model.quads.get(2)!.nodes[3]!]
      : [addNode(end, -1), addNode(end, 1)];
    model.quads.set(3, { ...shell, id: 3, nodes: [left[0]!, right[0]!, right[1]!, left[1]!] });
    if (connected && end === 6) {
      expect.soft(gravityLayout(model, options).roofAreaOf.get(1) ?? 0).toBeCloseTo(0, 10);
      expect.soft(roofPlan(model).outcome).toBe('READY');
    } else {
      expectGapRefusal(model, '1', connected ? `${end}–6` : '3–6');
      expect.soft(roofPlan(model, 'width').outcome).toBe('READY');
    }
  }
});

it.each([
  { y: 0, rise: 1 },
  { y: 0, rise: 0.03 },
  { y: 2.5, rise: 1 },
  { y: 2.25, rise: 1 },
] as const)('#2607 refuses a gap beneath a bare roof strip at y=$y, rise=$rise', ({ y, rise }) => {
  for (const split of [false, true]) {
    const { model: quads } = offsetRoof(0.02, 0, 1, split, [4, 6], 2);
    const nodeI = quads.nodes.size + 1, nodeJ = nodeI + 1;
    quads.nodes.set(nodeI, { id: nodeI, x: 4, y, z: 3 + 4 / 5 + rise });
    quads.nodes.set(nodeJ, { id: nodeJ, x: 6, y, z: 3 + 6 / 5 + rise });
    const upperId = quads.elements.size + 1;
    quads.elements.set(upperId, { ...quads.elements.get(1)!, id: upperId, nodeI, nodeJ });
    const model = split ? triangulateRoof(quads) : quads;
    expectGapRefusal(model, split ? '1, 2, 3' : '1', '4–6');
    expect.soft(roofPlan(model, 'width').outcome).toBe('READY');
  }
});

it('#2607 refuses the gap at large coordinates regardless of entered width', () => {
  const { model } = offsetRoof(0.02, 0, 1, false, [4, 6], 2);
  const nodeI = model.nodes.size + 1, nodeJ = nodeI + 1;
  model.nodes.set(nodeI, { id: nodeI, x: 4, y: 0, z: 5 });
  model.nodes.set(nodeJ, { id: nodeJ, x: 6, y: 0, z: 5.4 });
  model.elements.set(2, { ...model.elements.get(1)!, id: 2, nodeI, nodeJ });
  for (const node of model.nodes.values()) node.y += 1e8;
  const plan = (tributaryWidth: number) => buildLoadPlan(input(model, { gravity: { mode: 'panels' }, tributaryWidth }));
  const reason = { key: 'loadPlan.gravity.rafterGap', params: { members: '1', gap: '4–6' } };
  for (const width of [1e-9, 3]) {
    expect(plan(width)).toMatchObject({ outcome: 'BLOCKED', blockedKeys: [reason], distributed: [], surface: [] });
  }
});
