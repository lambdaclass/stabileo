/**
 * The node tool's duplicate-coincident-node guard: a click that lands on an existing node selects
 * it instead of placing a twin in the same place, which would look joined and analyse as a cut.
 * Shared by the plane and the space viewports so the two cannot drift apart.
 */
import { findCoincidentNode, type NodeLike } from '../engine/mesh-weld';

/**
 * How near the placement point a node must be to be the one clicked, m: a click, resolved through
 * the grid and the snaps, not a weld — coarser than the weld tolerance on purpose.
 */
export const NODE_PLACEMENT_TOL = 0.01;

export type WorkingPlane = 'XY' | 'XZ' | 'YZ';

/** The coordinate across a working plane: the one its nodes all share. */
const across = (plane: WorkingPlane, p: { x: number; y: number; z?: number }) =>
  plane === 'XY' ? (p.z ?? 0) : plane === 'XZ' ? p.y : p.x;

/**
 * The node a space node-tool click lands on, or null to place one at `p`, a point on the working
 * plane. The node drawn under the cursor counts when it is on that plane: seen in plan, the column
 * top drawn over the spot where its foot goes was taken for the click, and a node could never be
 * placed below another. Otherwise, a node at the placement point itself (the snap can land on one).
 */
export function nodeAtPlacement3D(
  hit: number | null, p: { x: number; y: number; z: number }, plane: WorkingPlane, nodes: Map<number, NodeLike>,
): number | null {
  const h = hit !== null ? nodes.get(hit) : undefined;
  if (h && Math.abs(across(plane, h) - across(plane, p)) <= NODE_PLACEMENT_TOL) return h.id;
  return findCoincidentNode(nodes.values(), p.x, p.y, p.z, NODE_PLACEMENT_TOL);
}

/*
 * ── Where a plane node-tool click puts its node ───────────────────────
 *
 * The node tool creates nodes and nothing else. It used to take a click within 25 px of a node
 * as "select that node and drag it", so a node could not be placed near another (between two
 * props close together on a wall, say): the press grabbed the neighbour. Now only a click right on
 * a node (a few pixels) is "there is already one here", and it does nothing; anywhere else a node
 * is made: on a member, splitting it, or free.
 */

/** A click this close to a node, on the screen, is a click on it. */
export const ON_NODE_PX = 7;
/** A click this close to a member, on the screen, places the node on it. */
export const ON_MEMBER_PX = 12;
/** A node placed on a member keeps at least this far from its ends, on the screen. */
export const MIN_SPLIT_PX = 6;

export type NodePlacement =
  | { kind: 'onNode'; nodeId: number; x: number; y: number }
  | { kind: 'onMember'; elementId: number; t: number; x: number; y: number; midpoint: boolean }
  | { kind: 'free'; x: number; y: number };

interface P2 { x: number; y: number }

/**
 * Resolve a node-tool click in the plane (world coordinates, `pxPerM` the zoom).
 * `snapped` is the cursor on the grid when grid snap is on, the cursor itself when off.
 */
