import { expect, it } from 'vitest';
import { bindRole } from '../../../codes/roles';
import { buildLoadPlan, type LoadModelData, type SeismicPlanSink } from '../load-plan';
import { INPRES103_SEISMIC } from '../../../codes/families/cirsoc';
import { input } from './gravity-width-mass-fixture';

function bracedFrame(): LoadModelData {
  const nodes = new Map([
    [1, { id: 1, x: 0, y: 0, z: 0 }],
    [2, { id: 2, x: 4, y: 0, z: 0 }],
    [3, { id: 3, x: 0, y: 0, z: 4 }],
    [4, { id: 4, x: 4, y: 0, z: 4 }],
    [5, { id: 5, x: 2, y: 0, z: 2 }],
  ]);
  const elements = new Map([[1, 3], [2, 4], [3, 4], [1, 5], [2, 5], [5, 3], [5, 4]].map(([nodeI, nodeJ], i) => [
    i + 1, { id: i + 1, nodeI: nodeI!, nodeJ: nodeJ!, sectionId: 1, materialId: 1, type: 'frame' as const },
  ]));
  const model = {
    nodes, elements, loadCases: [],
    sections: new Map([[1, { id: 1, a: 0.5 }]]),
    materials: new Map([[1, { id: 1, rho: 4 }]]),
    supports: new Map([[1, { nodeId: 1 }], [2, { nodeId: 2 }]]),
  };
  return model;
}

function seismicPlan(model: LoadModelData) {
  const options = input(model, {
    dead: [], tributaryWidth: 0, generateCombinations: true,
    seismic: { enabled: true, coefficient: 1, liveParticipation: 0, directions: { x: true, y: false } },
  });
  options.regulations.seismic = { ...bindRole('seismic', 'inpres103-2018'), configComplete: true, state: 'applied' };
  const plan = buildLoadPlan(options);
  const sink: SeismicPlanSink = {
    cases: [], nodal: [], distributed: [], surface: [], derivation: [], refs: [],
    assumptions: [], unsupportedKeys: [], blockedKeys: [], levelRefusals: [],
  };
  INPRES103_SEISMIC.plan(options, plan.seismicModel!, sink);
  return { plan, sink };
}

function expectAmbiguousStory(model: LoadModelData) {
  const { plan, sink } = seismicPlan(model);
  const reason = [{ key: 'loadPlan.blocked.seismicAmbiguousStory' }];
  expect(plan).toMatchObject({
    outcome: 'BLOCKED', blockedKeys: reason, cases: [], nodal: [], distributed: [], surface: [], combinations: [],
  });
  expect(sink).toMatchObject({ blockedKeys: reason, cases: [], nodal: [], distributed: [], surface: [] });
  expect(plan.factors.baseShear).toBeUndefined();
}

it('#2330 a kinked crossing without independent story evidence still refuses', () => {
  const model = bracedFrame();
  model.nodes.get(5)!.x += 0.001;
  expectAmbiguousStory(model);
});

it('#2330 a brace joint needs floor evidence', () => {
  const model = bracedFrame();
  model.nodes.delete(2);
  model.nodes.set(5, { id: 5, x: 0, y: 0, z: 2 });
  model.elements.clear();
  for (const [k, [nodeI, nodeJ]] of [[1, 5], [5, 3], [3, 4], [5, 4]].entries()) {
    model.elements.set(k + 1, { id: k + 1, nodeI: nodeI!, nodeJ: nodeJ!, sectionId: 1, materialId: 1, type: 'frame' });
  }
  model.supports = new Map([[1, { nodeId: 1 }]]);
  expectAmbiguousStory(model);

  for (const [plane, elevation] of [['YZ', 2], ['XY', 2.1]] as const) {
    model.nodes.set(6, { id: 6, x: 0, y: 1, z: elevation });
    model.constraints = [{ type: 'diaphragm', masterNode: 5, slaveNodes: [6], plane }];
    expectAmbiguousStory(model);
  }
  model.nodes.set(6, { id: 6, x: 0, y: 1, z: 2 });
  model.constraints = [{ type: 'diaphragm', masterNode: 5, slaveNodes: [6], plane: 'XY' }];
  const { plan } = seismicPlan(model);
  expect(plan.outcome).toBe('READY');
  expect(plan.seismicModel!.levels.map(l => l.elevation)).toEqual([0, 2, 4]);
  const halfBraceWeight = Math.hypot(4, 2);
  const lowerWeight = 4 + halfBraceWeight, upperWeight = 10 + halfBraceWeight;
  expect(plan.factors.baseShear!.value).toBeCloseTo(lowerWeight + upperWeight, 10);
  const brace = plan.distributed.filter(d => d.caseType === 'E' && d.elementId === 4);
  expect(brace).toHaveLength(2);
  for (const [i, load] of brace.entries()) {
    expect(load.a).toBeCloseTo(i * halfBraceWeight / 2, 10);
    expect(load.b).toBeCloseTo((i + 1) * halfBraceWeight / 2, 10);
    expect(load.qX).toBeCloseTo(2 * (lowerWeight + upperWeight) * (i + 1) / (lowerWeight + 2 * upperWeight), 10);
  }
});

