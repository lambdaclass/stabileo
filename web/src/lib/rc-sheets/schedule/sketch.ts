/**
 * The sketch beside a schedule row: the bar folded flat in its bending plane, each leg dimensioned,
 * fitted to a box of its own (a 15 cm tie leg and a 7 m bar share no scale worth drawing at).
 * The legs are labelled once per distinct length and direction, as a schedule writes them.
 */
import { bendAngles, developedLength, legLengths, type BarShape } from '../shape';
import type { Pt2, RcShapeDiagram, RcShapeLeg } from './bar-shape-diagram';

/** A bar shape as a schedule diagram: legs between the intersections of their centrelines. */
export function sketchOf(s: BarShape): RcShapeDiagram {
  const points: Pt2[] = s.pts.map(([x, y]) => ({ x, y }));
  const legs: RcShapeLeg[] = legLengths(s).map((lengthM, i) => {
    const a = points[i]!, b = points[i + 1]!;
    return { lengthM, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, horizontal: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) };
  });
  const r = (s.mandrel + s.dia / 1000) / 2;
  const tangents = bendAngles(s).reduce((acc, t) => acc + 2 * r * Math.tan(t / 2), 0);
  const straightM = legs.reduce((acc, l) => acc + l.lengthM, 0) - tangents;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return {
    points,
    hooks: { start: null, end: null },
    hooksFolded: false,
    legs,
    straightM,
    bendsM: Math.max(0, developedLength(s) - straightM),
    extent: { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } },
  };
}

export interface SketchBox { w: number; h: number; pad: number }

type Diagram = Pick<RcShapeDiagram, 'points' | 'legs' | 'extent'>;

/** One leg per distinct length (to the mm) and direction. */
export function labelledLegs(d: Pick<RcShapeDiagram, 'legs'>): RcShapeLeg[] {
  const seen = new Set<string>();
  return d.legs.filter((l) => {
    const key = `${Math.round(l.lengthM * 1000)}|${l.horizontal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The diagram fitted to a box, SVG y down: the path, and the labelled legs where they stand. */
export function fitSketch(d: Diagram, box: SketchBox): { d: string; legs: Array<RcShapeLeg & { pos: Pt2 }> } {
  const { min, max } = d.extent;
  const w = Math.max(max.x - min.x, 1e-9);
  const h = Math.max(max.y - min.y, 1e-9);
  const s = Math.min((box.w - 2 * box.pad) / w, (box.h - 2 * box.pad) / h);
  const ox = (box.w - w * s) / 2 - min.x * s;
  const oy = (box.h + h * s) / 2 + min.y * s;
  const at = (p: Pt2) => ({ x: ox + p.x * s, y: oy - p.y * s });
  return {
    d: d.points.map((p, i) => {
      const q = at(p);
      return `${i === 0 ? 'M' : 'L'}${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
    }).join(' '),
    legs: labelledLegs(d).map((l) => ({ ...l, pos: at(l.at) })),
  };
}
