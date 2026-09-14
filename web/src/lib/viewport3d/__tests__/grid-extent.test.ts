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
 *    follows the view instead: the spacing tracks the zoom, the patch is
 *    centred on what the camera is looking at, and the reader's extent is a
 *    hard limit it is clipped to.
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

describe('the alignment, which is what a zoom must not disturb', () => {
  /*
   * The report: "al hacer zoom out o zoom in cambia completamente la alineación de la
   * grilla, y solo se actualiza una vez que generás un nodo."
   *
   * Both halves were real and both were mine.
   *
   *  · `GridHelper(size, n)` places its lines at `centre + (i − n/2)·spacing`. With n
   *    EVEN they land on the centre and on multiples of the spacing either side; with n
   *    ODD they land half a cell off. The division count is derived from the zoom, so
   *    its parity flipped as you zoomed and the whole floor jumped by half a cell.
   *
   *  · The rebuild was triggered by the camera having moved 8 % of its distance, which
   *    misses a zoom that crosses a spacing threshold by less — so the grid appeared to
   *    refresh only when something else forced a render, such as adding a node.
   */
  it('draws an even number of divisions at every zoom and extent', () => {
    for (const extent of [20, 100, 1000, 10000, 100000]) {
      for (const span of [1, 5, 17, 50, 137, 500, 1500, 5000, 50000]) {
        const l = gridLayout(1, extent, looking(span));
        expect(l.divisions % 2, `extent ${extent} span ${span}`).toBe(0);
      }
    }
  });

  it('puts its lines on multiples of the spacing, whatever the zoom', () => {
    /* The invariant the parity bug broke: a line at x = 40 stays at x = 40 when the
       spacing changes from 10 m to 20 m, instead of moving to x = 45. */
    for (const span of [17, 60, 137, 400, 1500]) {
      const l = gridLayout(1, 100000, looking(span));
      const first = l.cu - l.extent / 2;
      const k = first / l.spacing;
      expect(Math.abs(k - Math.round(k)), `span ${span}`).toBeLessThan(1e-9);
    }
  });

  it('reports the same layout for a camera move that changes nothing', () => {
    /* What makes per-frame checking affordable: orbiting does not move the target and
       does not change the span, so the key is identical and nothing is rebuilt. */
    const a = gridKey(gridLayout(1, 1000, { u: 0, v: 0, span: 100 }));
    const b = gridKey(gridLayout(1, 1000, { u: 0, v: 0, span: 100 }));
    expect(b).toBe(a);
    /* …and a pan of less than one cell does not move the snapped patch either. */
    const l = gridLayout(1, 1000, { u: 0, v: 0, span: 100 });
    expect(gridKey(gridLayout(1, 1000, { u: l.spacing * 0.2, v: 0, span: 100 }))).toBe(a);
  });

  it('reports a different layout as soon as the spacing would change', () => {
    /* And this is the half the 8 % distance threshold missed. */
    let prev = gridKey(gridLayout(1, 100000, looking(10)));
    let changes = 0;
    for (let span = 11; span <= 3000; span = Math.round(span * 1.05)) {
      const k = gridKey(gridLayout(1, 100000, looking(span)));
      if (k !== prev) changes++;
      prev = k;
    }
    // A 5 % zoom step crosses several spacing thresholds between 10 m and 3 km.
    expect(changes).toBeGreaterThan(3);
  });
});

describe('the grid at a large extent', () => {
  it('draws ONE grid, so the floor is not denser in the middle than at the edge', () => {
    /*
     * It used to draw two: a fine grid at the requested spacing over as much
     * as a line budget allowed, and a coarse one carrying the full extent.
     * Near the origin you therefore saw BOTH — a metre grid on top of an
     * eighty-metre one — and past the fine patch only the coarse. The floor
     * was visibly denser at 0,0,0 than a few thousand metres out.
     */
    expect(helpers(build(1, 10000, looking(200))).length).toBe(1);
  });

  it('keeps roughly the same number of lines on screen at any zoom', () => {
    /* Uniform density is the whole point: what changes with the zoom is the
       spacing, not how much of the screen is covered in lines. */
    for (const span of [20, 200, 2000, 20000]) {
      const h = helpers(build(1, 100000, looking(span)))[0];
      const onScreen = span / h.step;
      expect(onScreen, `span ${span}`).toBeGreaterThan(4);
      expect(onScreen, `span ${span}`).toBeLessThan(60);
    }
  });

  it('spaces on a round multiple of what the reader asked for', () => {
    /* 1 m becomes 10 m, never 8.3 m, so a line always lands on a coordinate a
       reader recognises. */
    for (const span of [20, 200, 2000, 20000]) {
      const ratio = helpers(build(1, 100000, looking(span)))[0].step / 1;
      expect([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000])
        .toContain(Math.round(ratio));
    }
  });

  it('never draws wider than the extent that was asked for', () => {
    /* "10 000 × 10 000" has to still mean that, however far out you pull. */
    for (const extent of [20, 100, 1000, 10000]) {
      const h = helpers(build(1, extent, looking(1e6)))[0];
      expect(h.extent, `extent ${extent}`).toBeLessThanOrEqual(extent + 1e-6);
    }
  });

  it('shows the reader\'s own spacing before there is a camera to ask', () => {
    expect(helpers(build(1, 1000))[0].step).toBeCloseTo(1, 9);
  });

  it('never exceeds the line budget, at any extent or zoom', () => {
    for (const extent of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      for (const span of [5, 50, 500, 5000]) {
        for (const h of helpers(build(1, extent, looking(span)))) {
          expect(h.extent / h.step, `extent ${extent} span ${span}`).toBeLessThanOrEqual(241);
        }
      }
    }
  });
});
