/*
 * A grid you can still read when you zoom out.
 *
 * Two reports, one cause each:
 *
 *  · At 1000 m the floor "disappears in chunks" while orbiting. The camera's
 *    far plane was a literal 1000 from when the grid was 50 m across, and a
 *    1000 m grid reaches 500 m in every direction — its far corners were
 *    being clipped. That half lives in `Viewport3D`'s `syncCameraRange`.
 *
 *  · At 10000 m "it does not even show". That one was not a rendering fault:
 *    a line budget of 400 divisions over ten kilometres is a line every 25 m,
 *    so at a working zoom the camera sits inside a single cell and there is
 *    nothing on screen to see. One spacing cannot serve both distances, which
 *    is what this file pins.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { updateGrid } from '../grid';

function build(size: number, extent: number): THREE.Object3D {
  const scene = new THREE.Scene();
  const g = updateGrid(scene, null, true, size, extent, 'xy', 0);
  if (!g) throw new Error('no grid');
  return g;
}

/** Every GridHelper in the returned object, with the extent and step it draws. */
function helpers(o: THREE.Object3D): Array<{ extent: number; step: number }> {
  const out: Array<{ extent: number; step: number }> = [];
  o.traverse((c) => {
    if (!(c instanceof THREE.GridHelper)) return;
    const pos = c.geometry.getAttribute('position');
    let min = Infinity, max = -Infinity;
    const xs = new Set<number>();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      min = Math.min(min, x); max = Math.max(max, x);
      xs.add(Math.round(x * 1e6) / 1e6);
    }
    const sorted = [...xs].sort((a, b) => a - b);
    let step = Infinity;
    for (let i = 1; i < sorted.length; i++) step = Math.min(step, sorted[i] - sorted[i - 1]);
    out.push({ extent: max - min, step });
  });
  return out;
}

describe('the grid at a large extent', () => {
  it('keeps the requested spacing near the origin, whatever the extent', () => {
    for (const extent of [1000, 10000]) {
      const hs = helpers(build(1, extent));
      const fine = hs.find((h) => Math.abs(h.step - 1) < 1e-6);
      expect(fine, `a 1 m grid exists at extent ${extent}`).toBeTruthy();
    }
  });

  it('also carries a coarse grid over the WHOLE extent, so a zoomed-out view has lines', () => {
    const hs = helpers(build(1, 10000));
    expect(hs.length, 'two grids, not one').toBe(2);
    const widest = Math.max(...hs.map((h) => h.extent));
    expect(widest, 'the coarse one spans the extent that was asked for').toBeCloseTo(10000, 0);
    const coarse = hs.find((h) => h.extent > 9000)!;
    expect(coarse.step, 'and its lines are far enough apart to be affordable').toBeGreaterThan(10);
  });

  it('draws ONE grid when the extent needs no backdrop', () => {
    /* 100 m at 1 m is 100 divisions — inside the budget, so a second grid
       would be the same lines drawn twice. */
    expect(helpers(build(1, 100)).length).toBe(1);
  });

  it('never exceeds the line budget, at any extent it offers', () => {
    for (const extent of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      for (const h of helpers(build(1, extent))) {
        expect(h.extent / h.step, `extent ${extent}`).toBeLessThanOrEqual(400 + 1);
      }
    }
  });

  it('spaces the coarse grid on a round multiple, so lines land on readable coordinates', () => {
    const coarse = helpers(build(1, 10000)).find((h) => h.extent > 9000)!;
    const ratio = coarse.step / 1;
    expect([2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]).toContain(Math.round(ratio));
  });
});
