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
 *    a line budget over ten kilometres is a line every 25 m, so at a working
 *    zoom the camera sits inside a single cell and there is nothing to see.
 *
 *  · And the first fix for that — a fine grid near the origin plus a coarse
 *    one over the whole extent — made the floor visibly DENSER at 0,0,0 than
 *    a few thousand metres out, because near the middle you saw both. One
 *    spacing everywhere is the only thing that reads as even, so the grid
 *    follows the view instead: the patch is centred on what the camera is
 *    looking at, and the reader's extent is a hard limit it is clipped to.
 *
 *  · And "al hacer zoom cambia completamente la dimensión entre las líneas":
 *    the spacing used to track the zoom (1, 2, 5, 10 … times the reader's)
 *    while the pointer kept snapping to the reader's, so the lines stopped
 *    saying where a node lands. The pitches are now the reader's spacing and
 *    ten times it, fixed; the zoom only fades the fine lines out when they
 *    crowd.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { gridKey, gridLayout, updateGrid } from '../grid';

function build(size: number, extent: number, view?: { u: number; v: number; span: number }): THREE.Object3D {
  const scene = new THREE.Scene();
  const g = updateGrid(scene, null, true, size, extent, 'XY', 0, view);
  if (!g) throw new Error('no grid');
  return g;
}

/** Looking at the origin, with `span` metres of world across the screen. */
const looking = (span: number) => ({ u: 0, v: 0, span });

/** Every GridHelper in the returned object, finest first, with the extent and step it draws. */
function helpers(o: THREE.Object3D): Array<{ extent: number; step: number; helper: THREE.GridHelper }> {
  const out: Array<{ extent: number; step: number; helper: THREE.GridHelper }> = [];
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
    out.push({ extent: max - min, step, helper: c });
  });
  return out.sort((a, b) => a.step - b.step);
}

/** The spans of a working zoom on a 1 m grid: from a connection to a whole building. */
const WORKING = [3, 8, 17, 30, 60, 100];

