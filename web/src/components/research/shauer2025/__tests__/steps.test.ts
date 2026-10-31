import { expect, it } from 'vitest';
import { solverStepCount, finalLoad } from '../steps';

it.each([[0.005, 159], [0.01, 79], [0.02, 39], [0.03, 26], [0.06, 13]])(
  'matches solver accumulation for dt=%s', (dt, expected) => {
    expect(solverStepCount(dt, 0.8)).toBe(expected);
  },
);
it.each([0, -1, NaN, Infinity])('rejects invalid dt=%s', (dt) => {
  expect(() => solverStepCount(dt, 0.8)).toThrow(RangeError);
});

it.each([[0.005, 0.795], [0.01, 0.79], [0.02, 0.78], [0.03, 0.78], [0.06, 0.78]])(
  'reports actual final load for dt=%s', (dt, time) => {
    expect(finalLoad(dt, 0.01).time).toBeCloseTo(time, 14);
    expect(finalLoad(dt, 0.01).displacement).toBeCloseTo(time * 0.01, 14);
  },
);
