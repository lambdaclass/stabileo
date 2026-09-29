/**
 * Where a member-tool click in 2D puts a member's end, and what it catches
 * there: the object snaps of a drafting program, for members.
 *
 *   node          an existing node
 *   intersection  where two members cross (both are split there)
 *   midpoint      the middle of a member
 *   perpendicular the foot of the perpendicular from the member's start
 *   onMember      any other point on a member (the grid-snapped cursor,
 *                 projected onto it)
 *   horizontal /  level with, or plumb over, the member's start
 *   vertical
 *   grid          a grid point
 *   free          the cursor itself (grid snap off)
 *
 * Nodes win; then the closest of the intersection, midpoint and
 * perpendicular points; then a point on a member; then the alignment with
 * the start; then the grid. Distances are the caller's screen tolerances
 * converted to world units, so the snaps feel the same at any zoom.
 *
 * Pure: the caller passes the plane geometry (projected nodes, members by
 * their ends) and gets back the point and what it is.
 */

export type MemberSnapKind =
  | 'node' | 'intersection' | 'midpoint' | 'perpendicular' | 'onMember'
  | 'horizontal' | 'vertical' | 'grid' | 'free';

export type Pt = { x: number; y: number };

export interface SnapNode { id: number; x: number; y: number }
export interface SnapMember { id: number; a: Pt; b: Pt }

export interface MemberSnapInput {
  cursor: Pt;
  /** The grid point nearest the cursor; null when grid snap is off. */
  grid: Pt | null;
  /** The end already placed, when the member is being stretched. */
  start: Pt | null;
  nodes: Iterable<SnapNode>;
  members: Iterable<SnapMember>;
  /** World-unit tolerances. */
  tol: { node: number; point: number; member: number; align: number };
}

export interface MemberSnap extends Pt {
  kind: MemberSnapKind;
  /** The node there, for `node`. */
  nodeId?: number;
}

/** Within this of a node, a point on a member IS that node (splitMember's reuse tolerance). */
const NODE_MERGE = 0.01;
/** A point this close to a member's end is not "on" it. */
const END_T = 0.05;

function dist(p: Pt, q: Pt): number { return Math.hypot(p.x - q.x, p.y - q.y); }

/** Parameter of the projection of p on a→b (unclamped), or NaN for a degenerate member. */
function paramOn(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  return l2 < 1e-12 ? NaN : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
}

function at(a: Pt, b: Pt, t: number): Pt { return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }; }

/** Distance from p to the segment a–b. */
function toSegment(p: Pt, a: Pt, b: Pt): number {
  const t = paramOn(p, a, b);
  if (!Number.isFinite(t)) return dist(p, a);
  return dist(p, at(a, b, Math.max(0, Math.min(1, t))));
}

/** Interior crossing of two segments, if any. */
function crossing(m: SnapMember, n: SnapMember): Pt | null {
  const rx = m.b.x - m.a.x, ry = m.b.y - m.a.y;
  const sx = n.b.x - n.a.x, sy = n.b.y - n.a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;              // parallel or collinear
  const qx = n.a.x - m.a.x, qy = n.a.y - m.a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  const eps = 1e-9;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return at(m.a, m.b, t);
}

