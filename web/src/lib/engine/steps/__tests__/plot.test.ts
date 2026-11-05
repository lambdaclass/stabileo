import { describe, it, expect } from 'vitest';
import { plotOf } from '../plot';

describe('a plot series with non-finite samples', () => {
  it('breaks at a pole instead of joining its two sides', () => {
    const p = plotOf('β', 'D', [{ points: [[0.5, 1.3], [0.9, 5.3], [1, Infinity], [1.1, -4.8], [1.5, -0.8]], label: 'D(β)', color: 'accent' }]);
    expect(p.series).toEqual([
      { points: [[0.5, 1.3], [0.9, 5.3]], label: 'D(β)', color: 'accent' },
      { points: [[1.1, -4.8], [1.5, -0.8]], color: 'accent' },
    ]);
  });

  it('drops leading, trailing and repeated invalid samples without empty pieces, and keeps an all-invalid series as one empty one', () => {
    const p = plotOf('x', 'y', [
      { points: [[NaN, 0], [0, 1], [1, NaN], [2, NaN], [3, 2], [4, -Infinity]], dashed: true },
      { points: [[0, NaN]], label: 'none' },
    ]);
    expect(p.series).toEqual([
      { points: [[0, 1]], dashed: true },
      { points: [[3, 2]], dashed: true },
      { points: [], label: 'none' },
    ]);
  });
});
