import { expect, it } from 'vitest';
import { levelLoadTorqueSupportedAlong } from '../wind-plan-forces';
import { windHeightField, windHeightLoads } from '../wind-pressure-field';
import { mesh, windResultants, assertWindResultants } from './wind-integration-fixture';

it('#2220 declared-width carriers can cross while concentric pressure stays valid', () => {
  const model = mesh([-1, 1].map(side => [[0, side * 0.02, 6], [0, -side * 0.02, 10]]));
  const field = windHeightField({ model, axis: 'x', from: 6, to: 10, width: 2, pressure: () => 1 });
  const loads = windHeightLoads(field, 1, 0).distributed;
  expect(loads.map(p => p.elementId)).toEqual([1, 2]);
  assertWindResultants(windResultants(model, loads), [8, 0, 0, 0, 64, 0]);
  expect(() => windHeightLoads(field, 1, 0, 1)).toThrow('wind.pressure.distributedTorqueUnsupported');
});

for (const ratio of [0.999, 1, 1.001]) it(`continuous torque certification retains the polar limit ${ratio}`, () => {
  const d = Math.sqrt(1e-9 / 2) * ratio;
  const start = [{ x: 0, y: -d }, { x: 0, y: d }];
  expect(levelLoadTorqueSupportedAlong(start, start)).toBe(ratio >= 1);
  expect(levelLoadTorqueSupportedAlong(start, start.map(p => ({ x: p.x, y: -p.y })))).toBe(false);
});
