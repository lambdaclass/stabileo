import { expect } from 'vitest';
import { defaultRegulations } from '../../../codes/roles';
import { velocityPressure, EXPOSURE_CONSTANTS } from '../../../codes/cirsoc102/wind';
import { towerCf } from '../../../codes/cirsoc102/other-structures';
import { buildLoadPlan, levelsWithPlanArea, type LoadPlanInput, type PlanSink } from '../load-plan';
import { planWind } from '../load-plan-wind';
import { otherStructureWind } from '../wind-other';
import { windHeightField, windHeightLoads } from '../wind-pressure-field';
import { mesh, windProject } from './wind-integration-fixture';

export const apexEntries = ['field', 'other', 'planner', 'load-plan', 'profile', 'profile-load-plan'] as const;
export type ApexEntry = typeof apexEntries[number];
export const apexSource = () => mesh([[[0, 0, 0], [0, 0, 6]], [[0, 0, 6], [0, -1, 10]], [[0, 0, 6], [0, 1, 10]]]);
export const apexPressure = (entry: ApexEntry) => {
  const profile = entry === 'field' || entry.startsWith('profile');
  const exponent = profile ? 1 : 2 / EXPOSURE_CONSTANTS.C.alpha;
  const factor = profile ? 1 : velocityPressure(6, windProject) / 1000 * 0.85 * towerCf(1, 'square', false, false) / 6 ** exponent;
  return { exponent, factor };
};
export function apexIntegral(from: number, to: number, power: number, exponent: number, factor: number) {
  return factor * ((to ** (exponent + power + 2) - from ** (exponent + power + 2)) / (exponent + power + 2) - 6 * (to ** (exponent + power + 1) - from ** (exponent + power + 1)) / (exponent + power + 1)) / 2;
}
export function apexLoads(model: ReturnType<typeof mesh>, axis: 'x' | 'y', entry: ApexEntry) {
  if (entry === 'field') return windHeightLoads(windHeightField({ model, axis, from: 0, to: 10, width: 2, pressure: z => z }), axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0).distributed;
  const structure = { kind: 'latticeTower' as const, section: 'square' as const, round: false, solidity: 1, diagonal: false, width: 2 };
  const direction = axis === 'x' ? '+x' : '+y';
  if (entry === 'other') {
    const result = otherStructureWind({ model, structure, project: windProject, directions: [direction], tributaryWidth: 2 });
    expect(result.notes).toEqual([]);
    const c = result.cases.find(c => c.nameKey === 'wind.other.case');
    expect(c).toBeDefined();
    return c!.distributed.map(p => ({ ...p, q: p.qZ }));
  }
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const input = { model, tributaryWidth: 2, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: [direction], caseSet: 'case1', ...(entry.startsWith('profile') ? { profile: [[0, 0], [10, 10]] } : { structure }) } } as LoadPlanInput;
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  let result = sink;
  if (entry.endsWith('load-plan')) {
    const regulations = defaultRegulations();
    for (const key of Object.keys(regulations) as Array<keyof typeof regulations>) if (regulations[key].adapterId) regulations[key] = { ...regulations[key], configComplete: true, state: 'applied' };
    result = buildLoadPlan({ ...input, regulations, dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false });
  } else planWind(input, levels, sink);
  expect(result.blockedKeys).toEqual([]);
  const index = result.cases.findIndex(c => c.type === 'W' && (entry.startsWith('profile') || c.nameKey === 'wind.other.case'));
  expect(index).toBeGreaterThanOrEqual(0);
  return result.distributed.filter(p => p.caseIndex === index).map(p => ({ ...p, a: p.a!, b: p.b!, qX: p.qX ?? 0, qY: p.qY ?? 0 }));
}
