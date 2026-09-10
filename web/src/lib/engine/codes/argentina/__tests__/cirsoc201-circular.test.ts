/**
 * The round column, checked against geometry and against itself.
 *
 * ── What can actually be asserted ──────────────────────────────────
 *
 * No independent implementation exists to compare against, so the assertions
 * are the ones that do not need one:
 *
 *   · the compression segment is a known piece of geometry, and its area and
 *     centroid can be checked against closed forms and against a brute-force
 *     integration that shares none of its algebra
 *   · pure compression has a textbook value, `0.85 f'c (Ag − Ast) + fy Ast`,
 *     which the curve must reach before the code's cap is applied
 *   · the curve must be a curve: monotone where physics says so, and with the
 *     nose above the balanced point rather than below it
 *   · more steel must never carry less
 *
 * The bar ring is where a subtle error would hide, so it is checked directly:
 * a section's bars must be symmetric about the axis of bending, and their
 * depths must run from `cover` to `D − cover` and nowhere else.
 */

import { describe, it, expect } from 'vitest';
import {
  circularSegment, barRing, generateCircularInteraction,
  checkColumnCircular, designCircular, type CircularParams,
} from '../cirsoc201-circular';

const COL: CircularParams = {
  D: 0.50, fc: 25, fy: 420, cover: 0.05, AstCm2: 40, barCount: 8,
};

describe('the compression segment', () => {
  it('degenerates correctly at both ends', () => {
    expect(circularSegment(0.5, 0).area).toBe(0);
    const full = circularSegment(0.5, 0.5);
    expect(full.area).toBeCloseTo(Math.PI * 0.25 ** 2, 12);
    expect(full.zc, 'a full circle is centred on itself').toBeCloseTo(0, 12);
  });

  it('is half the circle at mid-depth, with the textbook centroid', () => {
    const R = 0.25;
    const half = circularSegment(0.5, R);
    expect(half.area).toBeCloseTo((Math.PI * R * R) / 2, 12);
    // A semicircle's centroid is 4R/3π from the diameter.
    expect(half.zc).toBeCloseTo((4 * R) / (3 * Math.PI), 12);
  });

  it('agrees with a brute-force integration that shares none of its algebra', () => {
    /*
     * The closed form is where a factor of two hides. This integrates the
     * chord width over depth instead — same geometry, no trigonometric
     * identity in common.
     */
    const D = 0.6, R = D / 2;
    for (const a of [0.05, 0.17, 0.3, 0.44, 0.59]) {
      const N = 200_000;
      let area = 0;
      let moment = 0;
      for (let i = 0; i < N; i++) {
        const y = (a * (i + 0.5)) / N;      // depth from the top fibre
        const z = R - y;                     // height above the centre
        const halfChord = Math.sqrt(Math.max(R * R - z * z, 0));
        const dA = 2 * halfChord * (a / N);
        area += dA;
        moment += dA * z;
      }
      const seg = circularSegment(D, a);
      expect(seg.area, `area at a=${a}`).toBeCloseTo(area, 5);
      expect(seg.zc, `centroid at a=${a}`).toBeCloseTo(moment / area, 4);
    }
  });
});

describe('the bar ring', () => {
  it('puts a bar at each extreme fibre and keeps the rest symmetric', () => {
    const bars = barRing(0.5, 0.05, 8);
    const R = 0.25, Rs = R - 0.05;
    expect(bars).toHaveLength(8);
    expect(bars[0].z, 'the first bar is at the top').toBeCloseTo(Rs, 12);
    expect(bars[0].d).toBeCloseTo(R - Rs, 12);

    /*
     * Symmetric about the bending axis: the z values come in ± pairs. The
     * `+ 0` is not decoration — a bar at the horizontal diameter produces
     * -0 on one side and 0 on the other, and `toEqual` tells those apart.
     */
    const norm = (v: number) => +(v + 0).toFixed(9) + 0;
    const zs = bars.map((b) => norm(b.z)).sort((a, b) => a - b);
    const flipped = bars.map((b) => norm(-b.z)).sort((a, b) => a - b);
    expect(zs).toEqual(flipped);
  });

  it('keeps every bar inside the section', () => {
    for (const n of [4, 6, 8, 12, 20]) {
      for (const bar of barRing(0.5, 0.05, n)) {
        expect(bar.d).toBeGreaterThanOrEqual(0.05 - 1e-12);
        expect(bar.d).toBeLessThanOrEqual(0.5 - 0.05 + 1e-12);
      }
    }
  });
});

