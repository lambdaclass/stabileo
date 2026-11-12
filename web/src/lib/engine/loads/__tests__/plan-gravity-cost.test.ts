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

/**
 * How long this thread takes to do a fixed amount of the planner's kind of arithmetic: two
 * million point-to-segment distances. A budget in units of it holds on a slow runner and under
 * a loaded one, where a budget in milliseconds does not (the same test under the whole suite
 * ran two to four times slower than alone).
 */
export function calibrationMs(): number {
  const segs: Array<[number, number, number, number]> = [];
  for (let k = 0; k < 20; k++) segs.push([k * 0.7, k * 0.3, k * 0.7 + 6 * Math.cos(k), k * 0.3 + 6 * Math.sin(k)]);
  let near = 0;
  const t = performance.now();
  for (let i = 0; i < 100_000; i++) {
    const px = (i % 977) * 0.061, py = (i % 613) * 0.097;
    for (const [ax, ay, bx, by] of segs) {
      const dx = bx - ax, dy = by - ay;
      const L2 = dx * dx + dy * dy;
      const s = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
      const ex = px - (ax + s * dx), ey = py - (ay + s * dy);
      if (ex * ex + ey * ey <= 0.01) near++;
    }
  }
  if (near < 0) throw new Error('unreachable');
  return performance.now() - t;
}

/** The median of `reps` timings of `run`, each paired with a calibration, as a ratio. */
export function costInCalibrations(run: () => void, reps = 3): { ms: number; ratio: number } {
  const pairs: Array<{ ms: number; ratio: number }> = [];
  for (let i = 0; i < reps; i++) {
    const unit = calibrationMs();
    const t = performance.now();
    run();
    const ms = performance.now() - t;
    pairs.push({ ms, ratio: ms / unit });
  }
  pairs.sort((a, b) => a.ratio - b.ratio);
  return pairs[pairs.length >> 1]!;
}

/**
 * The Auto Loads preview runs the gravity layout several times per click. In November 2026 the
 * headroom probe and the coverage lookup scanned every member of the model for every probe point,
 * and this 1730-member building took 190 ms (panels) and 290 ms (width) per layout on an idle
 * laptop, up from 26 ms. In calibrations that regression measures 4,8 and 9,5 (5,4 and 11 under a
 * loaded machine) against 2,0 and 3,5 (1,6 and 3,8) once fixed; each limit is the geometric mean
 * of the two, so a return of the regression fails it and the fixed cost has the same room.
 */
describe('gravityLayout cost', () => {
  const model = building(8, 6, 10);
  expect(model.elements.size).toBe(1730);

  it('lays out a 1730-member building in panels mode within 3,2 calibrations', () => {
    gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
    const { ms, ratio } = costInCalibrations(() => { gravityLayout(model, { mode: 'panels', tributaryWidth: 1 }); });
    expect(ratio, `panels mode took ${ms.toFixed(0)} ms, ${ratio.toFixed(1)} calibrations`).toBeLessThan(3.2);
  });

  it('lays out a 1730-member building in width mode within 6 calibrations', () => {
    gravityLayout(model, { mode: 'width', tributaryWidth: 2 });
    const { ms, ratio } = costInCalibrations(() => { gravityLayout(model, { mode: 'width', tributaryWidth: 2 }); });
    expect(ratio, `width mode took ${ms.toFixed(0)} ms, ${ratio.toFixed(1)} calibrations`).toBeLessThan(6);
  });
});
