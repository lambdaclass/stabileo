/**
 * The general engine, checked against the closed forms it replaces.
 *
 * ── Why this is the order to do it in ──────────────────────────────
 *
 * A polygon clipper that is subtly wrong produces plausible numbers
 * everywhere. It will not crash, the interaction curve will still look like
 * an interaction curve, and the error will be a few per cent — the size of
 * the difference between two reasonable engineers, and therefore invisible.
 *
 * So before this engine is asked anything new, it has to reproduce the
 * answers we already trust: the circular segment's closed form, a
 * rectangle's area and centroid by hand, and the existing circular module
 * bar by bar. Only then is agreement with the workbook evidence about the
 * workbook rather than about the clipper.
 */

import { describe, it, expect } from 'vitest';
import {
  polygonAreaCentroid, clipHalfPlane, rectPolygon, teePolygon, circlePolygon,
  compressedZone,
} from '../section-polygon';
import {
  sectionPoint, interactionCurve, grossArea, outlineRings,
  type Bar, type Outline,
} from '../cirsoc201-section';
import { circularSegment } from '../cirsoc201-circular';

describe('the polygon primitives', () => {
  it('gets a rectangle right', () => {
    const { area, cx, cy } = polygonAreaCentroid(rectPolygon(0.3, 0.5));
    expect(Math.abs(area)).toBeCloseTo(0.15, 12);
    expect(cx).toBeCloseTo(0, 12);
    expect(cy).toBeCloseTo(0, 12);
  });

  it('approximates a circle closely enough to ignore', () => {
    const { area } = polygonAreaCentroid(circlePolygon(0.5));
    const exact = Math.PI * 0.25 ** 2;
    expect(Math.abs(Math.abs(area) / exact - 1)).toBeLessThan(1e-4);
  });

  it('puts a T section centroid above mid-height, as a T has', () => {
    /*
     * More flange than web means more area near the top, so the centroid is
     * above the middle. Written as an inequality rather than a number
     * because what would be wrong here is the SIGN — a T built upside down.
     */
    const poly = teePolygon(1.0, 0.10, 0.20, 0.50);
    const ys = poly.map((p) => p.y);
    expect(Math.max(...ys), 'the flange face is the top').toBeGreaterThan(0);
    expect(Math.abs(Math.max(...ys))).toBeLessThan(Math.abs(Math.min(...ys)));
    expect(polygonAreaCentroid(poly).cy).toBeCloseTo(0, 6);
  });

  it('clips a rectangle to exactly the band asked for', () => {
    /* Keep everything above y = 0.1 on a 0.3 × 0.5 section: 0.3 × 0.15. */
    const cut = clipHalfPlane(rectPolygon(0.3, 0.5), 0, 1, 0.1);
    expect(Math.abs(polygonAreaCentroid(cut).area)).toBeCloseTo(0.3 * 0.15, 12);
    expect(polygonAreaCentroid(cut).cy).toBeCloseTo(0.175, 12);
  });

  it('subtracts a hole rather than ignoring it', () => {
    const outer = rectPolygon(0.6, 0.6);
    const hole = [rectPolygon(0.2, 0.2)];
    const whole = compressedZone(outer, hole, 0, 1, -0.3);
    expect(whole.area).toBeCloseTo(0.36 - 0.04, 10);
  });
});

describe('the engine reproduces the circular closed form', () => {
  it('matches `circularSegment` over the whole depth', () => {
    /*
     * THE test that licenses everything else. `cirsoc201-circular.ts` gets
     * its compression zone from trigonometry; this gets it by clipping a
     * 180-gon. If they agree to four figures the clipper is sound.
     */
    const D = 0.5;
    const { outer, holes } = outlineRings({ kind: 'circle', D });
    for (const a of [0.05, 0.15, 0.25, 0.35, 0.48]) {
      const exact = circularSegment(D, a);
      const viaPoly = compressedZone(outer, holes, 0, 1, D / 2 - a);
      expect(viaPoly.area, `area at a=${a}`).toBeCloseTo(exact.area, 4);
      /* First moment against area × the closed form's centroid. */
      expect(viaPoly.my, `first moment at a=${a}`).toBeCloseTo(exact.area * exact.zc, 4);
    }
  });

  it('reports a hollow circle as an annulus', () => {
    const o: Outline = { kind: 'circle', D: 1.0, Dint: 0.6 };
    expect(grossArea(o)).toBeCloseTo(Math.PI * (0.5 ** 2 - 0.3 ** 2), 3);
  });
});

