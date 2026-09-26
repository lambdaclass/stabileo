import { describe, it, expect } from 'vitest';
import { repeatOffsets, parseSpacings } from '../affine';

describe('repeat offsets', () => {
  it('equal steps without spacings', () => {
    expect(repeatOffsets([0, 0, 3], 3)).toEqual([[0, 0, 3], [0, 0, 6], [0, 0, 9]]);
  });
  it('unequal bays along the offset direction, cumulative', () => {
    const o = repeatOffsets([2, 0, 0], 99, [6, 7.5, 6]);
    expect(o.map((v) => v[0])).toEqual([6, 13.5, 19.5]);
    expect(o.every((v) => v[1] === 0 && v[2] === 0)).toBe(true);
  });
  it('parses what an engineer types, and refuses what is not a length', () => {
    expect(parseSpacings('6; 7,5; 6')).toEqual([6, 7.5, 6]);
    expect(parseSpacings('6 7.5  6')).toEqual([6, 7.5, 6]);
    expect(parseSpacings('6; -1')).toBeNull();
    expect(parseSpacings('')).toBeNull();
  });
});