export function resolveNodePlacement2D(a: {
  cursor: P2;
  snapped: P2;
  pxPerM: number;
  nodes: Iterable<{ id: number; x: number; y: number }>;
  members: Iterable<{ id: number; nodeI: number; nodeJ: number }>;
  nodeAt: (id: number) => P2 | undefined;
  /** Split a member the node lands on (the "split on node" setting). */
  split: boolean;
}): NodePlacement {
  const px = (m: number) => m * a.pxPerM;
  // Right on a node: there is one already.
  let best: { id: number; d: number; x: number; y: number } | null = null;
  for (const n of a.nodes) {
    const d = Math.hypot(n.x - a.cursor.x, n.y - a.cursor.y);
    if (!best || d < best.d) best = { id: n.id, d, x: n.x, y: n.y };
  }
  if (best && px(best.d) <= ON_NODE_PX) return { kind: 'onNode', nodeId: best.id, x: best.x, y: best.y };

  // On a member: the nearest one within reach, at the foot of the perpendicular.
  function memberAt(p: P2, tolerance: number) {
    let nearest: { id: number; t: number; L: number; i: P2; j: P2; d: number } | null = null;
    for (const m of a.members) {
      const i = a.nodeAt(m.nodeI), j = a.nodeAt(m.nodeJ);
      if (!i || !j) continue;
      const dx = j.x - i.x, dy = j.y - i.y, L2 = dx * dx + dy * dy;
      if (L2 < 1e-12) continue;
      const t = ((p.x - i.x) * dx + (p.y - i.y) * dy) / L2;
      if (t < 0 || t > 1) continue;
      const d = Math.hypot(i.x + t * dx - p.x, i.y + t * dy - p.y);
      if (d <= tolerance && (!nearest || d < nearest.d)) nearest = { id: m.id, t, L: Math.sqrt(L2), i, j, d };
    }
    return nearest;
  }
  let onM = memberAt(a.cursor, ON_MEMBER_PX / a.pxPerM);
  if (!onM && a.split) {
    // Grid snap can land on a member even when the cursor was outside its pick radius.
    // Reuse a node already at that point before trying to split the member.
    for (const n of a.nodes) {
      if (Math.hypot(n.x - a.snapped.x, n.y - a.snapped.y) <= NODE_PLACEMENT_TOL) return { kind: 'onNode', nodeId: n.id, x: n.x, y: n.y };
    }
    onM = memberAt(a.snapped, Math.min(NODE_PLACEMENT_TOL, 1 / a.pxPerM));
  }
  if (onM && a.split) {
    const { i, j, L } = onM;
    const dx = j.x - i.x, dy = j.y - i.y;
    // The midpoint pulls; otherwise the point snapped (to the grid) projected on the member.
    const midReach = ON_MEMBER_PX / Math.max(a.pxPerM * L, 1e-9);
    let t = Math.abs(onM.t - 0.5) <= midReach ? 0.5 : ((a.snapped.x - i.x) * dx + (a.snapped.y - i.y) * dy) / (L * L);
    const midpoint = t === 0.5;
    const minT = Math.max(0.01, MIN_SPLIT_PX / Math.max(px(L), 1e-9));
    if (t < minT || t > 1 - minT) {
      // Too close to an end to split: the end node is where the click is.
      const endId = t < 0.5 ? findIdAt(a.nodes, i) : findIdAt(a.nodes, j);
      if (endId !== null) { const e = t < 0.5 ? i : j; return { kind: 'onNode', nodeId: endId, x: e.x, y: e.y }; }
      t = Math.min(1 - minT, Math.max(minT, t));
    }
    return { kind: 'onMember', elementId: onM.id, t, x: i.x + t * dx, y: i.y + t * dy, midpoint };
  }

  // Free: on the grid (or the cursor), unless a node is already exactly there.
  for (const n of a.nodes) {
    if (Math.hypot(n.x - a.snapped.x, n.y - a.snapped.y) <= NODE_PLACEMENT_TOL) return { kind: 'onNode', nodeId: n.id, x: n.x, y: n.y };
  }
  return { kind: 'free', x: a.snapped.x, y: a.snapped.y };
}

function findIdAt(nodes: Iterable<{ id: number; x: number; y: number }>, p: P2): number | null {
  for (const n of nodes) if (Math.abs(n.x - p.x) < 1e-9 && Math.abs(n.y - p.y) < 1e-9) return n.id;
  return null;
}

interface P3 { x: number; y: number; z: number }

export type NodePlacement3D =
  | { kind: 'onNode'; nodeId: number; sx: number; sy: number }
  | { kind: 'onMember'; elementId: number; t: number; midpoint: boolean; sx: number; sy: number; a: P2; b: P2 }
  | { kind: 'free'; p: P3; sx: number; sy: number; snap?: { mode?: string; label?: string } };

/**
 * What a space node-tool click does, as in the plane (`resolveNodePlacement2D`), read on the
 * screen: right on a drawn node, nothing; on a drawn member, a node splitting it where the pointer
 * ray passes closest (on the grid along it, for a member in the working plane); elsewhere a new
 * node on the working plane, unless one is already exactly there.
 *
 * Two cases the screen alone gets wrong:
 * - A node drawn under the cursor on another level (a column top seen in plan) is not the click.
 *   What is under it on the working plane is: a member there is still split. Placed free, the new
 *   node sat on the member without cutting it: it looked joined and was analysed as a cut.
 * - A cut that lands within a few pixels of a member's end (the grid snaps onto the end node) is
 *   that end node, as in the plane: the store does not cut a member at its very end, and the hint
 *   promised a split that never came.
 */
