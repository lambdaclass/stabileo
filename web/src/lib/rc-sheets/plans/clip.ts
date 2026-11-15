/**
 * A drawing cut to a band of x, for an elevation too long for its sheet at its scale: lines and
 * open polylines clipped, closed outlines cut to the band, circles and texts kept where they
 * stand, and a dimension only when it lies wholly inside.
 */
import type { P, Primitive } from '../../sheets/primitives';

const TOL = 1e-6;

function clipSegment(a: P, b: P, x0: number, x1: number): [P, P] | null {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x;
  if (Math.abs(dx) < TOL) return a.x < x0 - TOL || a.x > x1 + TOL ? null : [a, b];
  const ta = (x0 - a.x) / dx, tb = (x1 - a.x) / dx;
  t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
  if (t1 - t0 < TOL) return null;
  const at = (t: number): P => ({ x: a.x + dx * t, y: a.y + (b.y - a.y) * t });
  return [at(t0), at(t1)];
}

function clipOpen(points: readonly P[], x0: number, x1: number): P[][] {
  const runs: P[][] = [];
  let cur: P[] = [];
  for (let i = 1; i < points.length; i++) {
    const c = clipSegment(points[i - 1]!, points[i]!, x0, x1);
    if (!c) { if (cur.length) runs.push(cur); cur = []; continue; }
    const last = cur[cur.length - 1];
    if (last && Math.hypot(last.x - c[0].x, last.y - c[0].y) < TOL) cur.push(c[1]);
    else { if (cur.length) runs.push(cur); cur = [c[0], c[1]]; }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

function clipClosed(points: readonly P[], x0: number, x1: number): P[] {
  const side = (pts: P[], keep: (p: P) => boolean, cut: (a: P, b: P) => P): P[] => {
    const out: P[] = [];
    pts.forEach((b, i) => {
      const a = pts[(i + pts.length - 1) % pts.length]!;
      if (keep(b)) { if (!keep(a)) out.push(cut(a, b)); out.push(b); }
      else if (keep(a)) out.push(cut(a, b));
    });
    return out;
  };
  const at = (x: number) => (a: P, b: P): P => ({ x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) });
  return side(side([...points], (p) => p.x >= x0 - TOL, at(x0)), (p) => p.x <= x1 + TOL, at(x1));
}

export function clipToBand(ps: readonly Primitive[], x0: number, x1: number): Primitive[] {
  const inside = (x: number) => x >= x0 - TOL && x <= x1 + TOL;
  const out: Primitive[] = [];
  for (const p of ps) {
    switch (p.kind) {
      case 'line': { const c = clipSegment(p.a, p.b, x0, x1); if (c) out.push({ ...p, a: c[0], b: c[1] }); break; }
      case 'polyline':
        if (p.closed) { const pts = clipClosed(p.points, x0, x1); if (pts.length >= 3) out.push({ ...p, points: pts }); }
        else for (const run of clipOpen(p.points, x0, x1)) out.push({ ...p, points: run });
        break;
      case 'circle': case 'arc': if (inside(p.c.x)) out.push(p); break;
      case 'text': if (inside(p.at.x)) out.push(p); break;
      case 'dimension': if (inside(p.a.x) && inside(p.b.x)) out.push(p); break;
    }
  }
  return out;
}

/**
 * Bands over [from, to], each ending at the farthest of `breaks` (the support axes) within `width`;
 * where none is within reach, at the next one, so a span is never cut and its dimension holds.
 */
export function bands(from: number, to: number, width: number, breaks: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let a = from;
  while (to - a > width + TOL) {
    const ahead = breaks.filter((x) => x > a + TOL && x < to - TOL);
    if (!ahead.length) break;
    const fit = ahead.filter((x) => x - a <= width + TOL);
    const b = fit.length ? Math.max(...fit) : Math.min(...ahead);
    out.push([a, b]);
    a = b;
  }
  out.push([a, to]);
  return out;
}
