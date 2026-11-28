import { describe, it, expect } from 'vitest';
import { anchorsOf } from '../edges';

describe('columns at a property line', () => {
  it('are held by the face that meets the line, a wider column with its centre further in too', () => {
    const a = anchorsOf([
      { id: 1, x: 0.15, y: 0, hx: 0.15, hy: 0.15 },
      { id: 2, x: 0.25, y: 5, hx: 0.25, hy: 0.25 },
      { id: 3, x: 6, y: 2.5, hx: 0.2, hy: 0.2 },
    ], { minX: true });
    expect(a.get(1)).toEqual([-1, 0]);
    expect(a.get(2)).toEqual([-1, 0]);
    expect(a.get(3)).toEqual([0, 0]);
  });

  it('read the line at the points themselves where they carry no width', () => {
    const a = anchorsOf([{ id: 1, x: 0, y: 0 }, { id: 2, x: 0.1, y: 4 }, { id: 3, x: 5, y: 0 }], { minX: true, maxX: true });
    expect(a.get(1)).toEqual([-1, 0]);
    expect(a.get(2)).toEqual([0, 0]);
    expect(a.get(3)).toEqual([1, 0]);
  });
});
