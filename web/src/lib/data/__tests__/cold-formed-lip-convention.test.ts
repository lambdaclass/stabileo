/**
 * The calculation and the drawing describe the same channel.
 *
 * ── What this replaces ─────────────────────────────────────────────
 *
 * The app measured a lip two ways. `computeSectionProperties`'s `C-custom` used the flange's
 * MID-LINE (`(h - tf)/2 - c/2`); `createCShape` and `crossSectionPath` both walk from the OUTER
 * face. With the same `c` the calculation counted `2t²` more material than either drawing — 452 mm²
 * against 444 on a `C 100x50x15x2`, about 1.8 %.
 *
 * The outer-face convention is the one the drawings already used and the one a cold-formed
 * designation means: in `C 100x50x15x2` the `15` is the total lip depth measured from outside.
 * Decided in `docs/handoffs/m2-lip-convention-proposal.md`.
 *
 * ── Why the polygon and not a table of expected numbers ────────────
 *
 * A table of four sections would pin the four sections. This integrates the ACTUAL polygon
 * `createCShape` walks — Green's theorem over its vertices — and compares A, Iy and Iz against
 * what `computeSectionProperties` returns for the same parameters. The property under test is
 * "these two describe the same object", and only a comparison against the outline can state it.
 *
 * It is also the assertion that cannot be satisfied by accident: convention A misses it by exactly
 * `2t²` in area, and there is no third convention that matches.
 */

import { describe, it, expect } from 'vitest';
import { computeSectionProperties } from '../section-shapes';
import { createCShape } from '../../three/section-profiles';

/** Area, and second moments about the CENTROID, of a closed polygon. Green's theorem. */
function polygonMoments(pts: Array<{ x: number; y: number }>) {
  let a2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  const area = a2 / 2;
  cx /= 3 * a2;
  cy /= 3 * a2;

  // Second moments about the origin, then shifted to the centroid.
  let ixx = 0, iyy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    ixx += (p.y * p.y + p.y * q.y + q.y * q.y) * cross;
    iyy += (p.x * p.x + p.x * q.x + q.x * q.x) * cross;
  }
  ixx = ixx / 12 - area * cy * cy;
  iyy = iyy / 12 - area * cx * cx;

  return { area: Math.abs(area), ixx: Math.abs(ixx), iyy: Math.abs(iyy) };
}

/** The outline `createCShape` walks, as points. `THREE.Shape` records them for us. */
function drawnOutline(h: number, b: number, tw: number, tf: number, c: number, tl: number) {
  const shape = createCShape(h, b, tw, tf, c, tl);
  return shape.getPoints(1).map((p) => ({ x: p.x, y: p.y }));
}

/**
 * Real cold-formed sizes, in metres — the unit `computeSectionProperties` works in.
 *
 * The four from the proposal's table, so the numbers here can be read against it.
 */
const SECTIONS = [
  { name: 'C 100x50x15x2.0', h: 0.100, b: 0.050, t: 0.0020, c: 0.015 },
  { name: 'C 150x60x20x2.5', h: 0.150, b: 0.060, t: 0.0025, c: 0.020 },
  { name: 'C 200x75x20x3.0', h: 0.200, b: 0.075, t: 0.0030, c: 0.020 },
  { name: 'C 80x40x12x1.5', h: 0.080, b: 0.040, t: 0.0015, c: 0.012 },
] as const;

