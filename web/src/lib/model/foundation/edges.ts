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
/** A point with the half widths of the column on it, m: its faces are what meets a line. */
type Faced = Pt & { hx?: number; hy?: number };

/** The anchor of each point: toward each declared line it stands on, by its axis at the building's outermost axes or by its column's face at the outermost faces, so a wider column flush with the line is held too. */
export function anchorsOf(pts: readonly Faced[], lines: PropertyLines): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  if (pts.length === 0) return out;
  const lo = (p: Faced, k: 'x' | 'y') => p[k] - ((k === 'x' ? p.hx : p.hy) ?? 0), hi = (p: Faced, k: 'x' | 'y') => p[k] + ((k === 'x' ? p.hx : p.hy) ?? 0);
  const ext = (f: (p: Faced) => number) => ({ min: Math.min(...pts.map(f)), max: Math.max(...pts.map(f)) });
  const axis = { x: ext((p) => p.x), y: ext((p) => p.y) }, face = { x: { min: ext((p) => lo(p, 'x')).min, max: ext((p) => hi(p, 'x')).max }, y: { min: ext((p) => lo(p, 'y')).min, max: ext((p) => hi(p, 'y')).max } };
  const atMin = (p: Faced, k: 'x' | 'y') => Math.abs(p[k] - axis[k].min) < TOL || Math.abs(lo(p, k) - face[k].min) < TOL;
  const atMax = (p: Faced, k: 'x' | 'y') => Math.abs(p[k] - axis[k].max) < TOL || Math.abs(hi(p, k) - face[k].max) < TOL;
  for (const p of pts) {
    const ax = lines.minX && atMin(p, 'x') ? -1 : lines.maxX && atMax(p, 'x') ? 1 : 0;
    const ay = lines.minY && atMin(p, 'y') ? -1 : lines.maxY && atMax(p, 'y') ? 1 : 0;
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
export function inwardPartner<T extends Pt>(p: Pt, dir: [number, number], others: readonly T[], halfAcross = 0): (T & { d: number }) | null {
  const inward = [-dir[0], -dir[1]];
  let best: (T & { d: number; along: number }) | null = null;
  for (const q of others) {
    if (q.id === p.id) continue;
    const v = [q.x - p.x, q.y - p.y], d = Math.hypot(v[0]!, v[1]!);
    if (d < TOL) continue;
    const along = v[0]! * inward[0]! + v[1]! * inward[1]!, across = Math.abs(v[0]! * inward[1]! - v[1]! * inward[0]!);
    const ahead = along / d > Math.cos(STRAP_CONE) || (along > TOL && across <= halfAcross + TOL);
    const key = halfAcross > 0 ? along : d;
    if (ahead && (!best || key < best.along)) best = { ...q, d, along: key };
  }
  if (!best) return null;
  const { along: _, ...hit } = best;
  return hit as T & { d: number };
}