describe('a rectangular column, as a whole section', () => {
  const outline: Outline = { kind: 'rect', b: 0.30, h: 0.30 };
  const mat = { fc: 25, fy: 420 };
  /**
   * Eight bars, four corners plus one at the middle of EACH face.
   *
   * The first version put the four extra bars on the top and bottom faces
   * only — the workbook's own A1/A2 layout — and then asserted the section
   * was symmetric about both axes. It is not, and the engine correctly said
   * so at 0.76. A test premise, not an engine fault, but a good reminder
   * that "symmetric" is a property of the BARS and not of the outline.
   */
  const bars: Bar[] = [
    { x: -0.10, y: -0.10, area: 2.669e-4 }, { x: 0.10, y: -0.10, area: 2.669e-4 },
    { x: -0.10, y: 0.10, area: 2.669e-4 }, { x: 0.10, y: 0.10, area: 2.669e-4 },
    { x: 0, y: -0.10, area: 2.669e-4 }, { x: 0, y: 0.10, area: 2.669e-4 },
    { x: -0.10, y: 0, area: 2.669e-4 }, { x: 0.10, y: 0, area: 2.669e-4 },
  ];

  it('reaches the squash load, and says which convention it is using', () => {
    /*
     * Two numbers, and the difference between them is the point. The
     * textbook Po deducts the concrete the bars displace —
     * `0.85 f'c (Ag − Ast) + fy Ast` — and so does the engine, by default.
     * Switched off it counts that concrete twice and reads 0.85·f'c·Ast
     * higher, which is 45 kN here.
     *
     * The default was the other way round until the workbook comparison
     * showed the deduction is what its sheets actually do. Worth pinning:
     * a reader comparing our top-of-curve against a hand calculation needs
     * to know which of the two they are looking at.
     */
    const Ast = bars.reduce((s, b) => s + b.area, 0);
    const Po = 0.85 * 25000 * (0.09 - Ast) + 420000 * Ast;

    /* The default deducts, so it lands on Po exactly. */
    const asIs = sectionPoint(outline, bars, mat, Math.PI / 2, 10);
    expect(asIs.Pn).toBeCloseTo(Po, 1);

    /* Switched off, the bars' concrete is counted twice — 0.85·f'c·Ast more. */
    const notDeducted = sectionPoint(
      outline, bars, { ...mat, deductDisplacedConcrete: false }, Math.PI / 2, 10,
    );
    expect(notDeducted.Pn).toBeCloseTo(Po + 0.85 * 25000 * Ast, 1);
  });

  it('is symmetric: bending about x and about y give the same curve', () => {
    /*
     * This layout is symmetric in both axes, so it must be. If the clipper
     * or the moment signs had an axis-dependent error, this is where it
     * shows and nothing else in the file would.
     */
    const aboutX = interactionCurve(outline, bars, mat, Math.PI / 2, 30);
    const aboutY = interactionCurve(outline, bars, mat, 0, 30);
    const noseX = Math.max(...aboutX.map((p) => Math.abs(p.phiMnx)));
    const noseY = Math.max(...aboutY.map((p) => Math.abs(p.phiMny)));
    expect(noseY / noseX).toBeCloseTo(1, 2);
  });

  it('has its greatest moment above the balanced point', () => {
    const curve = interactionCurve(outline, bars, mat, Math.PI / 2, 60);
    const nose = curve.reduce((m, p) => (Math.abs(p.phiMnx) > Math.abs(m.phiMnx) ? p : m), curve[0]);
    expect(nose.phiPn).toBeGreaterThan(0);
  });

  it('ends in pure tension with no moment', () => {
    const curve = interactionCurve(outline, bars, mat, Math.PI / 2, 60);
    const last = curve[curve.length - 1];
    expect(last.Pn).toBeLessThan(0);
    expect(Math.abs(last.Mnx)).toBeLessThan(1);
  });

  it('a hole takes capacity away, and only where the hole is', () => {
    /*
     * A void at the centre removes concrete that was carrying axial load and
     * almost no moment — so the squash load must fall and the nose of the
     * curve must barely move. A clipper that mislocated the hole would move
     * both.
     */
    const solid = interactionCurve(outline, bars, mat, Math.PI / 2, 40);
    const hollow = interactionCurve(
      { kind: 'rect', b: 0.30, h: 0.30, hole: { b: 0.10, h: 0.10 } }, bars, mat, Math.PI / 2, 40,
    );
    expect(hollow[0].Pn).toBeLessThan(solid[0].Pn);

    const nose = (c: typeof solid) => Math.max(...c.map((p) => Math.abs(p.Mnx)));
    expect(nose(hollow) / nose(solid)).toBeGreaterThan(0.90);
    expect(nose(hollow) / nose(solid)).toBeLessThan(1.0);
  });
});

describe('skew bending is the same engine at another angle', () => {
  const outline: Outline = { kind: 'rect', b: 0.30, h: 0.30 };
  const mat = { fc: 25, fy: 420 };
  const bars: Bar[] = [
    { x: -0.10, y: -0.10, area: 5e-4 }, { x: 0.10, y: -0.10, area: 5e-4 },
    { x: -0.10, y: 0.10, area: 5e-4 }, { x: 0.10, y: 0.10, area: 5e-4 },
  ];

  it('carries less about the diagonal than about an axis, as a square does', () => {
    /*
     * The classic result: a square column is WEAKER on its diagonal, because
     * the compressed corner is a triangle with a short lever arm. Bresler's
     * formula exists to approximate this; here it falls out.
     */
    const axis = interactionCurve(outline, bars, mat, Math.PI / 2, 40);
    const diag = interactionCurve(outline, bars, mat, Math.PI / 4, 40);
    const noseAxis = Math.max(...axis.map((p) => Math.hypot(p.phiMnx, p.phiMny)));
    const noseDiag = Math.max(...diag.map((p) => Math.hypot(p.phiMnx, p.phiMny)));
    expect(noseDiag).toBeLessThan(noseAxis);
    expect(noseDiag / noseAxis).toBeGreaterThan(0.7);
  });

  it('a 45° axis on a symmetric layout splits the moment evenly', () => {
    const curve = interactionCurve(outline, bars, mat, Math.PI / 4, 40);
    const mid = curve[Math.floor(curve.length / 2)];
    expect(Math.abs(mid.Mnx)).toBeCloseTo(Math.abs(mid.Mny), 6);
  });
});
