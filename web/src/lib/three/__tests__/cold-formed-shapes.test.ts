/**
 * The zed outline, and a discrepancy it exposes in the channel.
 *
 * ── How a drawing is checked without looking at it ────────────────────
 *
 * Three properties, none of which needs a rendered image:
 *
 *   · **Point symmetry.** Every vertex of a Z has a partner at `(tw − x, −y)`. That single
 *     property separates a zed from a channel drawn wrong, and it is checked over the vertex
 *     list rather than by eye.
 *   · **Area by shoelace.** A closed polygon's signed area is computable, so «is this the right
 *     amount of material in the right places» is an assertion and not an impression.
 *   · **It draws at all.** A section whose outline comes back `null` renders as nothing, which
 *     in a viewer looks like a missing member rather than an error.
 *
 * ── The discrepancy ───────────────────────────────────────────────────
 *
 * Writing the zed forced a choice about where a lip starts, and that turned up an inconsistency
 * that was already in the app for the CHANNEL: `computeSectionProperties` measures the lip from
 * the flange's MID-thickness while `createCShape` draws it from the flange's OUTER face. The two
 * models of the same section therefore differ by `2t²` in area — 8 mm² on a `C 100x50x15x2.0`,
 * about 1.8 %.
 *
 * That is pre-existing and not introduced here; the zed follows each convention where the
 * channel does, so the two shapes stay consistent with each other. It is asserted below on the
 * CHANNEL as well as the zed, because an inconsistency nobody has written down is one that gets
 * "fixed" in one place and not the other. Reported in `docs/handoffs/m2-cold-formed-limits.md`.
 */

import { describe, it, expect } from 'vitest';
import { createZShape, createCShape, createSectionShape } from '../section-profiles';
import { coldFormedSource, coldFormedSectionFields } from '../../profiles/cold-formed-catalogue';
import { coldFormedGeometry } from '../../profiles/cold-formed';
import type { Section } from '../../store/model.svelte';

/** Section under test, in millimetres — the units the outline helpers are given. */
const H = 100, B = 50, C = 15, T = 2;

