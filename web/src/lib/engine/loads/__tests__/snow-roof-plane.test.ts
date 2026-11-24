import { transverseSnowLoads } from './snow-roof-plane-fixture';
import { expect, it } from 'vitest';
import { snowLoadCases, surfaceSlopes } from '../snow-loads';
import { buildLoadPlan } from '../load-plan';
import { snow, run, pressure, skewRoof, regulations } from './snow-roof-plane-fixture';
import { stepRoof } from './snow-step-fixture';

it('refuses low-step drift on the pitched receiving roof #2082 #2218', () => {
  const out = run();
  expect(out).toMatchObject({ result: { refused: 'snow.refused.stepDriftTransfer' }, cases: [] });
  expect(out.flatRoof).toBeUndefined();
  const model = stepRoof();
  const plan = buildLoadPlan({ regulations: regulations(), dead: [], occupancyKey: 'vivienda', reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true, model, gravity: { mode: 'panels' }, tributaryWidth: 1, snow: { ...snow, enabled: true, source: 'site' } });
  expect(plan).toMatchObject({ outcome: 'BLOCKED', blockedKeys: [{ key: 'snow.refused.stepDriftTransfer' }], cases: [], distributed: [] });
});

it('balanced snow is unchanged by pure plan rotation #2093', () => {
  const aligned = run(stepRoof(20, 0, 0.45, 0), 'width');
  const rotated = run(stepRoof(20, 0, 0.45, 0.37), 'width');
  expect(pressure(aligned.cases[0]!.distributed, 500)).toBeCloseTo((70 - 20) / 65, 12);
  expect(pressure(rotated.cases[0]!.distributed, 500)).toBeCloseTo(pressure(aligned.cases[0]!.distributed, 500), 12);
});

it('a skew rafter takes the roof plane pitch #2082', () => {
  const model = skewRoof();
  const out = snowLoadCases({ model, snow: { ...snow, roofKind: 'mono' }, tributaryWidth: 1 })!;
  const pitch = Math.atan(0.5) * 180 / Math.PI;
  expect(surfaceSlopes(model).get(5)).toBeCloseTo(pitch, 9);
  const cos2 = 72 / 81;
  expect(pressure(transverseSnowLoads(model, out.cases[0]!.distributed), 5)).toBeCloseTo(0.7 * (70 - pitch) / 65 * cos2, 9);
});