export function resolveNodePlacement3D(a: {
  cursor: P2;
  /** The drawn nodes, on the screen. */
  nodes: Array<{ id: number; x: number; y: number }>;
  members: Array<{ id: number; nodeI: number; nodeJ: number }>;
  /** A node's position on the screen. */
  nodeAt: (id: number) => P2 | undefined;
  split: boolean;
  /** The model's nodes, in space. */
  model: Map<number, NodeLike>;
  plane: WorkingPlane;
  /** The working plane's level: the coordinate across it. */
  planeLevel: number;
  /** The pointer on the working plane; null when it misses it. */
  ground: P3 | null;
  /** A point on the working plane put on the grid and the structure's snaps. */
  snap: (p: P3) => P3;
  /** Where on member AB the pointer ray passes closest (`memberParamOnRay`). */
  rayParam: (A: P3, B: P3) => number | null;
  project: (p: P3) => P2;
}): NodePlacement3D | null {
  const resolve = (nodes: Array<{ id: number; x: number; y: number }>) => resolveNodePlacement2D({
    cursor: a.cursor, snapped: a.cursor, pxPerM: 1, nodes, members: a.members, nodeAt: a.nodeAt, split: a.split,
  });
  let place = resolve(a.nodes);
  if (place.kind === 'onNode') {
    if (!a.ground || nodeAtPlacement3D(place.nodeId, a.ground, a.plane, a.model) === place.nodeId) {
      return { kind: 'onNode', nodeId: place.nodeId, sx: place.x, sy: place.y };
    }
    // Drawn over the cursor from another level: the click is read without the nodes off the
    // working plane there, so a member under them is still found.
    const level = across(a.plane, a.ground);
    const offPlaneHere = (n: { id: number; x: number; y: number }) => {
      const m = a.model.get(n.id);
      return !!m && Math.hypot(n.x - a.cursor.x, n.y - a.cursor.y) <= ON_NODE_PX && Math.abs(across(a.plane, m) - level) > NODE_PLACEMENT_TOL;
    };
    place = resolve(a.nodes.filter((n) => !offPlaneHere(n)));
  }
  if (place.kind === 'onMember') {
    const id = place.elementId;
    const el = a.members.find((m) => m.id === id);
    const A = el && a.model.get(el.nodeI), B = el && a.model.get(el.nodeJ);
    const sa = el && a.nodeAt(el.nodeI), sb = el && a.nodeAt(el.nodeJ);
    if (!el || !A || !B || !sa || !sb) return null;
    const a3 = { x: A.x, y: A.y, z: A.z ?? 0 }, b3 = { x: B.x, y: B.y, z: B.z ?? 0 };
    let t = 0.5;
    if (!place.midpoint) {
      const inPlane = Math.abs(across(a.plane, a3) - a.planeLevel) < 1e-6 && Math.abs(across(a.plane, b3) - a.planeLevel) < 1e-6;
      const L2 = (b3.x - a3.x) ** 2 + (b3.y - a3.y) ** 2 + (b3.z - a3.z) ** 2;
      if (inPlane && a.ground && L2 > 1e-12) {
        const g = a.snap(a.ground);
        t = ((g.x - a3.x) * (b3.x - a3.x) + (g.y - a3.y) * (b3.y - a3.y) + (g.z - a3.z) * (b3.z - a3.z)) / L2;
      } else {
        t = a.rayParam(a3, b3) ?? place.t;
      }
      // Kept off the ends by a few pixels, like the plane: nearer, the click is the end node.
      const minT = Math.max(0.01, MIN_SPLIT_PX / Math.max(Math.hypot(sb.x - sa.x, sb.y - sa.y), 1e-9));
      if (t <= minT || t >= 1 - minT) {
        const end = t < 0.5 ? el.nodeI : el.nodeJ, s = t < 0.5 ? sa : sb;
        return { kind: 'onNode', nodeId: end, sx: s.x, sy: s.y };
      }
    }
    const p = a.project({ x: a3.x + t * (b3.x - a3.x), y: a3.y + t * (b3.y - a3.y), z: a3.z + t * (b3.z - a3.z) });
    return { kind: 'onMember', elementId: el.id, t, midpoint: place.midpoint, sx: p.x, sy: p.y, a: sa, b: sb };
  }
  if (place.kind === 'onNode') return { kind: 'onNode', nodeId: place.nodeId, sx: place.x, sy: place.y };
  if (!a.ground) return null;
  const snapped = a.snap(a.ground);
  const there = nodeAtPlacement3D(null, snapped, a.plane, a.model);
  const s = a.project(snapped);
  if (there !== null) return { kind: 'onNode', nodeId: there, sx: s.x, sy: s.y };
  const how = snapped as P3 & { mode?: string; label?: string };
  return { kind: 'free', p: snapped, sx: s.x, sy: s.y, ...(how.mode || how.label ? { snap: { mode: how.mode, label: how.label } } : {}) };
}

/**
 * Where on member AB (0 at A, 1 at B) a pointer ray passes closest: the point a space node-tool
 * click on the member means. The screen position along the drawn member is not it, under a
 * perspective camera. Null for a ray along the member.
 */
export function memberParamOnRay(origin: P3, dir: P3, A: P3, B: P3): number | null {
  const d2 = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
  const r = { x: A.x - origin.x, y: A.y - origin.y, z: A.z - origin.z };
  const dot = (u: P3, v: P3) => u.x * v.x + u.y * v.y + u.z * v.z;
  const a = dot(dir, dir), b = dot(dir, d2), c = dot(d2, d2), d = dot(dir, r), e = dot(d2, r);
  const den = a * c - b * b;
  if (Math.abs(den) <= 1e-12 * Math.max(a * c, 1e-30)) return null;
  return (b * d - a * e) / den;
}
