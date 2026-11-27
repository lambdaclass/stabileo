export type PropertyLines = { minX?: boolean; maxX?: boolean; minY?: boolean; maxY?: boolean };
export type PlanPoint = { id: number; x: number; y: number };
export const AXIS_TOLERANCE = 1e-3;
const STRAP_CONE = Math.PI / 12;

type SideTest<T> = (p: T, axis: 'x' | 'y', side: 'min' | 'max') => boolean;

export function axisAnchors<T extends PlanPoint>(points: readonly T[], lines: PropertyLines, touchesFace?: SideTest<T>): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  if (!points.length) return out;
  const bounds = (axis: 'x' | 'y') => ({
    min: Math.min(...points.map(p => p[axis])),
    max: Math.max(...points.map(p => p[axis])),
  });
  const outer = { x: bounds('x'), y: bounds('y') };
  const on = (p: T, axis: 'x' | 'y', side: 'min' | 'max') =>
    Math.abs(p[axis] - outer[axis][side]) < AXIS_TOLERANCE || touchesFace?.(p, axis, side);
  for (const p of points) out.set(p.id, [
    lines.minX && on(p, 'x', 'min') ? -1 : lines.maxX && on(p, 'x', 'max') ? 1 : 0,
    lines.minY && on(p, 'y', 'min') ? -1 : lines.maxY && on(p, 'y', 'max') ? 1 : 0,
  ]);
  return out;
}

export function inwardFooting<T extends PlanPoint>(
  p: PlanPoint, dir: [number, number], others: readonly T[],
  pierRank?: (along: number, across: number, insideCone: boolean) => number | null,
): (T & { d: number }) | null {
  let hit: (T & { d: number }) | null = null;
  let nearest = Infinity;
  for (const q of others) {
    if (p.id === q.id) continue;
    const x = q.x - p.x, y = q.y - p.y;
    const d = Math.hypot(x, y);
    if (d < AXIS_TOLERANCE) continue;
    const along = -x * dir[0] - y * dir[1];
    const insideCone = along / d > Math.cos(STRAP_CONE);
    const rank = pierRank ? pierRank(along, Math.abs(x * dir[1] - y * dir[0]), insideCone) : insideCone ? d : null;
    if (rank !== null && rank < nearest) {
      nearest = rank;
      hit = { ...q, d };
    }
  }
  return hit;
}
