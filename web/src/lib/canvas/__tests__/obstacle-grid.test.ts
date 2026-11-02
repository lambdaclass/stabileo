import { describe, it, expect } from 'vitest';
import { ObstacleGrid, placeLabels, type LabelBox, type Obstacle } from '../label-layout';

const overlaps = (a: Obstacle, b: Obstacle) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** A small deterministic generator, so the case is the same on every run. */
function lcg(seed: number) { let s = seed; return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); }

describe('the obstacle grid', () => {
  it('finds every obstacle a box overlaps, in the order they were added', () => {
    const rnd = lcg(7);
    const all: Obstacle[] = Array.from({ length: 3000 }, () => ({ x: rnd() * 2000 - 200, y: rnd() * 1500 - 100, width: 1 + rnd() * 120, height: 1 + rnd() * 60 }));
    all.push({ x: Number.NaN, y: 0, width: 10, height: 10 }, { x: -1e6, y: -1e6, width: 2e6, height: 2e6 });
    const grid = new ObstacleGrid(all);
    for (let k = 0; k < 400; k++) {
      const b = { x: rnd() * 2000 - 200, y: rnd() * 1500 - 100, width: 5 + rnd() * 150, height: 5 + rnd() * 40 };
      expect(grid.near(b).filter((o) => overlaps(b, o))).toEqual(all.filter((o) => overlaps(b, o)));
    }
  });

  it('places twenty thousand labels among forty thousand obstacles in seconds', () => {
    const rnd = lcg(11);
    const obstacles: Obstacle[] = Array.from({ length: 40_000 }, () => ({ x: rnd() * 4000, y: rnd() * 3000, width: 24, height: 6 }));
    const labels: LabelBox[] = Array.from({ length: 20_000 }, () => ({ x: rnd() * 4000, y: rnd() * 3000, width: 40, height: 12, dirX: 0, dirY: -1, priority: 1 }));
    const t0 = performance.now();
    const placed = placeLabels(labels, obstacles);
    expect(placed).toHaveLength(labels.length);
    expect(performance.now() - t0).toBeLessThan(10_000);
  });
});
