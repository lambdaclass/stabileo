import { describe, expect, it, vi } from 'vitest';
import { CollisionGeometry } from '../../../wasm/dedaliano_engine.js';
import { prepareCollisionKernel, registerCollisionKernel } from '../collision-kernel';
import { detectCollisions, type DetectCollisionsOptions } from '../collision';
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
});