describe('the lines are where a node snaps', () => {
  it('draws the reader\'s spacing at every working zoom, not a pitch picked by the zoom', () => {
    for (const s of [0.25, 0.5, 1, 2.5]) {
      for (const span of WORKING.map((w) => w * s)) {
        const l = gridLayout(s, 1000, looking(span));
        expect(l.spacing, `s ${s} span ${span}`).toBeCloseTo(s, 12);
        expect(l.major, `s ${s} span ${span}`).toBeCloseTo(10 * s, 12);
      }
    }
  });

  it('only ever draws the reader\'s spacing times a power of ten, with the next power emphasised', () => {
    for (let span = 1; span <= 50000; span = span * 1.07) {
      const l = gridLayout(1, 100000, looking(span));
      const k = Math.log10(l.spacing);
      expect(Math.abs(k - Math.round(k)), `span ${span}`).toBeLessThan(1e-9);
      expect(l.major).toBeCloseTo(10 * l.spacing, 9);
    }
  });

  it('does not move a line that stays drawn: every level lands on its own multiples', () => {
    for (const span of [3, 17, 60, 137, 400, 1500, 9000]) {
      for (const u of [0, 3.3, -47.9, 812.4]) {
        const l = gridLayout(1, 100000, { u, v: -u / 2, span });
        for (const pitch of [l.spacing, l.major]) {
          const first = l.cu - l.extent / 2;
          const k = first / pitch;
          expect(Math.abs(k - Math.round(k)), `span ${span} u ${u} pitch ${pitch}`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('fades the fine lines as they crowd, and drops them only when they would be a few pixels apart', () => {
    expect(gridLayout(1, 1000, looking(30)).fade).toBe(1);
    const crowded = gridLayout(1, 1000, looking(100));
    expect(crowded.spacing).toBe(1);
    expect(crowded.fade).toBeLessThan(1);
    expect(crowded.fade).toBeGreaterThanOrEqual(0.2);
    /* Past that the metre lines go and the ten-metre lines, drawn all along, are the fine ones. */
    const far = gridLayout(1, 1000, looking(200));
    expect(far.spacing).toBe(10);
    expect(far.major).toBe(100);
  });

  it('draws both levels in one colour each, with no centre line: the patch centre is not the origin', () => {
    const [fine, major] = helpers(build(1, 1000, { u: 37, v: 12, span: 30 }));
    for (const h of [fine, major]) {
      const col = h.helper.geometry.getAttribute('color');
      const first = [col.getX(0), col.getY(0), col.getZ(0)].join();
      for (let i = 1; i < col.count; i++) expect([col.getX(i), col.getY(i), col.getZ(i)].join()).toBe(first);
    }
    expect(fine.step).toBeCloseTo(1, 9);
    expect(major.step).toBeCloseTo(10, 9);
  });
});

describe('the layout the viewport checks every frame', () => {
  it('draws an even number of divisions at every zoom and extent', () => {
    /* GridHelper(size, n) puts its lines at centre + (i − n/2)·spacing: with n odd they would
       sit half a cell off the coordinates. */
    for (const extent of [20, 100, 1000, 10000, 100000]) {
      for (const span of [1, 5, 17, 50, 137, 500, 1500, 5000, 50000]) {
        const l = gridLayout(1, extent, looking(span));
        expect(l.divisions % 2, `extent ${extent} span ${span}`).toBe(0);
      }
    }
  });

  it('reports the same layout for a camera move that changes nothing', () => {
    const a = gridKey(gridLayout(1, 1000, { u: 0, v: 0, span: 30 }));
    expect(gridKey(gridLayout(1, 1000, { u: 0, v: 0, span: 30 }))).toBe(a);
    /* …and a pan of less than half the coarsest pitch does not move the snapped patch either. */
    const l = gridLayout(1, 1000, { u: 0, v: 0, span: 30 });
    expect(gridKey(gridLayout(1, 1000, { u: l.major * 0.2, v: 0, span: 30 }))).toBe(a);
  });

  it('reports a different layout when the fine lines fade or change level', () => {
    const keys = new Set<string>();
    for (let span = 20; span <= 3000; span = Math.round(span * 1.05)) keys.add(gridKey(gridLayout(1, 100000, looking(span))));
    expect(keys.size).toBeGreaterThan(3);
  });
});

describe('the grid at a large extent', () => {
  it('is as dense at the edge of the site as in the middle', () => {
    /* One patch that follows the view, never a fine patch near the origin over a coarse floor. */
    const near = gridLayout(1, 10000, { u: 0, v: 0, span: 60 });
    const far = gridLayout(1, 10000, { u: 4000, v: -3500, span: 60 });
    expect(far.spacing).toBe(near.spacing);
    expect(far.divisions).toBe(near.divisions);
  });

  it('never draws wider than the extent that was asked for', () => {
    /* "10 000 × 10 000" has to still mean that, however far out you pull. */
    for (const extent of [20, 100, 1000, 10000]) {
      for (const h of helpers(build(1, extent, looking(1e6)))) {
        expect(h.extent, `extent ${extent}`).toBeLessThanOrEqual(extent + 1e-6);
      }
    }
  });

  it('stays inside the extent when the camera looks past its edge', () => {
    const l = gridLayout(1, 1000, { u: 5000, v: 0, span: 60 });
    expect(l.cu + l.extent / 2).toBeLessThanOrEqual(500 + 1e-9);
  });

  it('shows the reader\'s own spacing before there is a camera to ask', () => {
    expect(helpers(build(1, 1000))[0].step).toBeCloseTo(1, 9);
  });

  it('keeps the line count bounded at any extent or zoom', () => {
    for (const extent of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      for (const span of [0.5, 5, 50, 500, 5000, 50000]) {
        for (const h of helpers(build(1, extent, looking(span)))) {
          expect(h.extent / h.step, `extent ${extent} span ${span}`).toBeLessThanOrEqual(330);
        }
      }
    }
  });
});
