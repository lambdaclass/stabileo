/**
 * Where the labels of a structure plan stand: each element offers places beside it, nearest first,
 * and takes the one that crosses the fewest labels already placed, outlines and axes. Sizes are in
 * plan metres, so the workspace and the exported sheet place them alike at their own scale.
 */
import { segmentHitsBox, type Box, type PlanTextSize } from './slab-plan-labels';
import { itemPoints, type PlanItem, type Pt } from './structure-plan';

/** A label's centre and its angle in plan degrees, counter-clockwise, never upside down. */
export interface LabelSpot { at: Pt; rot: number; box: Box }

const COST = { label: 10, outline: 6, segment: 2, axis: 1 };
const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const boxOf = (pts: readonly Pt[]): Box => ({ x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) });

/** The box a `w` × `h` text centred on `at` covers turned `rot` degrees. */
export function textBox(at: Pt, w: number, h: number, rot: number): Box {
  const t = (rot * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  const hw = (w * c + h * s) / 2, hh = (w * s + h * c) / 2;
  return { x0: at[0] - hw, y0: at[1] - hh, x1: at[0] + hw, y1: at[1] + hh };
}

const upright = (deg: number) => { let d = ((deg % 180) + 180) % 180; if (d > 90) d -= 180; return d; };

/** The places a label of `chars` characters may take beside its element, nearest first. */
export function labelSpots(it: PlanItem, chars: number, s: PlanTextSize): LabelSpot[] {
  const w = chars * s.char, h = s.height, out: LabelSpot[] = [];
  const along = (a: Pt, b: Pt, half: number) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, n: Pt = [-dy / L, dx / L];
    const rot = upright((Math.atan2(dy, dx) * 180) / Math.PI);
    for (const ring of [0, 1, 2, 3]) for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const side of [1, -1]) {
      const off = half + s.gap + h / 2 + ring * (h + s.gap);
      const at: Pt = [a[0] + dx * t + n[0] * off * side, a[1] + dy * t + n[1] * off * side];
      out.push({ at, rot, box: textBox(at, w, h, rot) });
    }
  };
  if (it.kind === 'beam') {
    const spans = [...it.spans].sort((p, q) => Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]) - Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]));
    for (const sp of spans) along(sp.a, sp.b, sp.width / 2);
  } else if (it.kind === 'wall') along(it.a, it.b, it.thickness / 2);
  else {
    const b = boxOf(it.outline), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    for (const ring of [0, 1, 2, 3, 4]) {
      const gx = s.gap + ring * (h + s.gap), gy = s.gap + ring * (h + s.gap);
      const right = b.x1 + gx + w / 2, left = b.x0 - gx - w / 2, up = b.y1 + gy + h / 2, down = b.y0 - gy - h / 2;
      for (const at of [[right, up], [right, down], [left, up], [left, down], [cx, up], [cx, down], [right, cy], [left, cy]] as Pt[]) out.push({ at, rot: 0, box: textBox(at, w, h, 0) });
    }
  }
  return out;
}

/** One place per item, by key, in the order given; `axes` are the grid's lines and bubbles. */
export function placeStructureLabels(items: readonly PlanItem[], text: (it: PlanItem) => string, s: PlanTextSize, axes: { lines: Array<[Pt, Pt]>; boxes: Box[] } = { lines: [], boxes: [] }): Map<string, LabelSpot> {
  const outlines = items.map((it) => boxOf(itemPoints(it)));
  const segments: Array<[Pt, Pt]> = items.flatMap((it) => (it.kind === 'beam'
    ? it.spans.map((x) => [x.a, x.b] as [Pt, Pt])
    : it.outline.map((q, i) => [q, it.outline[(i + 1) % it.outline.length]!] as [Pt, Pt])));
  const placed: Box[] = [...axes.boxes];
  const out = new Map<string, LabelSpot>();
  items.forEach((it) => {
    let best: { spot: LabelSpot; score: number } | null = null;
    for (const spot of labelSpots(it, text(it).length, s)) {
      const score = COST.label * placed.filter((q) => overlap(q, spot.box)).length
        + COST.outline * outlines.filter((q) => overlap(q, spot.box)).length
        + COST.segment * segments.filter(([p, q]) => segmentHitsBox(p, q, spot.box)).length
        + COST.axis * axes.lines.filter(([p, q]) => segmentHitsBox(p, q, spot.box)).length;
      if (!best || score < best.score) best = { spot, score };
      if (score === 0) break;
    }
    if (best) { out.set(it.key, best.spot); placed.push(best.spot.box); }
  });
  return out;
}
