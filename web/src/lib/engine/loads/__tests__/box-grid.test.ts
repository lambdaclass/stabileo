import { describe, expect, it } from 'vitest';
import { BoxGrid } from '../box-grid';

describe('spatial candidates retain the exhaustive scan order and matches', () => {
  it('includes every intersecting box, in source order without duplicates', () => {
    const boxes = Array.from({ length: 400 }, (_, i) => ({
      x0: (i % 20) * 0.1 - 0.05, x1: (i % 20) * 0.1 + 0.15,
      y0: Math.floor(i / 20) * 0.1 - 0.05, y1: Math.floor(i / 20) * 0.1 + 0.15,
    }));
    const grid = new BoxGrid(boxes);
    for (let i = 0; i < 200; i++) {
      const x = (i % 17) * 0.13 - 0.2, y = (i % 13) * 0.19 - 0.1;
      const contains = (b: typeof boxes[number]) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
      expect(grid.candidates([x, y]).filter(k => contains(boxes[k]!)))
        .toEqual(boxes.flatMap((b, k) => contains(b) ? [k] : []));
      const region = { x0: x, x1: x + 0.41, y0: y, y1: y + 0.31 };
      const overlaps = (b: typeof region) => b.x0 <= region.x1 && b.x1 >= region.x0 && b.y0 <= region.y1 && b.y1 >= region.y0;
      const candidates = grid.overlapping(region);
      expect(candidates).toEqual([...new Set(candidates)].sort((a, b) => a - b));
      expect(candidates.filter(k => overlaps(boxes[k]!))).toEqual(boxes.flatMap((b, k) => overlaps(b) ? [k] : []));
    }
  });

  it.each([Number.MAX_VALUE, Infinity, NaN])('falls back to the full scan for invalid grid extents %s', value => {
    const grid = new BoxGrid([{ x0: -value, x1: value, y0: -value, y1: value }, { x0: 0, x1: 1, y0: 0, y1: 1 }]);
    expect(grid.candidates([0.5, 0.5])).toEqual([0, 1]);
    expect(grid.overlapping({ x0: 0, x1: 1, y0: 0, y1: 1 })).toEqual([0, 1]);
  });

  it('keeps nonfinite queries on the exhaustive path', () => {
    const grid = new BoxGrid([{ x0: 0, x1: 1, y0: 0, y1: 1 }]);
    for (const value of [Infinity, -Infinity, NaN]) {
      expect(grid.candidates([value, 0])).toEqual([0]);
      expect(grid.overlapping({ x0: value, x1: 1, y0: 0, y1: 1 })).toEqual([0]);
    }
    expect(new BoxGrid([]).candidates([0, 0])).toEqual([]);
  });

  it('clears generation marks before the Uint32 counter wraps', () => {
    const grid = new BoxGrid([{ x0: 0, x1: 1, y0: 0, y1: 1 }]);
    const region = { x0: 0, x1: 1, y0: 0, y1: 1 };
    expect(grid.overlapping(region)).toEqual([0]);
    (grid as unknown as { stamp: number }).stamp = 0xffffffff;
    expect(grid.overlapping(region)).toEqual([0]);
    expect(grid.overlapping(region)).toEqual([0]);
  });
});
