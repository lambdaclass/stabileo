import { expect, it } from 'vitest';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases, surfaceSlopes } from '../snow-loads';
import { buildLoadPlan } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { stepRoof } from './snow-step-fixture';

function regulations(): ProjectRegulations {
  const reg = defaultRegulations();
  for (const key of Object.keys(reg) as Array<keyof ProjectRegulations>) if (reg[key].adapterId) reg[key] = { ...reg[key], configComplete: true, state: 'applied' };
  return reg;
}

export const snow = { pg: 1, terrain: 'C' as const, exposure: 'partial' as const, thermal: 'normal' as const, category: 'II' as const, roofKind: 'gable' as const, slippery: true, partial: false };

export function pressure(loads: Array<{ elementId: number; q: number; qJ?: number; a?: number; b?: number }>, id: number, x = 0) {
  return -loads.filter(d => d.elementId === id && (d.a ?? 0) <= x && (d.b === undefined || d.b > x)).reduce((sum, d) => {
    const t = d.b === undefined ? 0 : (x - (d.a ?? 0)) / (d.b - (d.a ?? 0));
    return sum + d.q + ((d.qJ ?? d.q) - d.q) * t;
  }, 0);
}

export function run(model = stepRoof(), mode: 'panels' | 'width' = 'panels') {
  const layout = gravityLayout(model, { mode, tributaryWidth: 1 });
  return snowLoadCases({ model, snow, tributaryWidth: 1, layout })!;
}

export function skewRoof() {
  const model = stepRoof(0);
  model.nodes.clear(); model.elements.clear();
  for (const [id, x, y] of [[1, 0, 0], [2, 6, 0], [3, 6, 6], [4, 0, 6]] as const) model.nodes.set(id, { id, x, y, z: 3 + 0.5 * y });
  for (const [id, nodeI, nodeJ] of [[1, 1, 2], [2, 2, 3], [3, 3, 4], [4, 4, 1], [5, 1, 3]] as const) model.elements.set(id, { id, nodeI, nodeJ, sectionId: 1, materialId: 1 });
  return model;
}

it.fails('keeps the low-step drift on the pitched receiving roof #2082', () => {
  const out = run();
  const gamma = 0.426 + 2.2, ps = (70 - 20) / 65, hc = 0.45 - ps / gamma;
  const width = Math.min(4 * 0.381 ** 2 / hc, 8 * hc);
  expect(out.derivation.map(d => d.key)).toContain('snow.derivation.drift');
  expect(pressure(out.cases[0]!.distributed, 500)).toBeCloseTo(ps + hc * gamma * (1 - 0.1 / width), 6);
  const model = stepRoof();
  const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model, gravity: { mode: 'panels' }, tributaryWidth: 1, snow: { ...snow, enabled: true, source: 'site' } });
  expect(plan.outcome).toBe('READY');
  const index = plan.cases.findIndex(c => c.type === 'S');
  expect(pressure(plan.distributed.filter(d => d.caseIndex === index), 500)).toBeCloseTo(pressure(out.cases[0]!.distributed, 500), 9);
});

it.fails('balanced snow is unchanged by pure plan rotation #2093', () => {
  const aligned = run(stepRoof(20, 0, 0.45, 0), 'width');
  const rotated = run(stepRoof(20, 0, 0.45, 0.37), 'width');
  expect(pressure(aligned.cases[0]!.distributed, 500)).toBeCloseTo((70 - 20) / 65, 12);
  expect(pressure(rotated.cases[0]!.distributed, 500)).toBeCloseTo(pressure(aligned.cases[0]!.distributed, 500), 12);
});

it.fails('a skew rafter takes the roof plane pitch #2082', () => {
  const model = skewRoof();
  const out = snowLoadCases({ model, snow: { ...snow, roofKind: 'mono' }, tributaryWidth: 1 })!;
  const pitch = Math.atan(0.5) * 180 / Math.PI;
  expect(surfaceSlopes(model).get(5)).toBeCloseTo(pitch, 9);
  const cos2 = 72 / 81;
  expect(pressure(out.cases[0]!.distributed, 5)).toBeCloseTo(0.7 * (70 - pitch) / 65 * cos2, 9);
});
