import { describe, expect, it } from 'vitest';
import {
  buildClosedStirrup, seatedLongitudinalHalfExtents, StirrupClosureCache,
  type StirrupSetInput,
} from '../../../codes/cirsoc201/transverse-cage';
import { straightSegment, type BarPath, type Point3 } from '../../../codes/cirsoc201/bar-geometry';
import { minSurfaceClearance, COLLISION_CHORD_TOLERANCE } from '../collision';

// Enumerate the four existing fabricated closures independently of the selector.
class FixedClosure extends StirrupClosureCache {
  constructor(private readonly choice: number) { super(); }
  override select(): number { return this.choice; }
}

function section(extra: StirrupSetInput['longitudinalBars'] = []): StirrupSetInput {
  const { halfAcross: a, halfUp: u } = seatedLongitudinalHalfExtents(0.3, 0.55, 0.025, 8, 16).corner;
  return {
    elementId: 1, zoneId: 'beam', station: 0, b: 0.3, h: 0.55, cover: 0.025,
    stirrupDiaMm: 8, legs: 2, maxAggregateSizeMm: 19, hookOrientation: 'a',
    origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 },
    across: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 },
    longitudinalBars: [
      ...[-1, 1].flatMap(s => [-1, 1].map(v => ({
        id: `${s}:${v}`, across: s * a, up: v * u, diameterMm: 16,
      }))), ...extra,
    ],
  };
}

function point(input: StirrupSetInput, a: number, u: number, t: number): Point3 {
  return Object.fromEntries(['x', 'y', 'z'].map(k => {
    const key = k as keyof Point3;
    return [key, input.origin[key] + input.across[key] * a + input.up[key] * u + input.axis[key] * t];
  })) as unknown as Point3;
}

function clearance(input: StirrupSetInput, cage: BarPath): number {
  return Math.min(...input.longitudinalBars.map(bar => {
    const run: BarPath = {
      id: bar.id, role: 'longitudinal', diameterMm: bar.diameterMm,
      segments: [straightSegment(point(input, bar.across, bar.up, -1), point(input, bar.across, bar.up, 1))],
      startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
      cuttingLength: 2, ownerElementIds: [1], source: 'generated', locked: false, refs: [],
    };
    return minSurfaceClearance(cage, run).clearance;
  }));
}

describe('closure selection against fabricated geometry', () => {
  it('finds a clear closure whenever exhaustive evaluation of the four corners finds one', () => {
    let feasible = 0;
    // Deterministic section grid; the independent 3D collision measurement sees the
    // complete continuous longitudinal runs, including the points between hook samples.
    for (const diameterMm of [10, 16, 25]) for (const across of [-0.1, -0.075, -0.045, 0, 0.045, 0.075, 0.1]) {
      for (const up of [-0.205, -0.185, -0.165, 0.165, 0.185, 0.205]) {
        const input = section([{ id: 'inner', across, up, diameterMm }]);
        const alternatives = [0, 1, 2, 3].map(choice =>
          clearance(input, buildClosedStirrup({ ...input, closureCache: new FixedClosure(choice) }).path));
        const best = Math.max(...alternatives);
        if (best < -COLLISION_CHORD_TOLERANCE - 1e-10) continue;
        feasible++;
        expect(clearance(input, buildClosedStirrup(input).path), JSON.stringify({ diameterMm, across, up }))
          .toBeGreaterThanOrEqual(-COLLISION_CHORD_TOLERANCE - 1e-10);
      }
    }
    expect(feasible).toBeGreaterThan(60);
  });

  it('keeps the same physical decision after rotation, translation and bar renaming', () => {
    const input = section([{ id: 'inner', across: -0.045, up: -0.185, diameterMm: 16 }]);
    const moved = { ...input, origin: { x: 10, y: -4, z: 3 },
      axis: { x: 0, y: 0, z: 1 }, across: { x: 0, y: -1, z: 0 }, up: { x: 1, y: 0, z: 0 },
      longitudinalBars: input.longitudinalBars.map(b => ({ ...b, id: `renamed:${b.id}` })),
    };
    const a = buildClosedStirrup(input), b = buildClosedStirrup(moved);
    expect(clearance(moved, b.path)).toBeCloseTo(clearance(input, a.path), 10);
    expect(b.cornerContainment.map(c => c.longitudinalBarId))
      .toEqual(a.cornerContainment.map(c => `renamed:${c.longitudinalBarId}`));
    expect(b.path.cuttingLength).toBeCloseTo(a.path.cuttingLength, 10);
  });
});
