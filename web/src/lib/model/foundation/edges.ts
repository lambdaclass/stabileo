/**
 * The sides of a building that are property lines, and what they make of its footings: the ones
 * at a line held against it (an anchor, each of X and Y −1, 0 or 1 toward the line), and the
 * footing a strap beam runs to, the nearest one inward. The foundation tools and the sheets read
 * both from here, so a line declared once means the same thing to each.
 */

export type PropertyLines = { minX?: boolean; maxX?: boolean; minY?: boolean; maxY?: boolean };
export type PropertySide = keyof PropertyLines;
export const PROPERTY_SIDES: readonly PropertySide[] = ['minX', 'maxX', 'minY', 'maxY'];

const TOL = 1e-3;
/** A strap runs inward within this angle of square to its line: 15°. */
const STRAP_CONE = Math.PI / 12;

type Pt = { id: number; x: number; y: number };

/** The anchor of each point: toward each declared line it stands on, the building's extremes being the points'. */
export function anchorsOf(pts: readonly Pt[], lines: PropertyLines): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  if (pts.length === 0) return out;
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  for (const p of pts) {
    const ax = lines.minX && Math.abs(p.x - minX) < TOL ? -1 : lines.maxX && Math.abs(p.x - maxX) < TOL ? 1 : 0;
    const ay = lines.minY && Math.abs(p.y - minY) < TOL ? -1 : lines.maxY && Math.abs(p.y - maxY) < TOL ? 1 : 0;
    out.set(p.id, [ax, ay]);
  }
  return out;
}

/** The building's sides nearest a point, along X and along Y, as anchors: where a footing set at a line or a corner by hand is held when no line is declared there. */
export function nearestSides(p: { x: number; y: number }, pts: readonly { x: number; y: number }[]): [number, number] {
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const minX = Math.min(...xs, p.x), maxX = Math.max(...xs, p.x), minY = Math.min(...ys, p.y), maxY = Math.max(...ys, p.y);
  return [p.x - minX <= maxX - p.x ? -1 : 1, p.y - minY <= maxY - p.y ? -1 : 1];
}

/** The nearest of `others` inward from `p` across the line `dir` points to (a unit step in X or Y toward it), within 15° of square to it; null when none is. */
export function inwardPartner<T extends Pt>(p: Pt, dir: [number, number], others: readonly T[]): (T & { d: number }) | null {
  const inward = [-dir[0], -dir[1]];
  let best: (T & { d: number }) | null = null;
  for (const q of others) {
    if (q.id === p.id) continue;
    const v = [q.x - p.x, q.y - p.y], d = Math.hypot(v[0]!, v[1]!);
    if (d < TOL) continue;
    const cos = (v[0]! * inward[0]! + v[1]! * inward[1]!) / d;
    if (cos > Math.cos(STRAP_CONE) && (!best || d < best.d)) best = { ...q, d };
  }
  return best;
}
