import { expect, it } from 'vitest';
import { defaultRegulations } from '../../../codes/roles';
import { buildLoadPlan, levelsWithPlanArea, type LoadPlanInput, type PlanSink } from '../load-plan';
import { planWind } from '../load-plan-wind';
import { otherStructureWind } from '../wind-other';
import { windHeightField, windHeightLoads } from '../wind-pressure-field';
import { mesh, windProject, windResultants } from './wind-integration-fixture';

const neck = 1e-7;
const source = () => mesh([-1, 1].flatMap(side => [[[0, side, 0], [0, side * neck, 6]], [[0, side * neck, 6], [0, side, 10]]]));

for (const sign of [-1, 1]) it(`#2220 eccentric transfer cannot skip a narrow neck sign=${sign}`, () => {
  const model = source();
  const field = windHeightField({ model, axis: 'x', from: 0, to: 10, pressure: () => sign });
  const loads = windHeightLoads(field, 1, 0).distributed;
  expect([...new Set(loads.map(p => p.elementId))].sort()).toEqual([1, 2, 3, 4]);
  expect(windResultants(model, loads)[0]).toBeCloseTo(sign * 10 * (1 + neck), 10);
  expect(() => windHeightLoads(field, 1, 0, 1)).toThrow('wind.pressure.distributedTorqueUnsupported');
});

it('#2220 solid sign eccentric cases refuse a narrow neck', () => {
  expect(() => otherStructureWind({ model: source(), structure: { kind: 'solidSign', clearance: 0 }, project: windProject, directions: ['+x'], tributaryWidth: 2 })).toThrow('wind.pressure.distributedTorqueUnsupported');
});

for (const entry of ['profile', 'solidSign'] as const) for (const complete of [false, true]) it(`#2220 planner handles neck pressure and torque ${entry} complete=${complete}`, () => {
  const model = source();
  const input = { model, tributaryWidth: 2, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: ['+x'], caseSet: 'all', ...(entry === 'profile' ? { profile: [[0, 1], [10, 1]] } : { structure: { kind: 'solidSign', clearance: 0 } }) } } as LoadPlanInput;
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  let result = sink;
  if (complete) {
    const regulations = defaultRegulations();
    for (const key of Object.keys(regulations) as Array<keyof typeof regulations>) if (regulations[key].adapterId) regulations[key] = { ...regulations[key], configComplete: true, state: 'applied' };
    result = buildLoadPlan({ ...input, regulations, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false });
  } else planWind(input, levels, sink);
  if (entry === 'profile') {
    expect(result.blockedKeys).toEqual([]);
    expect(result.cases.length).toBeGreaterThan(0);
    const index = result.cases.findIndex(c => c.type === 'W');
    expect(index).toBeGreaterThanOrEqual(0);
    const lines = result.distributed.filter(p => p.caseIndex === index);
    expect(lines.length).toBeGreaterThan(0);
    expect(windResultants(model, lines)[0]).toBeCloseTo(10 * (1 + neck), 10);
    return;
  }
  expect(result.blockedKeys.map(m => m.key)).toContain('wind.pressure.distributedTorqueUnsupported');
  expect(result.cases).toEqual([]);
  expect(result.distributed).toEqual([]);
});
