import { expect, it } from 'vitest';
import { planWind } from '../load-plan-wind';
import { levelsWithPlanArea, type PlanSink, type LoadPlanInput } from '../load-plan';
import { columns, remeshWind, variants, windResultants, assertWindResultants } from './wind-integration-fixture';

for (const profile of [true, false]) for (const variant of variants) for (const dir of ['+x', '-x', '+y', '-y'] as const) {
  it(`#2204 full wall and foundation conserve force and moments ${profile} ${variant} ${dir}`, () => {
    const { model, back, direction } = remeshWind(columns(), variant);
    const d = direction(dir);
    const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
    const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
    planWind({ model, tributaryWidth: 1, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: [d], directions: { x: d.endsWith('x'), y: d.endsWith('y') }, bothSenses: false, caseSet: 'case1', ...(profile ? { profile: [[0, 1], [6, 1]] } : {}) } } as LoadPlanInput, levels, sink);
    const loads = sink.nodal.filter(n => n.caseIndex === 0);
    const sign = dir.startsWith('-') ? -1 : 1, across = dir.endsWith('x') ? 6 : 12;
    const exponent = 2 / 9.8, factor = 0.613 * 2.41 * 0.85 * 40 ** 2 / 750 ** exponent;
    const qh = factor * 6 ** exponent;
    const rawForce = 0.85 / 1000 * (0.8 * factor * (5 * 5 ** exponent + (6 ** (exponent + 1) - 5 ** (exponent + 1)) / (exponent + 1)) + 0.5 * qh * 6);
    const rawMoment = 0.85 / 1000 * (0.8 * factor * (25 / 2 * 5 ** exponent + (6 ** (exponent + 2) - 5 ** (exponent + 2)) / (exponent + 2)) + 0.5 * qh * 18);
    const integral = !profile && dir.endsWith('y') ? rawForce : (profile ? 1 : 0.75) * 6;
    const first = !profile && dir.endsWith('y') ? rawMoment : (profile ? 1 : 0.75) * 18;
    const F = sign * across * integral, M = sign * across * first;
    const fx = dir.endsWith('x') ? F : 0, fy = dir.endsWith('y') ? F : 0;
    assertWindResultants(windResultants(model, sink.distributed.filter(n => n.caseIndex === 0), loads, back), [fx, fy, 0, dir.endsWith('y') ? -M : 0, dir.endsWith('x') ? M : 0, 6 * fy - 3 * fx]);
    expect(loads).toEqual([]);
    expect(sink.distributed.some(d => d.caseIndex === 0 && d.a === 0)).toBe(true);
  });
}

for (const variant of variants) for (const region of [false, true]) it(`#2204 W and Wa retain a piecewise profile and its first moment ${variant} region=${region}`, () => {
  const m = remeshWind(columns([0, 20]), variant);
  const levels = levelsWithPlanArea(m.model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const direction = m.direction('+x');
  const selected = [...m.model.nodes.values()].filter(n => m.back(n.x, n.y)[0] === 12).map(n => n.id);
  planWind({ model: m.model, tributaryWidth: 1, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: [direction], directions: { x: direction.endsWith('x'), y: direction.endsWith('y') }, bothSenses: false, caseSet: 'case1', profile: [[0, 0.5], [3, 0.5], [8, 2], [20, 2]], service: { enabled: true, v50: 20, mri: 50 }, ...(region ? { region: selected } : {}) } } as LoadPlanInput, levels, sink);
  for (const [caseIndex, c] of sink.cases.entries()) {
    const scale = c.type === 'Wa' ? 0.25 : 1;
    const r = windResultants(m.model, sink.distributed.filter(n => n.caseIndex === caseIndex), sink.nodal.filter(n => n.caseIndex === caseIndex), m.back);
    assertWindResultants(r, [190.5 * scale, 0, 0, 0, 2254.5 * scale, -571.5 * scale]);
  }
  expect(sink.cases.map(c => c.type)).toEqual(['W', 'Wa']);
});

it('unresolved physical height carriers block the complete wind step with a reason', () => {
  const model = columns();
  model.elements.clear();
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  planWind({ model, tributaryWidth: 1, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, directions: { x: true, y: false } } } as LoadPlanInput, levels, sink);
  expect(sink.blockedKeys.map(m => m.key)).toEqual(['wind.pressure.noHeightCarriers']);
  expect(sink.cases).toEqual([]); expect(sink.nodal).toEqual([]); expect(sink.distributed).toEqual([]);
});