export function resolveMemberSnap(input: MemberSnapInput): MemberSnap {
  const { cursor, grid, start, tol } = input;
  const nodes = [...input.nodes];
  const members = [...input.members];

  const nodeNear = (p: Pt, within: number): SnapNode | null => {
    let best: SnapNode | null = null, d = within;
    for (const n of nodes) { const e = dist(n, p); if (e < d) { d = e; best = n; } }
    return best;
  };
  /** A point that turns out to lie on a node is that node. */
  const asNode = (p: Pt, kind: MemberSnapKind): MemberSnap => {
    const n = nodeNear(p, NODE_MERGE);
    return n ? { x: n.x, y: n.y, kind: 'node', nodeId: n.id } : { x: p.x, y: p.y, kind };
  };

  // 1. A node.
  const node = nodeNear(cursor, tol.node);
  if (node) return { x: node.x, y: node.y, kind: 'node', nodeId: node.id };

  // Members near the cursor: the only ones that can offer a point.
  const near = members.filter((m) => toSegment(cursor, m.a, m.b) < Math.max(tol.point, tol.member));

  // 2. The closest special point: crossings, midpoints, the perpendicular foot.
  let best: { p: Pt; kind: MemberSnapKind; d: number } | null = null;
  const offer = (p: Pt, kind: MemberSnapKind) => {
    const d = dist(p, cursor);
    if (d < tol.point && (!best || d < best.d)) best = { p, kind, d };
  };
  for (let i = 0; i < near.length; i++) {
    for (let j = i + 1; j < near.length; j++) {
      const x = crossing(near[i], near[j]);
      if (x) offer(x, 'intersection');
    }
  }
  for (const m of near) offer(at(m.a, m.b, 0.5), 'midpoint');
  if (start) {
    for (const m of near) {
      const t = paramOn(start, m.a, m.b);
      if (!(t > END_T && t < 1 - END_T)) continue;
      const foot = at(m.a, m.b, t);
      if (dist(foot, start) < 1e-6) continue;           // the start is on this member
      offer(foot, 'perpendicular');
    }
  }
  if (best) {
    const b = best as { p: Pt; kind: MemberSnapKind };
    return asNode(b.p, b.kind);
  }

  // 3. Anywhere on a member: the grid-snapped cursor, projected onto it.
  let onBar: { m: SnapMember; d: number } | null = null;
  for (const m of near) {
    const d = toSegment(cursor, m.a, m.b);
    if (d < tol.member && (!onBar || d < onBar.d)) onBar = { m, d };
  }
  if (onBar) {
    const { m } = onBar;
    const t = paramOn(grid ?? cursor, m.a, m.b);
    if (t >= END_T && t <= 1 - END_T) return asNode(at(m.a, m.b, t), 'onMember');
  }

  /*
   * A grid or aligned point can land exactly on something (a grid point that
   * is a crossing, a member through a grid point): it is then that, since
   * that is what the click connects to.
   */
  const exactly = (p: Pt, otherwise: MemberSnapKind): MemberSnap => {
    const n = nodeNear(p, NODE_MERGE);
    if (n) return { x: n.x, y: n.y, kind: 'node', nodeId: n.id };
    const on = members.filter((m) => {
      const t = paramOn(p, m.a, m.b);
      return t > 1e-9 && t < 1 - 1e-9 && dist(at(m.a, m.b, t), p) < 1e-9 * Math.max(1, dist(m.a, m.b));
    });
    if (on.length > 1) return { x: p.x, y: p.y, kind: 'intersection' };
    if (on.length === 1) {
      const t = paramOn(p, on[0].a, on[0].b);
      return { x: p.x, y: p.y, kind: Math.abs(t - 0.5) < 1e-9 ? 'midpoint' : 'onMember' };
    }
    return { x: p.x, y: p.y, kind: otherwise };
  };

  // 4. Level with, or plumb over, the start.
  const free = grid ?? cursor;
  if (start) {
    const dxs = Math.abs(cursor.x - start.x), dys = Math.abs(cursor.y - start.y);
    if (dxs < tol.align && dys > tol.align) return exactly({ x: start.x, y: free.y }, 'vertical');
    if (dys < tol.align && dxs > tol.align) return exactly({ x: free.x, y: start.y }, 'horizontal');
    // A grid point that happens to line up says so too.
    if (grid && Math.abs(free.x - start.x) < 1e-9 && Math.abs(free.y - start.y) > 1e-9) return exactly(free, 'vertical');
    if (grid && Math.abs(free.y - start.y) < 1e-9 && Math.abs(free.x - start.x) > 1e-9) return exactly(free, 'horizontal');
  }

  // 5. The grid, or the cursor.
  return exactly(free, grid ? 'grid' : 'free');
}

/** Screen tolerances, in pixels, of each kind of snap. */
export const MEMBER_SNAP_PX = { node: 16, point: 14, member: 12, align: 10 } as const;