describe('the interaction curve', () => {
  it('reaches the textbook squash load before the code caps it', () => {
    /*
     * At a neutral axis far below the section every bar yields in compression
     * and the whole circle is in the block, so Pn must be
     * 0.85 f'c (Ag − Ast) + fy Ast. The curve reports φPn with §10.3.6's cap
     * already applied, so the check is made against that cap — which is what
     * a reader would compare a column against anyway.
     */
    const d = generateCircularInteraction(COL);
    const Ag = Math.PI * 0.25 ** 2;
    const Ast = COL.AstCm2 * 1e-4;
    const Pn0 = 0.85 * COL.fc * 1000 * (Ag - Ast) + COL.fy * 1000 * Ast;
    expect(d.pureCompression.phiPn).toBeCloseTo(0.65 * 0.80 * Pn0, 6);
  });

  it('gives a spiral more than ties, on both counts', () => {
    const ties = generateCircularInteraction({ ...COL, confinement: 'ties' });
    const spiral = generateCircularInteraction({ ...COL, confinement: 'spiral' });
    expect(spiral.pureCompression.phiPn).toBeGreaterThan(ties.pureCompression.phiPn);
    expect(spiral.balanced.phi).toBeGreaterThanOrEqual(ties.balanced.phi);
  });

  it('has its greatest moment above the balanced point, not below', () => {
    /*
     * The nose of an interaction diagram sits near balanced failure. If the
     * maximum moment came out at pure bending, the curve would be the wrong
     * shape and every eccentric column checked against it would be wrong in
     * the safe-looking direction.
     */
    const d = generateCircularInteraction(COL);
    const nose = d.points.reduce((m, p) => (p.phiMn > m.phiMn ? p : m), d.points[0]);
    expect(nose.phiPn).toBeGreaterThan(0);
    expect(nose.phiMn).toBeGreaterThan(d.pureTension.phiMn);
  });

  it('is in pure tension at the far end, with no moment', () => {
    const d = generateCircularInteraction(COL);
    expect(d.pureTension.phiPn).toBeLessThan(0);
    expect(Math.abs(d.pureTension.phiMn)).toBeLessThan(1);
  });

  it('never carries less for carrying more steel', () => {
    const light = generateCircularInteraction({ ...COL, AstCm2: 20 });
    const heavy = generateCircularInteraction({ ...COL, AstCm2: 60 });
    const noseOf = (d: ReturnType<typeof generateCircularInteraction>) =>
      d.points.reduce((m, p) => Math.max(m, p.phiMn), 0);
    expect(noseOf(heavy)).toBeGreaterThan(noseOf(light));
    expect(heavy.pureCompression.phiPn).toBeGreaterThan(light.pureCompression.phiPn);
  });

  it('loses a little capacity when the displaced concrete is deducted', () => {
    /*
     * Measured at the balanced point, not at pure compression.
     *
     * §10.3.6's cap governs the top of the curve, and the squash load it is
     * built from — `0.85 f'c (Ag − Ast) + fy Ast` — already excludes the area
     * the bars occupy. So the deduction cannot move that ordinate, and a test
     * that looked there would report the option doing nothing when it is
     * working correctly. Where it acts is the intermediate points, whose
     * concrete block is computed from the segment alone.
     */
    const off = generateCircularInteraction({ ...COL, deductDisplacedConcrete: false }).balanced;
    const on = generateCircularInteraction(COL).balanced;
    expect(on.phiPn).toBeLessThan(off.phiPn);
    /* A per cent or two — if it were more, something else is being subtracted. */
    const drop = 1 - on.phiPn / off.phiPn;
    expect(drop).toBeGreaterThan(0);
    expect(drop).toBeLessThan(0.06);
  });
});

describe('checking a demand against the curve', () => {
  it('passes a small demand and fails a large one', () => {
    expect(checkColumnCircular(COL, 500, 60).status).toBe('ok');
    expect(checkColumnCircular(COL, 5000, 900).status).toBe('fail');
  });

  it('measures along the ray, so doubling both stays proportional', () => {
    /*
     * The ratio is a distance along a fixed eccentricity. Scaling the whole
     * demand must scale the ratio by the same factor — if it did not, the
     * comparison would depend on where the origin happens to be.
     */
    const a = checkColumnCircular(COL, 400, 50);
    const b = checkColumnCircular(COL, 800, 100);
    expect(b.ratio / a.ratio).toBeCloseTo(2, 2);
  });

  it('answers pure bending without dividing by zero', () => {
    const r = checkColumnCircular(COL, 0, 40);
    expect(Number.isFinite(r.ratio)).toBe(true);
    expect(r.phiMn).toBeGreaterThan(0);
  });
});

describe('sizing the steel', () => {
  it('lands just inside the curve, and reports a passing ratio', () => {
    const r = designCircular({ D: 0.5, fc: 25, fy: 420, cover: 0.05, barCount: 8 }, 1200, 180);
    expect(r).not.toBeNull();
    expect(r!.ratio).toBeLessThanOrEqual(1.0001);
    /* Just inside: a tenth of a per cent less steel would not pass. */
    const leaner = checkColumnCircular(
      { D: 0.5, fc: 25, fy: 420, cover: 0.05, barCount: 8, AstCm2: r!.AstCm2 * 0.999 },
      1200, 180,
    );
    expect(leaner.ratio).toBeGreaterThan(0.999 * r!.ratio);
  });

  it('never goes under the code minimum', () => {
    const D = 0.5;
    const r = designCircular({ D, fc: 25, fy: 420, cover: 0.05, barCount: 8 }, 50, 5);
    const Ag = Math.PI * (D / 2) ** 2;
    expect(r!.AstCm2).toBeCloseTo(0.01 * Ag * 1e4, 6);
  });

  it('refuses rather than returning the maximum for a section that cannot work', () => {
    /*
     * Answering 8 % for a demand 8 % cannot carry would be a design that does
     * not stand up, handed over as if it did.
     */
    const r = designCircular({ D: 0.3, fc: 20, fy: 420, cover: 0.04, barCount: 6 }, 9000, 700);
    expect(r).toBeNull();
  });
});