it('#2204 inserting a node on only one column cannot alter effective wind dimensions or gust refusals', () => {
  const generate = (split: boolean) => {
    const model = columns([0, 24], 12, 6.5);
    if (split) {
      const e = model.elements.get(1)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      const id = model.nodes.size + 1;
      model.nodes.set(id, { id, x: a.x, y: a.y, z: 9 });
      model.elements.set(1, { ...e, nodeJ: id });
      model.elements.set(model.elements.size + 1, { ...e, id: model.elements.size + 1, nodeI: id, nodeJ: b.id });
    }
    const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
    const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
    const result = planWind({ model, tributaryWidth: 1, wind: { enabled: true, basicSpeed: 20, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: false, dynamics: { n1Source: 'approximate', system: 'concreteMomentFrame', beta: 0.02, rigidG: 'default' }, directions: { x: true, y: true }, bothSenses: false, caseSet: 'case1' } } as LoadPlanInput, levels, sink);
    return { model, sink, result };
  };
  const a = generate(false), b = generate(true);
  expect(a.sink.cases.length).toBeGreaterThan(0);
  expect(b.sink.cases).toEqual(a.sink.cases);
  expect(b.sink.unsupportedKeys).toEqual(a.sink.unsupportedKeys);
  expect(b.result.windGust).toEqual(a.result.windGust);
  for (const k of a.sink.cases.keys()) assertWindResultants(windResultants(b.model, b.sink.distributed.filter(n => n.caseIndex === k), b.sink.nodal.filter(n => n.caseIndex === k)), windResultants(a.model, a.sink.distributed.filter(n => n.caseIndex === k), a.sink.nodal.filter(n => n.caseIndex === k)));
});

it('#2204 the building minimum is horizontal and separate from roof pressure cases', () => {
  const model = columns();
  const top = [...model.nodes.values()].filter(n => n.z === 6);
  for (const y of [0, 6]) {
    const a = top.find(n => n.x === 0 && n.y === y)!, b = top.find(n => n.x === 12 && n.y === y)!;
    const id = model.elements.size + 1; model.elements.set(id, { id, nodeI: a.id, nodeJ: b.id, sectionId: 1, materialId: 1 });
  }
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  planWind({ model, tributaryWidth: 1, wind: { enabled: true, basicSpeed: 1, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, directions: { x: true, y: false }, bothSenses: false, caseSet: 'case1' } } as LoadPlanInput, levels, sink);
  const minimum = sink.cases.findIndex(c => c.nameKey === 'autoLoad.windMinimumCase');
  expect(minimum).toBeGreaterThanOrEqual(0);
  expect(sink.distributed.filter(d => d.caseIndex === minimum).every(d => d.q === 0)).toBe(true);
  assertWindResultants(windResultants(model, sink.distributed.filter(n => n.caseIndex === minimum), sink.nodal.filter(n => n.caseIndex === minimum)), [27, 0, 0, 0, 81, -81]);
  const code = sink.cases.findIndex(c => c.nameKey.startsWith('autoLoad.windCase1'));
  expect(sink.distributed.filter(d => d.caseIndex === code).length).toBeGreaterThan(0);
  expect(windResultants(model, sink.distributed.filter(n => n.caseIndex === code), sink.nodal.filter(n => n.caseIndex === code))[0]).toBeLessThan(27);
});

for (const length of [6 - 1e-5, 6, 6 + 1e-5]) it(`#2204 physical effective dimensions preserve both sides of the approximate-frequency limit ${length}`, () => {
  const model = columns([0, 24], 12, length);
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  planWind({ model, tributaryWidth: 1, wind: { enabled: true, basicSpeed: 20, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: false, dynamics: { n1Source: 'approximate', system: 'concreteMomentFrame', beta: 0.02, rigidG: 'default' }, directions: { x: true, y: false }, bothSenses: false, caseSet: 'case1' } } as LoadPlanInput, levels, sink);
  if (length > 6) expect(sink.cases.length).toBeGreaterThan(0);
  else { expect(sink.cases).toEqual([]); expect(sink.unsupportedKeys.length).toBeGreaterThan(0); }
});
