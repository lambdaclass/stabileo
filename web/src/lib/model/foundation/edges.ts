/**
 * The sides of a building that are property lines, and what they make of its footings: the ones
 * at a line held against it (an anchor, each of X and Y −1, 0 or 1 toward the line), and the
 * footing a strap beam runs to, the nearest one inward. The foundation tools and the sheets read
 * both from here, so a line declared once means the same thing to each.
 */

import { AXIS_TOLERANCE, axisAnchors, inwardFooting, type PropertyLines, type PlanPoint } from './support-axes';

export type { PropertyLines };
export type PropertySide = keyof PropertyLines;
export const PROPERTY_SIDES: readonly PropertySide[] = ['minX', 'maxX', 'minY', 'maxY'];

/** A point with the half widths of the column on it, m: its faces are what meets a line. */
type Faced = PlanPoint & { hx?: number; hy?: number };

/** The anchor of each point: toward each declared line it stands on, by its axis at the building's outermost axes or by its column's face at the outermost faces, so a wider column flush with the line is held too. */
export function anchorsOf(pts: readonly Faced[], lines: PropertyLines): Map<number, [number, number]> {
  const face = (p: Faced, axis: 'x' | 'y', side: 'min' | 'max') =>
    p[axis] + (side === 'min' ? -1 : 1) * ((axis === 'x' ? p.hx : p.hy) ?? 0);
  const bounds = (axis: 'x' | 'y') => ({
    min: Math.min(...pts.map(p => face(p, axis, 'min'))),
    max: Math.max(...pts.map(p => face(p, axis, 'max'))),
  });
  const outer = { x: bounds('x'), y: bounds('y') };
  return axisAnchors(pts, lines, (p, axis, side) => Math.abs(face(p, axis, side) - outer[axis][side]) < AXIS_TOLERANCE);
}

/** The building's sides nearest a point, along X and along Y, as anchors: where a footing set at a line or a corner by hand is held when no line is declared there. */
export function nearestSides(p: { x: number; y: number }, pts: readonly { x: number; y: number }[]): [number, number] {
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const minX = Math.min(...xs, p.x), maxX = Math.max(...xs, p.x), minY = Math.min(...ys, p.y), maxY = Math.max(...ys, p.y);
  return [p.x - minX <= maxX - p.x ? -1 : 1, p.y - minY <= maxY - p.y ? -1 : 1];
}

/** The nearest of `others` inward from `p` across the line `dir` points to (a unit step in X or Y toward it), within 15° of square to it; null when none is. */
export function inwardPartner<T extends PlanPoint>(p: PlanPoint, dir: [number, number], others: readonly T[], halfAcross = 0): (T & { d: number }) | null {
  if (!(halfAcross > 0)) return inwardFooting(p, dir, others);
  return inwardFooting(p, dir, others, (along, across, insideCone) =>
    insideCone || (along > AXIS_TOLERANCE && across <= halfAcross + AXIS_TOLERANCE) ? along : null);
}
