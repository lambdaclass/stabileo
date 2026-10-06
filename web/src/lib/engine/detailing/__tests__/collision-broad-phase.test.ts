import { describe, expect, it } from 'vitest';
import { buildStraightBarWithHooks, straightSegment, type BarPath, type Point3 } from '../../../codes/cirsoc201/bar-geometry';
import { classifyPair } from '../classify';
import { detectCollisions, DEFAULT_TOLERANCES, type DetectCollisionsOptions } from '../collision';

function bar(id: string, start: Point3, end: Point3, diameterMm = 16): BarPath {
  return {
    id, diameterMm, role: 'longitudinal', segments: [straightSegment(start, end)],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z),
    ownerElementIds: [1], source: 'generated', locked: false, refs: [],
  };
}

function check(bars: BarPath[], opts: DetectCollisionsOptions = {}) {
  // This reference bypasses the spatial hash as well as segment-box pruning.
  const reference = detectCollisions(bars, { ...opts, broadPhase: false, prune: false });
  const actual = detectCollisions(bars, opts);
  expect(actual.conflicts).toEqual(reference.conflicts);
  expect(actual.constructible).toBe(reference.constructible);
  expect(reference.barPairsTested).toBe(bars.length * Math.max(0, bars.length - 1) / 2);
}

describe('spatial broad phase versus all bar pairs', () => {
  it('agrees for seeded dense, sparse, rotated and translated 3D bars', () => {
    let seed = 93481;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let run = 0; run < 100; run++) {
      const origin = { x: random() * 100 - 50, y: random() * 100 - 50, z: random() * 100 - 50 };
      const scale = run % 2 ? 0.15 : 10;
      const bars: BarPath[] = [];
      for (let i = 0; i < 20; i++) {
        const start = { x: origin.x + random() * scale, y: origin.y + random() * scale, z: origin.z + random() * scale };
        const end = { x: start.x + random() * 6 - 3, y: start.y + random() * 6 - 3, z: start.z + random() * 6 - 3 };
        bars.push(bar(String(i), start, end, [8, 16, 25, 32][i % 4]));
      }
      check(bars, run % 3 ? {} : {
        tolerances: { ...DEFAULT_TOLERANCES, placement: 0.02 },
        classifyFor: (a, b, distance, ta, tb) => classifyPair(a, b, {
          edition: '2025', maxAggregateSizeMm: 50, memberKindOf: () => 'column',
        }, distance, ta, tb),
      });
    }
  });

  it('finds close parallel and crossing bars around cell boundaries', () => {
    for (const shift of [-1000, -0.308, -1e-10, 0, 0.308, 1000]) {
      for (const gap of [0, 0.015, 0.040999999, 0.041, 0.065]) {
        check([
          bar('long', { x: shift, y: shift, z: shift }, { x: shift + 12, y: shift, z: shift }),
          bar('short', { x: shift + 5.117, y: shift + gap, z: shift }, { x: shift + 5.118, y: shift + gap, z: shift }),
          bar('cross', { x: shift + 5.119, y: shift - 1, z: shift }, { x: shift + 5.119, y: shift + 1, z: shift }),
        ], { placementFor: () => 0.05 });
      }
    }
  });

  it('preserves hooked geometry, degenerate segments and empty paths', () => {
    const bars = [0, 0.02, 0.04].map((y, i) => buildStraightBarWithHooks({
      id: `hook-${i}`, diameterMm: 16, role: 'longitudinal',
      start: { x: 0, y, z: 0 }, end: { x: 3, y, z: 0 },
      axis: { x: 1, y: 0, z: 0 }, hookNormal: { x: 0, y: 0, z: 1 },
      startHook: 135, endHook: 90, ownerElementIds: [1], edition: '2025',
    }));
    bars.push(bar('point', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }));
    bars.push({ ...bars[0], id: 'empty', segments: [] });
    check(bars);
    check([]);
    check([bars[0]]);
  });
});
