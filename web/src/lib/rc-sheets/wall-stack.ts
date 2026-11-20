/**
 * The storeys of one wall: recognition makes a wall of each storey, so the storey above is the wall
 * whose base stands on this one's top along the same line in plan. Its verticals lap into that one.
 */
import type { WallDemand } from './wall-row';

const TOL = 0.05;

type Placed = Pick<WallDemand, 'key' | 'plan' | 'height' | 'z'>;
type Pt = [number, number];

const near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < TOL;

function sameLine(p: NonNullable<WallDemand['plan']>, q: NonNullable<WallDemand['plan']>): boolean {
  const p1: Pt = [p.x1, p.y1], p2: Pt = [p.x2, p.y2], q1: Pt = [q.x1, q.y1], q2: Pt = [q.x2, q.y2];
  return (near(p1, q1) && near(p2, q2)) || (near(p1, q2) && near(p2, q1));
}

/** Each wall's storey below and above, by key; a wall with neither is left out. */
export function wallStacks(walls: readonly Placed[]): Map<string, { below?: string; above?: string }> {
  const out = new Map<string, { below?: string; above?: string }>();
  for (const lo of walls) {
    if (!lo.plan || lo.z === undefined) continue;
    const top = lo.z + lo.height;
    const up = walls.find((w) => w !== lo && !!w.plan && w.z !== undefined && Math.abs(w.z - top) < TOL && sameLine(lo.plan!, w.plan));
    if (!up) continue;
    out.set(lo.key, { ...out.get(lo.key), above: up.key });
    out.set(up.key, { ...out.get(up.key), below: lo.key });
  }
  return out;
}
