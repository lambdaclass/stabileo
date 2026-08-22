/**
 * The 2D zed path — and the reason it is generated rather than written.
 *
 * Before this case existed, a zed reached `crossSectionPath`'s `default:` and came out as a plain
 * RECTANGLE. That is worse than a missing drawing: a missing one looks like a bug, a rectangle
 * looks like a section. Every 2D surface that draws a section was affected — the stress panel's
 * `CrossSectionDrawing`, and the pickers.
 *
 * The path is built from `zedOutline`, the app's single definition of this shape, because the
 * first attempt at hand-transcribing the loop into this file produced a duplicated vertex and a
 * reversed edge — a self-crossing path. These assertions are what caught that: an SVG string is
 * unreadable by inspection, but its area, its vertex count and its symmetry are not.
 */

import { describe, it, expect } from 'vitest';
import { crossSectionPath } from '../section-drawing';
import { zedOutline } from '../../profiles/cold-formed';

/** Section under test, in metres — the unit `crossSectionPath` documents. */
const P = { shape: 'Z' as const, h: 0.2, b: 0.075, tw: 0.0025, tf: 0.0025, t: 0.02, tl: 0.0025 };

/**
 * Pull the vertices back out of an SVG path made only of M/L commands.
 *
 * The trailing `Z` has to be stripped BEFORE splitting: leaving it attached makes the last
 * coordinate parse as `Number('40 Z')` — `NaN`, which then propagates silently through the
 * shoelace sum into an assertion that fails for the wrong reason. Which is what happened on the
 * first run of this file.
 */
function vertices(d: string): { x: number; y: number }[] {
  return d.replace(/\s*Z\s*$/, '')
    .split(/(?=[ML])/)
    .map((seg) => seg.trim())
    .filter((seg) => /^[ML]/.test(seg))
    .map((seg) => {
      const [x, y] = seg.slice(1).trim().split(',').map(Number);
      return { x, y };
    });
}

function shoelace(pts: readonly { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

describe('the zed is drawn as a zed', () => {
  const d = crossSectionPath(P);
  const pts = vertices(d);

  it('is a closed path with the twelve vertices a lipped zed has', () => {
    expect(d.endsWith('Z')).toBe(true);
    expect(pts).toHaveLength(12);
  });

  it('is not the rectangle the default branch would have produced', () => {
    // The regression, stated directly. A rectangle has four vertices and fills its bounding box;
    // a zed has twelve and fills a fraction of it.
    const rect = vertices(crossSectionPath({ ...P, shape: 'rect' }));
    expect(rect.length).toBeLessThan(pts.length);

    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const bbox = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    expect(Math.abs(shoelace(pts)) / bbox).toBeLessThan(0.35);
  });

  it('encloses the same material the shared outline defines', () => {
    // The 2D path and the 3D shape are the same loop under a transform, so their areas agree up
    // to the scale factor squared. Comparing ratios keeps the unknown `sc` out of it.
    const raw = zedOutline(P.h, P.b, P.tw, P.tf, P.t, P.tl);
    const xs = pts.map((p) => p.x);
    const rawXs = raw.map((p) => p.x);
    const scale = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...rawXs) - Math.min(...rawXs));
    expect(Math.abs(shoelace(pts))).toBeCloseTo(Math.abs(shoelace(raw)) * scale * scale, 6);
  });

  it('is point-symmetric about the centre of its bounding box', () => {
    /*
     * The property that distinguishes a zed from a channel, restated in this file's frame. The
     * 2D case centres the section, so the symmetry centre is the origin — which is a stronger
     * check than the 3D one, where it sits at `tw/2`.
     */
    const key = (x: number, y: number) => `${x.toFixed(6)},${y.toFixed(6)}`;
    const set = new Set(pts.map((p) => key(p.x, p.y)));
    expect(set.size).toBe(12);
    for (const p of pts) expect(set.has(key(-p.x, -p.y)), `partner of ${key(p.x, p.y)}`).toBe(true);
  });

  it('and is not the channel path, at the same dimensions', () => {
    expect(crossSectionPath({ ...P, shape: 'C' })).not.toBe(d);
  });

  it('stays inside the viewBox even though a zed is nearly twice as wide as a channel', () => {
    /*
     * A zed of flange width `b` spans `2b − tw`, where a channel spans `b` — physically correct,
     * and a real risk here because `sc = 80 / max(h, b)` is sized on `b` alone.
     *
     * It cannot overflow: the half-width is `b − tw/2 < b ≤ max(h, b)`, so in units it is under
     * `80`. Asserted over a grid rather than left as that argument, since the argument would not
     * survive someone changing the scale rule.
     */
    for (const h of [0.08, 0.1, 0.15, 0.25]) {
      for (const b of [0.04, 0.075, 0.1]) {
        for (const t of [0.0015, 0.003]) {
          const pts = vertices(crossSectionPath({ shape: 'Z', h, b, tw: t, tf: t, t: 0.015, tl: t }));
          const m = Math.max(...pts.flatMap((q) => [Math.abs(q.x), Math.abs(q.y)]));
          expect(m, `h=${h} b=${b} t=${t}`).toBeLessThanOrEqual(80);
        }
      }
    }
  });
});

describe('degenerate zeds still produce a drawable path', () => {
  it('falls back to an unlipped zed rather than a crossing path', () => {
    for (const over of [{ t: 0.001 }, { b: 0.004 }, { t: 0.001, b: 0.004 }]) {
      const pts = vertices(crossSectionPath({ ...P, ...over }));
      expect(pts, JSON.stringify(over)).toHaveLength(8);
      expect(Math.abs(shoelace(pts))).toBeGreaterThan(0);
    }
  });

  it('and a missing lip thickness falls back to the flange, as the channel does', () => {
    // `tl` is optional on the drawing params; `case 'C'` substitutes `tf`, and the zed matches so
    // the two shapes behave the same way on the same incomplete section.
    const { tl: _drop, ...noLip } = P;
    expect(crossSectionPath(noLip)).toBe(crossSectionPath({ ...P, tl: P.tf }));
  });
});