/** Signed area of a closed polygon, by the shoelace formula. */
function shoelace(pts: readonly { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** The material a lipped section has, with the lip measured from the flange's OUTER face. */
const drawnArea = (h: number, b: number, c: number, t: number) =>
  t * (h - 2 * t) + 2 * b * t + 2 * t * (c - t);

describe('the zed outline', () => {
  const z = createZShape(H, B, T, T, C, T);
  const pts = z.getPoints();

  it('is a closed polygon with the twelve vertices a lipped zed has', () => {
    // Twelve corners: two per lip end, two per flange, two per web face — plus the closing
    // repeat `getPoints()` appends.
    expect(pts.length).toBe(13);
    expect(pts[0].x).toBeCloseTo(pts[pts.length - 1].x, 12);
    expect(pts[0].y).toBeCloseTo(pts[pts.length - 1].y, 12);
    expect(z.holes).toHaveLength(0);
  });

  it('is point-symmetric about the centre of the web', () => {
    /*
     * The defining property. Mapping `(x, y) → (tw − x, −y)` must send the vertex set to itself:
     * a channel would map to a different set, because both its flanges point the same way.
     */
    const key = (x: number, y: number) => `${x.toFixed(6)},${y.toFixed(6)}`;
    const set = new Set(pts.slice(0, -1).map((p) => key(p.x, p.y)));
    expect(set.size).toBe(12);
    for (const p of pts.slice(0, -1)) {
      expect(set.has(key(T - p.x, -p.y)), `partner of (${p.x}, ${p.y})`).toBe(true);
    }
  });

  it('spans the depth exactly, and straddles the origin horizontally', () => {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-H / 2, 12);
    expect(Math.max(...ys)).toBeCloseTo(H / 2, 12);
    // Top flange reaches +b, bottom flange reaches tw − b. A channel would have both on one side.
    expect(Math.max(...xs)).toBeCloseTo(B, 12);
    expect(Math.min(...xs)).toBeCloseTo(T - B, 12);
  });

  it('encloses the right amount of material', () => {
    expect(Math.abs(shoelace(pts))).toBeCloseTo(drawnArea(H, B, C, T), 9);
  });

  it('is not the channel outline', () => {
    // Same four dimensions, genuinely different drawing — the assertion that would fail if the
    // dispatch case fell through to `'C'`.
    const c = createCShape(H, B, T, T, C, T);
    expect(Math.abs(shoelace(pts))).toBeCloseTo(Math.abs(shoelace(c.getPoints())), 9);
    expect(pts.map((p) => [p.x, p.y])).not.toEqual(c.getPoints().map((p) => [p.x, p.y]));
  });
});

describe('the lip convention, and the 2t² the app already disagrees with itself by', () => {
  it('the drawn channel and the computed channel differ by exactly 2t²', () => {
    /*
     * Pre-existing, and stated here because writing the zed is what made it visible.
     *
     * `computeSectionProperties`' `C-custom` case puts the lip centre at `(h − tf)/2 − c/2`,
     * i.e. it measures the lip from the flange's mid-thickness. `createCShape` walks the lip
     * from the flange's outer face. Same `c`, `2t²` less material in the drawing.
     */
    const drawn = Math.abs(shoelace(createCShape(H, B, T, T, C, T).getPoints()));
    const computed = coldFormedGeometry({ shape: 'C', hMm: H, bMm: B, cMm: C, tMm: T })!.areaMm2;
    expect(computed - drawn).toBeCloseTo(2 * T * T, 9);
    // Which on this section is 8 mm² of 452 — worth knowing, not worth alarm.
    expect((computed - drawn) / computed).toBeLessThan(0.02);
  });

  it('and the zed disagrees by the same amount, so the two shapes stay consistent', () => {
    // The point of following the channel's conventions rather than inventing better ones: the
    // discrepancy is uniform, so fixing it later is one decision and not two.
    const drawn = Math.abs(shoelace(createZShape(H, B, T, T, C, T).getPoints()));
    const computed = coldFormedGeometry({ shape: 'Z', hMm: H, bMm: B, cMm: C, tMm: T })!.areaMm2;
    expect(computed - drawn).toBeCloseTo(2 * T * T, 9);
  });
});

describe('degenerate zeds fall back instead of self-intersecting', () => {
  it('drops the lips when they are shorter than the sheet is thick', () => {
    // A lip shorter than the thickness makes the outline reverse on itself, and earcut then
    // emits garbage triangles. `createCShape` guards the same case for the same reason.
    const z = createZShape(H, B, T, T, 1, T);
    expect(z.getPoints().length).toBe(9); // 8 vertices + close
    expect(Math.abs(shoelace(z.getPoints()))).toBeGreaterThan(0);
  });

  it('drops the lips when the flange is not wider than two thicknesses', () => {
    // Specific to the zed: its flanges are traversed in both directions, so a narrow flange
    // crosses the path where a channel's would not.
    const z = createZShape(H, 3, T, T, C, T);
    expect(z.getPoints().length).toBe(9);
  });

  it('and every fallback is still a simple closed polygon with positive area', () => {
    for (const [b, c] of [[3, C], [B, 1], [3, 1], [2 * T, C]]) {
      const pts = createZShape(H, b, T, T, c, T).getPoints();
      expect(Math.abs(shoelace(pts)), `b=${b} c=${c}`).toBeGreaterThan(0);
      expect(pts[0].x).toBeCloseTo(pts[pts.length - 1].x, 12);
    }
  });
});

describe('a stored cold-formed section draws through the normal dispatch', () => {
  it('draws a Z from the fields the catalogue writes', () => {
    /*
     * End to end through the path the viewer uses: designation → entry → section fields →
     * `createSectionShape`. If `'Z'` were missing from the dispatch or from the shape union,
     * this is where it would come back null and the member would render as nothing.
     */
    const fields = coldFormedSectionFields(coldFormedSource.byId('Z 200x75x20x2.5')!);
    const sec = { id: 1, ...fields } as Section;
    const shape = createSectionShape(sec);
    expect(shape).not.toBeNull();
    expect(shape!.getPoints().length).toBe(13);

    // Drawn in metres, because that is what the section holds.
    const ys = shape!.getPoints().map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.200, 9);
  });

  it('draws a C the same way', () => {
    const fields = coldFormedSectionFields(coldFormedSource.byId('C 150x60x20x2.0')!);
    const shape = createSectionShape({ id: 2, ...fields } as Section);
    expect(shape).not.toBeNull();
    const xs = shape!.getPoints().map((p) => p.x);
    // A channel sits entirely on one side of its web; a zed does not.
    expect(Math.min(...xs)).toBeCloseTo(0, 9);
  });

  it('and the two are drawn differently, at the same dimensions', () => {
    const c = coldFormedSectionFields(coldFormedSource.byId('C 150x60x20x2.0')!);
    const z = coldFormedSectionFields(coldFormedSource.byId('Z 150x60x20x2.0')!);
    const cs = createSectionShape({ id: 3, ...c } as Section)!.getPoints();
    const zs = createSectionShape({ id: 4, ...z } as Section)!.getPoints();
    expect(zs.map((p) => [p.x, p.y])).not.toEqual(cs.map((p) => [p.x, p.y]));
  });
});
