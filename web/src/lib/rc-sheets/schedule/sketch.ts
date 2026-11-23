/**
 * The sketch beside a schedule row: the bar folded flat in its bending plane, each leg dimensioned,
 * fitted to a box of its own (a 15 cm tie leg and a 7 m bar share no scale worth drawing at).
 * The legs are labelled once per distinct length and direction, as a schedule writes them.
 */
import { bendAngles, developedLength, lapLength, legLengths, type BarShape } from '../shape';
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
  const straightM = legs.reduce((acc, l) => acc + l.lengthM, 0) - tangents + lapLength(s);
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

/** `text`: the labels' size, px, so the bar keeps room for them around it: `h` high, `char` per digit. */
export interface SketchBox { w: number; h: number; pad: number; text?: { h: number; char: number } }

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

/** How far the sketch may stretch one way over the other, so a hoop and a hook still read. */
const STRETCH = 3;

/**
 * The diagram fitted to a box, SVG y down: the path, and the orthogonal legs' labels where they stand,
 * each on the side of the bar away from its middle. With `text`, the bar keeps room for its labels
 * and may stretch up to three times one way (a sketch, its legs written).
 */
export function fitSketch(d: Diagram, box: SketchBox): { d: string; legs: Array<RcShapeLeg & { pos: Pt2; side: 'above' | 'below' | 'left' | 'right' }> } {
  const { min, max } = d.extent;
  const w = Math.max(max.x - min.x, 1e-9);
  const h = Math.max(max.y - min.y, 1e-9);
  const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2;
  const orthogonal = (l: RcShapeLeg) => {
    const i = d.legs.indexOf(l), a = d.points[i], b = d.points[i + 1];
    return !a || !b || Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6;
  };
  const labels = labelledLegs(d).filter((l) => !box.text || orthogonal(l));
  const sideOf = (l: RcShapeLeg) => (l.horizontal ? (l.at.y >= cy - 1e-9 ? 'above' as const : 'below' as const) : (l.at.x < cx - 1e-9 ? 'left' as const : 'right' as const));
  const digits = Math.max(1, ...labels.map((l) => String(Math.round(l.lengthM * 100)).length));
  const tw = box.text ? digits * box.text.char + 4 : 0, th = box.text ? box.text.h + 3 : 0;
  const room = (side: 'above' | 'below' | 'left' | 'right', size: number) => (labels.some((l) => sideOf(l) === side) ? size : 0);
  const left = box.pad + room('left', tw), right = box.pad + room('right', tw), top = box.pad + room('above', th), bottom = box.pad + room('below', th);
  let sx = (box.w - left - right) / w, sy = (box.h - top - bottom) / h;
  if (box.text) { sx = Math.min(sx, STRETCH * sy); sy = Math.min(sy, STRETCH * sx); }
  else sx = sy = Math.min(sx, sy);
  const ox = left + (box.w - left - right - w * sx) / 2 - min.x * sx;
  const oy = top + (box.h - top - bottom + h * sy) / 2 + min.y * sy;
  const at = (p: Pt2) => ({ x: ox + p.x * sx, y: oy - p.y * sy });
  return {
    d: d.points.map((p, i) => {
      const q = at(p);
      return `${i === 0 ? 'M' : 'L'}${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
    }).join(' '),
    legs: labels.map((l) => ({ ...l, pos: at(l.at), side: sideOf(l) })),
  };
}
