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
 * ── The discrepancy this file used to record ──────────────────────────
 *
 * Writing the zed forced a choice about where a lip starts, and that turned up an inconsistency
 * that was already in the app for the CHANNEL: `computeSectionProperties` measured the lip from the
 * flange's MID-thickness while `createCShape` drew it from the outer face, so the two models of the
 * same section differed by `2t²` in area — 8 mm² on a `C 100x50x15x2.0`, about 1.8 %.
 *
 * It is closed. `120f15cc` (H1, applying M1's proposal verbatim, because `section-shapes.ts` also
 * holds the concrete templates) brought the calculation to the outer face, and this branch mirrored
 * it in `partsC`/`partsZ` in the same integration. The assertions below are the INVERTED versions
 * of the ones that recorded the gap, plus the polygon-moment test that makes reverting it loud.
 */

import { describe, it, expect } from 'vitest';
import { createZShape, createCShape, createSectionShape } from '../section-profiles';
import { coldFormedSource, coldFormedSectionFields } from '../../profiles/cold-formed-catalogue';
import { coldFormedGeometry } from '../../profiles/cold-formed';
import type { Section } from '../../store/model.svelte';

/** Section under test, in millimetres — the units the outline helpers are given. */
const H = 100, B = 50, C = 15, T = 2;

/**
 * Area and centroidal second moments of a closed polygon, by Green's theorem.
 *
 * Independent of everything under test: it integrates the vertex loop a renderer emits and knows
 * nothing about how the properties were derived. That independence is the point — it is what lets
 * «the calculation and the drawing describe the same object» be measured rather than asserted.
 */
function polyMoments(pts: readonly { x: number; y: number }[]) {
  let a2 = 0, sx = 0, sy = 0, ixx = 0, iyy = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const cr = p.x * q.y - q.x * p.y;
    a2 += cr; sx += (p.x + q.x) * cr; sy += (p.y + q.y) * cr;
    ixx += (p.y * p.y + p.y * q.y + q.y * q.y) * cr;
    iyy += (p.x * p.x + p.x * q.x + q.x * q.x) * cr;
  }
  const area = Math.abs(a2 / 2);
  const cx = sx / (3 * a2), cy = sy / (3 * a2);
  return { area, cx, cy,
           iy: Math.abs(ixx / 12) - area * cy * cy,
           iz: Math.abs(iyy / 12) - area * cx * cx };
}

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

describe('the lip convention: the calculation and the drawing now agree', () => {
  it('the drawn channel and the computed channel enclose the same material', () => {
    /*
     * This assertion used to say the opposite. It asserted `computed − drawn === 2t²`, because
     * `computeSectionProperties` measured the lip from the flange's MID-LINE while both drawings
     * measured from its OUTER face — 8 mm² of 452 on this section.
     *
     * `120f15cc` brought the calculation over to the outer face and this branch mirrored it in
     * `partsC`/`partsZ`. Inverting this test is the signal that the unification happened; a test
     * whose title still promised a discrepancy would protect nothing.
     */
    const drawn = Math.abs(shoelace(createCShape(H, B, T, T, C, T).getPoints()));
    const computed = coldFormedGeometry({ shape: 'C', hMm: H, bMm: B, cMm: C, tMm: T })!.areaMm2;
    expect(computed - drawn).toBeCloseTo(0, 9);
  });

  it('and so do the zed and its own outline', () => {
    // The two shapes had to move together or the `iy(Z) == iy(C)` identity — the independent check
    // on the whole zed derivation — would have broken.
    const drawn = Math.abs(shoelace(createZShape(H, B, T, T, C, T).getPoints()));
    const computed = coldFormedGeometry({ shape: 'Z', hMm: H, bMm: B, cMm: C, tMm: T })!.areaMm2;
    expect(computed - drawn).toBeCloseTo(0, 9);
  });

  it('agree on the second moments too, not only on the area', () => {
    /*
     * The test the proposal asked for in the same commit as the unification, and the one that
     * makes it impossible to undo quietly: the MOMENTS of the polygon each renderer walks, by
     * Green's theorem, against the properties the calculation returns. Area alone would pass for
     * a lip in the wrong place.
     *
     * Machine precision is the acceptance criterion, over a grid rather than one section.
     */
    for (const [h, b, c, t] of [[100, 50, 15, 2], [150, 60, 20, 2.5], [200, 75, 20, 3], [80, 40, 12, 1.5]]) {
      for (const shape of ['C', 'Z'] as const) {
        const pts = (shape === 'C' ? createCShape : createZShape)(h, b, t, t, c, t).getPoints();
        const m = polyMoments(pts);
        const g = coldFormedGeometry({ shape, hMm: h, bMm: b, cMm: c, tMm: t })!;
        const label = `${shape} ${h}x${b}x${c}x${t}`;
        expect(m.area / g.areaMm2, `${label} A`).toBeCloseTo(1, 12);
        expect(m.iy / g.iyMm4, `${label} Iy`).toBeCloseTo(1, 12);
        expect(m.iz / g.izMm4, `${label} Iz`).toBeCloseTo(1, 12);
      }
    }
  });

  it('and a lip shorter than the sheet is thick is a plain channel in both', () => {
    // The regime that was worse than a t/2 shift: the calculation used to add `2·c·tl` of lip
    // while the drawing rendered none. Now both agree there is no lip.
    const drawn = Math.abs(shoelace(createCShape(H, B, T, T, T, T).getPoints()));
    const computed = coldFormedGeometry({ shape: 'C', hMm: H, bMm: B, cMm: T, tMm: T })!.areaMm2;
    expect(computed - drawn).toBeCloseTo(0, 9);
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
