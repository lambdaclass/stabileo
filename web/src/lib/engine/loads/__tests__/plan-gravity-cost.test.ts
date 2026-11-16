import { describe, it, expect } from 'vitest';
import { gravityLayout, type GravityModel } from '../plan-gravity';

/**
 * A regular frame building: `nx` × `ny` bays of `bay` m, `storeys` storeys of `h` m, beams along
 * both axes at every level above the ground and a column under every node.
 */
export function building(nx: number, ny: number, storeys: number, bay = 6, h = 3): GravityModel {
  const nodes = new Map<number, { id: number; x: number; y: number; z: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; type?: 'frame' | 'truss' }>();
  const idAt = new Map<string, number>();
  let n = 1, e = 1;
  const node = (x: number, y: number, z: number) => {
    const key = `${x},${y},${z}`;
    const got = idAt.get(key);
    if (got) return got;
    nodes.set(n, { id: n, x, y, z });
    idAt.set(key, n);
    return n++;
  };
  const bar = (a: number, b: number) => { elements.set(e, { id: e++, nodeI: a, nodeJ: b, type: 'frame' }); };
  for (let s = 0; s <= storeys; s++) {
    const z = s * h;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      const p = node(i * bay, j * bay, z);
      if (s === 0) continue;
      bar(node(i * bay, j * bay, z - h), p);
      if (i < nx) bar(p, node((i + 1) * bay, j * bay, z));
      if (j < ny) bar(p, node(i * bay, (j + 1) * bay, z));
    }
  }
  return { nodes, elements };
}

/** The median of `reps` timings of `run`, in milliseconds, after `warm` runs. */
export function medianMs(run: () => void, reps: number, warm = 2): number {
  for (let i = 0; i < warm; i++) run();
  const times: number[] = [];
  for (let i = 0; i < reps; i++) {
    const t = performance.now();
    run();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[times.length >> 1]!;
}

/**
 * The Auto Loads preview runs the gravity layout several times per click. In November 2026 the
 * headroom probe and the coverage lookup read every roof member for every probe point of every
 * panel or strip, so the layout grew with members × panels: a 4860-member building took 0,78 s
 * (panels) and 1,5 s (width) on an idle laptop, against 0,22 s at the end of October, and 2,6 and
 * 5,1 s at 9495 members. The cost is measured against the planner's own cost on a 204-member
 * building, so the ratio tracks the runner, not the clock; a budget in milliseconds or in units of
 * plain arithmetic ran two times slower on a CI runner than here. Measured, 4860 against 204
 * members: October 36 (panels) and 61 (width), the regression 111 and 173, this code 43 and 46;
 * each limit lets the regression fail by 1,5 and leaves this code 1,7 and 2,4 times its room.
 */
describe('gravityLayout cost', () => {
  const small = building(4, 3, 4);
  const large = building(12, 10, 12);
  expect(small.elements.size).toBe(204);
  expect(large.elements.size).toBe(4860);
  const ratio = (mode: 'panels' | 'width', tributaryWidth: number) => {
    const opts = { mode, tributaryWidth } as const;
    const unit = medianMs(() => { gravityLayout(small, opts); }, 5);
    const ms = medianMs(() => { gravityLayout(large, opts); }, 3, 1);
    return { unit, ms, ratio: ms / unit };
  };

  it('lays out a 4860-member building in panels mode within 75 times a 204-member one', () => {
    const { unit, ms, ratio: r } = ratio('panels', 1);
    expect(r, `panels mode: ${ms.toFixed(0)} ms against ${unit.toFixed(1)} ms, ${r.toFixed(0)} times`).toBeLessThan(75);
  }, 60_000);

  it('lays out a 4860-member building in width mode within 110 times a 204-member one', () => {
    const { unit, ms, ratio: r } = ratio('width', 2);
    expect(r, `width mode: ${ms.toFixed(0)} ms against ${unit.toFixed(1)} ms, ${r.toFixed(0)} times`).toBeLessThan(110);
  }, 60_000);
});
