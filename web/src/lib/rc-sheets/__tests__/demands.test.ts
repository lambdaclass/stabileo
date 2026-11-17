import { describe, it, expect } from 'vitest';
import { wideBeamShear } from '../demands';

describe('a slab on posts in one-way shear', () => {
  it('averages the shear across a cut by the width each element covers, not by how many there are', () => {
    const boxes = new Map([
      ['q1', { x0: 2, x1: 2.2, y0: 0, y1: 0.1 }],
      ['q2', { x0: 2, x1: 2.2, y0: 0.1, y1: 1 }],
    ]);
    const rows = [{ key: 'q1', q: [100, 0] }, { key: 'q2', q: [10, 0] }];
    const r = wideBeamShear(rows, boxes, [{ p: { id: 1, x: 10, y: 10 }, r: 0.5 }])!;
    expect(r.qx).toBeCloseTo((100 * 0.1 + 10 * 0.9) / 1, 9);
  });
});
