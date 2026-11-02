import { describe, it, expect } from 'vitest';
import { undetermined } from '../terms';

describe('which redundants a flexibility system leaves free', () => {
  it('a full-rank system with coefficients far apart in size determines every unknown', () => {
    expect(undetermined([[1, 0], [0, 1e-10]])).toEqual([]);
    expect(undetermined([[1e6, 2e-1], [2e-1, 1e-6]])).toEqual([]);
  });
  it('a dependent pair leaves one free, a zero row leaves its unknown free', () => {
    expect(undetermined([[1, 1], [1, 1]])).toHaveLength(1);
    expect(undetermined([[2, 0], [0, 0]])).toEqual([1]);
  });
});