it('#2330 a connected X transfers inertia on each upper brace span', () => {
  const leg = Math.hypot(2, 2);
  for (const angle of [0, Math.PI / 7]) for (const shift of [0, 1_000_000]) {
    const model = bracedFrame();
    for (const n of model.nodes.values()) {
      n.y = shift + n.x * Math.sin(angle);
      n.x = shift + n.x * Math.cos(angle);
    }
    const { plan, sink } = seismicPlan(model);
    expect(plan.outcome).toBe('READY');
    expect(plan.seismicModel!.levels.map(l => l.elevation)).toEqual([0, 4]);
    expect(plan.factors.baseShear!.value).toBeCloseTo(16 + 4 * leg, 8);
    const braces = plan.distributed.filter(l => l.caseType === 'E' && l.elementId >= 4)
      .sort((a, b) => a.elementId - b.elementId);
    expect(braces.map(l => l.elementId)).toEqual([6, 7]);
    for (const load of braces) {
      expect(load.a).toBe(0);
      expect(load.b).toBeCloseTo(leg, 8);
      expect(load.qX).toBeCloseTo(2, 10);
      expect(load.qXJ).toBeCloseTo(2, 10);
    }
    expect(sink.distributed).toEqual(plan.distributed.filter(l => l.caseType === 'E').map(l => ({ ...l, caseIndex: 0 })));
    expect(sink.nodal).toEqual(plan.nodal.filter(l => l.caseType === 'E').map(l => ({ ...l, caseIndex: 0 })));
    const moment = sink.nodal.reduce((sum, l) => sum + l.fx * model.nodes.get(l.nodeId)!.z!, 0)
      + sink.distributed.reduce((sum, l) => {
        const member = model.elements.get(l.elementId)!;
        const zI = model.nodes.get(member.nodeI)!.z!, zJ = model.nodes.get(member.nodeJ)!.z!;
        return sum + (l.b! - l.a!) * l.qX! * (zI + zJ) / 2;
      }, 0);
    expect(moment).toBeCloseTo(64 + 12 * leg, 7);
  }
});


it.each([false, true])('#2607 a crossed column keeps its story overturning (reversed: %s)', reversed => {
  const model = bracedFrame();
  model.nodes.set(6, { id: 6, x: 2, y: 0, z: 0 });
  model.nodes.set(7, { id: 7, x: 2, y: 0, z: 4 });
  model.supports = new Map([[1, { nodeId: 1 }], [6, { nodeId: 6 }]]);
  model.materials = new Map([[1, { id: 1, rho: 0 }], [2, { id: 2, rho: 4 }]]);
  model.elements = new Map([[1, 5], [5, 4], [6, 5], [5, 7], [7, 4]].map(([a, b], i) => [
    i + 1, {
      id: i + 1, nodeI: (reversed ? b : a)!, nodeJ: (reversed ? a : b)!,
      sectionId: 1, materialId: i === 2 || i === 3 ? 2 : 1, type: 'frame' as const,
    },
  ]));
  model.nodes.delete(2);
  model.nodes.delete(3);

  const { plan, sink } = seismicPlan(model);
  expect(plan.outcome).toBe('READY');
  expect(plan.seismicModel!.levels.map(l => l.elevation)).toEqual([0, 4]);
  const force = 4 * 0.5 * (4 / 2);
  expect(plan.factors.baseShear!.value).toBeCloseTo(force, 10);
  for (const loads of [plan, sink]) {
    const nodal = loads.nodal.filter(l => l.caseType === 'E');
    const distributed = loads.distributed.filter(l => l.caseType === 'E');
    const moment = nodal.reduce((sum, l) => sum + l.fx * model.nodes.get(l.nodeId)!.z!, 0)
      + distributed.reduce((sum, l) => {
        const member = model.elements.get(l.elementId)!;
        const zI = model.nodes.get(member.nodeI)!.z!, zJ = model.nodes.get(member.nodeJ)!.z!;
        return sum + (l.b! - l.a!) * l.qX! * (zI + zJ) / 2;
      }, 0);
    expect.soft(moment).toBeCloseTo(force * 4, 10);
    expect.soft(distributed).toEqual([]);
    expect.soft(nodal).toEqual([expect.objectContaining({ nodeId: 7, fx: force })]);
  }
});
