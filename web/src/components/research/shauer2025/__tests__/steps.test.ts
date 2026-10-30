import { expect, it } from 'vitest';
import { solverStepCount } from '../steps';

it.each([[0.005, 159], [0.01, 79], [0.02, 39], [0.03, 26], [0.06, 13]])(
  'matches solver accumulation for dt=%s', (dt, expected) => {
    expect(solverStepCount(dt, 0.8)).toBe(expected);
  },
);
it.each([0, -1, NaN, Infinity])('rejects invalid dt=%s', (dt) => {
  expect(() => solverStepCount(dt, 0.8)).toThrow(RangeError);
});
