import { describe, expect, it, vi } from 'vitest';
import { CollisionGeometry } from '../../../wasm/dedaliano_engine.js';
import { prepareCollisionKernel, registerCollisionKernel } from '../collision-kernel';
import { DEFAULT_TOLERANCES, detectCollisions, type DetectCollisionsOptions } from '../collision';
import { buildStraightBarWithHooks, straightSegment, type BarPath } from '../../../codes/cirsoc201/bar-geometry';

function bars(): BarPath[] {
  let seed = 9173;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: 45 }, (_, i) => {
    const y = random() * 0.2 - 0.1, z = random() * 0.2;
    return buildStraightBarWithHooks({
      id: String(i), diameterMm: [8, 16, 25][i % 3], role: 'longitudinal',
      start: { x: -1, y, z }, end: { x: 1, y, z: z + random() * 0.2 },
      axis: { x: 1, y: 0, z: 0 }, hookNormal: { x: 0, y: 0, z: 1 },
      startHook: i % 2 ? 90 : 135, endHook: 90, ownerElementIds: [i], edition: '2025',
    });
  });
}
function compare(input: BarPath[], options: DetectCollisionsOptions = {}) {
  expect(detectCollisions(input, options)).toEqual(detectCollisions(input, { ...options, kernel: false }));
}
describe('Rust collision kernel', () => {
  it('is registered by production WASM initialization', () => {
    const kernel = prepareCollisionKernel([], new Float64Array());
    expect(kernel).not.toBeNull();
    kernel!.free();
  });
  it('matches all reported fields, diagnostics and closest-point ties', () => {
    const input = bars();
    input.push({ ...input[0], id: 'duplicate' });
    input.push({ ...input[0], id: 'empty', segments: [] });
    input.push({ ...input[0], id: 'point', segments: [straightSegment({x:0,y:0,z:0},{x:0,y:0,z:0})] });
    compare(input);
    compare(input, { deduplicateBuckets: false });
    compare(input, { prune: false, broadPhase: false });
    compare(input, { placementFor: (a, b) => a.diameterMm > b.diameterMm ? 0.05 : 0 });
  });
  it('preserves callback order, surfaces, and closest-segment tangents', () => {
    const input = bars();
    const run = (kernel: boolean) => {
      const calls: unknown[] = [];
      const result = detectCollisions(input, { kernel,
        placementFor: (a, b) => { calls.push(['placement', a.id, b.id]); return calls.length % 2 ? 0.01 : 0; },
        classifyFor: (a, b, s, ta, tb) => { calls.push(['classify', a.id, b.id, s, ta, tb]);
          return { reportable: true, requiredClear: 0.025, pairClass: 'sameLayerSpacing', labelKey: 'test', refs: [] }; },
      });
      return { result, calls };
    };
    expect(run(true)).toEqual(run(false));
  });
  it('uses the TS fallback and frees WASM geometry when callbacks throw', () => {
    const input = bars();
    const expected = detectCollisions(input, { kernel: false });
    registerCollisionKernel(null);
    try { expect(detectCollisions(input)).toEqual(expected); }
    finally { registerCollisionKernel(CollisionGeometry); }
    const freed = vi.spyOn(CollisionGeometry.prototype, 'free');
    try {
      expect(() => detectCollisions(input, { classifyFor: () => { throw new Error('policy failure'); } })).toThrow('policy failure');
      expect(freed).toHaveBeenCalledTimes(1);
    } finally { freed.mockRestore(); }
  });
  it('rejects malformed buffers and indices without trapping', () => {
    expect(() => new CollisionGeometry(new Float64Array(6), new Uint32Array([0, 3, 2]), new Float64Array(2))).toThrow();
    expect(() => new CollisionGeometry(new Float64Array([NaN, 0, 0]), new Uint32Array([0, 1]), new Float64Array(1))).toThrow();
    const geometry = new CollisionGeometry(new Float64Array(3), new Uint32Array([0, 1]), new Float64Array(1));
    try {
      expect(() => geometry.measure(0, new Uint32Array([1]), 0, 0.1, true)).toThrow();
      expect(() => geometry.candidates(0)).toThrow();
      expect(() => geometry.build_hash(0, true)).toThrow();
      geometry.build_hash(0.3, true);
      expect([...geometry.candidates(0)]).toEqual([]);
      expect(() => geometry.candidates(0)).toThrow();
    } finally { geometry.free(); }
  });

  it('measures the valid bars when one is not a number, as the TypeScript path does, instead of throwing', () => {
    // The kernel refuses a buffer with a non-finite value, and nothing above it fell back: one
    // bar of NaN geometry from upstream aborted the whole detailing run.
    const valid = bars().slice(0, 12);
    const nan = { ...valid[0], id: 'nan', segments: [straightSegment({ x: 0, y: 0, z: 0 }, { x: Number.NaN, y: 0, z: 0 })] };
    const fat = { ...valid[1], id: 'fat', diameterMm: Number.NaN };
    for (const odd of [nan, fat]) {
      const input = [...valid, odd];
      const fast = detectCollisions(input);
      expect(fast).toEqual(detectCollisions(input, { kernel: false }));
      expect(fast.conflicts).toEqual(detectCollisions(valid).conflicts);
      expect(fast.unmeasurable).toEqual([odd.id]);
      expect(fast.barCount).toBe(input.length);
    }
  });

  it('ends on a bar at infinity, on both paths', () => {
    // The TypeScript sampler never finished on an infinite segment; the kernel threw.
    const valid = bars().slice(0, 6);
    const far = { ...valid[0], id: 'far', segments: [straightSegment({ x: 0, y: 0, z: 0 }, { x: Number.POSITIVE_INFINITY, y: 0, z: 0 })] };
    for (const kernel of [true, false]) {
      expect(detectCollisions([...valid, far], { kernel }).unmeasurable).toEqual(['far']);
    }
  });

  it('does not measure a pair whose placement is not a number, on either path', () => {
    const input = bars().slice(0, 12);
    const placementFor = (a: BarPath, b: BarPath) => (a.id === '0' || b.id === '0' ? Number.NaN : 0.002);
    expect(() => detectCollisions(input, { placementFor })).not.toThrow();
    compare(input, { placementFor });
  });

  it('gives the closest point a positive zero, as Math.max does', () => {
    // Rust's clamp keeps −0; the reference clamps with Math.max(0, …), which gives +0.
    const a = { ...bars()[0], id: 'a', segments: [straightSegment({ x: -0, y: 0, z: 0 }, { x: -0, y: 1, z: 0 })] };
    const b = { ...bars()[0], id: 'b', segments: [straightSegment({ x: -0, y: 0, z: 1 }, { x: -1, y: 0, z: 2 })] };
    const opts: DetectCollisionsOptions = { tolerances: { ...DEFAULT_TOLERANCES, requiredClear: 2 } };
    const fast = detectCollisions([a, b], opts), ref = detectCollisions([a, b], { ...opts, kernel: false });
    expect(fast.conflicts.length).toBeGreaterThan(0);
    for (let k = 0; k < fast.conflicts.length; k++) {
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(Object.is(fast.conflicts[k]!.at[axis], ref.conflicts[k]!.at[axis])).toBe(true);
      }
    }
  });
});
