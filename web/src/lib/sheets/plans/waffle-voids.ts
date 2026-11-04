/**
 * The voids of a waffle slab on its formwork plan: one per grid cell between ribs, wherever the cell
 * lies wholly inside the slab, clear of its openings and of its solid zones (drops and solid bands).
 *
 * The ribs run at their spacing from the corner of the slab's box; each void is the cell less a rib
 * width, centred in it. Solid zones are the plan boxes of the elements as deep as the ribs.
 */
import { loopArea, type PlanPoint } from '../../model/mesh-boundary';

export interface PlanRect { x0: number; x1: number; y0: number; y1: number }

function inside(p: PlanPoint, loops: readonly PlanPoint[][]): boolean {
  let c = false;
  for (const poly of loops) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!, b = poly[j]!;
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
  }
  return c;
}

/** Touching boxes merged, so a drop meshed in many elements is one zone. */
export function mergeBoxes(boxes: readonly PlanRect[], tol = 1e-3): PlanRect[] {
  const zones: PlanRect[] = [];
  for (const b0 of boxes) {
    let b = { ...b0 };
    for (;;) {
      const i = zones.findIndex((z) => z.x0 <= b.x1 + tol && z.x1 >= b.x0 - tol && z.y0 <= b.y1 + tol && z.y1 >= b.y0 - tol);
      if (i < 0) break;
      const z = zones.splice(i, 1)[0]!;
      b = { x0: Math.min(b.x0, z.x0), x1: Math.max(b.x1, z.x1), y0: Math.min(b.y0, z.y0), y1: Math.max(b.y1, z.y1) };
    }
    zones.push(b);
  }
  return zones;
}

export function waffleVoids(args: {
  loops: readonly PlanPoint[][];
  solids: readonly PlanRect[];
  spacingX: number; spacingY: number; ribWidth: number;
}): PlanRect[] {
  const outer = args.loops[0];
  if (!outer || Math.abs(loopArea(outer)) < 1e-9 || args.spacingX <= args.ribWidth || args.spacingY <= args.ribWidth) return [];
  const xs = outer.map((p) => p.x), ys = outer.map((p) => p.y);
  const X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys);
  const hx = (args.spacingX - args.ribWidth) / 2, hy = (args.spacingY - args.ribWidth) / 2;
  const out: PlanRect[] = [];
  for (let cx = X0 + args.spacingX / 2; cx < X1; cx += args.spacingX) {
    for (let cy = Y0 + args.spacingY / 2; cy < Y1; cy += args.spacingY) {
      const r = { x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy };
      const pts = [{ x: cx, y: cy }, { x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
      if (!pts.every((p) => inside(p, args.loops))) continue;
      if (args.solids.some((z) => z.x0 < r.x1 && z.x1 > r.x0 && z.y0 < r.y1 && z.y1 > r.y0)) continue;
      out.push(r);
    }
  }
  return out;
}
