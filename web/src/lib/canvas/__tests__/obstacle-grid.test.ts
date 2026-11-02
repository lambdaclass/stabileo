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

  it('visits each obstacle a box may overlap once, and stops when asked', () => {
    const rnd = lcg(3);
    const all: Obstacle[] = Array.from({ length: 1500 }, () => ({ x: rnd() * 1000, y: rnd() * 800, width: 1 + rnd() * 200, height: 1 + rnd() * 90 }));
    const grid = new ObstacleGrid(all);
    for (let k = 0; k < 200; k++) {
      const b = { x: rnd() * 1000, y: rnd() * 800, width: 10 + rnd() * 120, height: 10 + rnd() * 40 };
      const seen: Obstacle[] = [];
      grid.visit(b, (o) => { seen.push(o); });
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.filter((o) => overlaps(b, o)).length).toBe(all.filter((o) => overlaps(b, o)).length);
      expect(grid.blocked(b)).toBe(all.some((o) => overlaps(b, o)));
      let n = 0;
      grid.visit(b, () => ++n >= 3);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('keeps large obstacles out of every query that does not reach them', () => {
    const rnd = lcg(5);
    // Area loads across slabs at print resolution: thousands of boxes far larger than a cell.
    const large: Obstacle[] = Array.from({ length: 4000 }, () => ({ x: rnd() * 20_000, y: rnd() * 15_000, width: 4000 + rnd() * 3000, height: 4000 + rnd() * 3000 }));
    const all = [...large, ...Array.from({ length: 2000 }, () => ({ x: rnd() * 20_000, y: rnd() * 15_000, width: 20, height: 8 }))];
    const grid = new ObstacleGrid(all);
    let returned = 0;
    for (let k = 0; k < 300; k++) {
      const b = { x: rnd() * 24_000, y: rnd() * 18_000, width: 40, height: 12 };
      const near = grid.near(b);
      returned += near.length;
      expect(near.filter((o) => overlaps(b, o))).toEqual(all.filter((o) => overlaps(b, o)));
    }
    expect(returned / 300).toBeLessThan(all.length / 4);
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
