/**
 * Drawing a member in 3D follows the pointer at most once a frame, and the
 * ring on the node the next click takes is moved, not rebuilt.
 *
 * Every mouse move ran the node snap (a raycast and a projection of every
 * shown node), built a new geometry for the ring and asked for a frame —
 * several times a frame on a fast mouse.
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

Object.defineProperty(globalThis, 'document', {
  value: {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ strokeStyle: '', lineWidth: 0, beginPath() {}, arc() {}, stroke() {} }),
    }),
  },
  configurable: true,
});

const { createDrawFeedback } = await import('../draw-feedback');
const { createFrameCoalescer } = await import('../frame-coalesce');

describe('the ring on the node a member end will take', () => {
  it('keeps one geometry, and says when it moved', () => {
    const fb = createDrawFeedback();
    const ring = fb.group.children[2] as THREE.Points;
    const geometry = ring.geometry;
    expect(fb.setTarget(new THREE.Vector3(1, 2, 3))).toBe(true);
    expect(ring.geometry).toBe(geometry);
    expect(Array.from(ring.geometry.getAttribute('position').array)).toEqual([1, 2, 3]);
    expect(ring.visible).toBe(true);
    // The same node again: nothing to redraw.
    expect(fb.setTarget(new THREE.Vector3(1, 2, 3))).toBe(false);
    expect(fb.setTarget(new THREE.Vector3(4, 5, 6))).toBe(true);
    expect(ring.geometry).toBe(geometry);
    expect(fb.setTarget(null)).toBe(true);
    expect(ring.visible).toBe(false);
    expect(fb.setTarget(null)).toBe(false);
  });
});

describe('work that follows the pointer', () => {
  it('runs once a frame, on the last position', () => {
    const frames: Array<() => void> = [];
    const run = vi.fn();
    const c = createFrameCoalescer<number>(run, (cb) => { frames.push(cb); return frames.length; });
    c.schedule(1); c.schedule(2); c.schedule(3);
    expect(frames.length).toBe(1);
    expect(run).not.toHaveBeenCalled();
    frames.shift()!();
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenLastCalledWith(3);
    c.schedule(4);
    expect(frames.length).toBe(1);
  });
  it('can be cancelled', () => {
    const frames: Array<() => void> = [];
    const run = vi.fn();
    const cancel = vi.fn();
    const c = createFrameCoalescer<number>(run, (cb) => { frames.push(cb); return 7; }, cancel);
    c.schedule(1);
    c.cancel();
    expect(cancel).toHaveBeenCalledWith(7);
    frames.shift()!();
    expect(run).not.toHaveBeenCalled();
  });
});