describe('the lip convention: calculation and drawing agree', () => {
  for (const s of SECTIONS) {
    it(`${s.name} — A, Iy and Iz match the drawn outline`, () => {
      const props = computeSectionProperties('C-custom', {
        h: s.h, b: s.b, tw: s.t, tf: s.t, c: s.c, tl: s.t,
      });
      expect(props, 'the section is valid').not.toBeNull();

      const poly = polygonMoments(drawnOutline(s.h, s.b, s.t, s.t, s.c, s.t));

      /*
       * `createCShape` draws in the (z, y) plane with the web at x = 0, so its `iyy` is the
       * second moment about the VERTICAL axis — the section's Iz — and its `ixx` is Iy.
       *
       * Relative tolerance, not absolute: these span 267 mm² to 1134 mm² and 10⁻⁷ m⁴ to 10⁻⁵ m⁴,
       * and one epsilon cannot be right for both.
       */
      expect(props!.a).toBeCloseTo(poly.area, 12);
      expect(Math.abs(props!.iy / poly.ixx - 1), `${s.name} Iy`).toBeLessThan(1e-9);
      expect(Math.abs(props!.iz / poly.iyy - 1), `${s.name} Iz`).toBeLessThan(1e-9);
    });
  }

  it('and the old mid-line convention would miss the area by exactly 2t²', () => {
    /*
     * The discrepancy, restated as arithmetic so the fix cannot be undone quietly. Convention A
     * added a lip of length `c`; B adds `c - tf`. With `tl = tf = t` the difference is
     * `2 · t · t`, which is the 8 / 12.5 / 18 / 4.5 mm² the proposal measured.
     */
    for (const s of SECTIONS) {
      const props = computeSectionProperties('C-custom', {
        h: s.h, b: s.b, tw: s.t, tf: s.t, c: s.c, tl: s.t,
      })!;
      const oldArea = props.a + 2 * s.t * s.t;
      const poly = polygonMoments(drawnOutline(s.h, s.b, s.t, s.t, s.c, s.t));
      expect(oldArea - poly.area).toBeCloseTo(2 * s.t * s.t, 12);
    }
  });
});

describe('a lip no deeper than the flange is a plain channel, in both halves', () => {
  /**
   * The regime that was worse than a `t/2` shift.
   *
   * `createCShape` renders an UNLIPPED channel when `lip <= tf`, and the calculation used to add
   * `2·c·tl` of lip anyway. So the app computed a section with a lip and drew one without —
   * material that existed in the numbers and not in the outline.
   *
   * Under the outer-face convention the useful lip is `c - tf`, which is ≤ 0 exactly when the
   * drawing refuses to draw one. No new guard; the two halves agree about WHETHER there is a lip,
   * not only about where it is.
   */
  const base = { h: 0.100, b: 0.050, tw: 0.002, tf: 0.002, tl: 0.002 };

  it('c === tf gives the same properties as the plain channel it draws', () => {
    const lipped = computeSectionProperties('C-custom', { ...base, c: base.tf })!;
    const poly = polygonMoments(drawnOutline(base.h, base.b, base.tw, base.tf, base.tf, base.tl));
    expect(lipped.a).toBeCloseTo(poly.area, 12);
    expect(Math.abs(lipped.iy / poly.ixx - 1)).toBeLessThan(1e-9);
    expect(Math.abs(lipped.iz / poly.iyy - 1)).toBeLessThan(1e-9);
  });

  it('c < tf too, rather than being rejected', () => {
    const props = computeSectionProperties('C-custom', { ...base, c: 0.001 });
    expect(props, 'a shallow lip computes rather than refusing').not.toBeNull();
    const poly = polygonMoments(drawnOutline(base.h, base.b, base.tw, base.tf, 0.001, base.tl));
    expect(props!.a).toBeCloseTo(poly.area, 12);
  });

  it('and it equals a U of the same plate', () => {
    // The strongest statement of the same fact: no lip means it IS the channel.
    const asC = computeSectionProperties('C-custom', { ...base, c: base.tf })!;
    const asU = computeSectionProperties('U-custom', {
      h: base.h, b: base.b, tw: base.tw, tf: base.tf,
    })!;
    expect(asC.a).toBeCloseTo(asU.a, 12);
    expect(asC.iy).toBeCloseTo(asU.iy, 12);
  });
});

describe('the validity bound follows the convention', () => {
  it('lips collide at c > h/2, not at c + tf > h/2', () => {
    /*
     * A deliberate loosening, and the second sub-decision the patch exposes. Under the old bound a
     * lip of exactly `h/2 - tf` was the deepest allowed; under the outer face the lips meet when
     * their outer-face depths sum to `h`, so the bound is `c > h/2`.
     */
    const base = { h: 0.100, b: 0.050, tw: 0.002, tf: 0.002, tl: 0.002 };
    expect(computeSectionProperties('C-custom', { ...base, c: 0.049 }),
      'just inside the new bound, rejected by the old one').not.toBeNull();
    expect(computeSectionProperties('C-custom', { ...base, c: 0.050 }),
      'exactly h/2 is still allowed').not.toBeNull();
    expect(computeSectionProperties('C-custom', { ...base, c: 0.0501 }),
      'past h/2 the lips would meet').toBeNull();
  });
});
