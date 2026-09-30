/**
 * Nodes that lie on a member, away from its ends, without the member being cut there.
 *
 * Such a node looks connected on screen and is not: the member runs past it. It is the usual
 * way a first model ends up in pieces (a scaffold drawn with each post as one member and its
 * ledgers and braces ending on the posts), and the solve then reports a disconnected structure
 * or a mechanism. `splitAtNodes` (Edit › Cut) cuts the members at these nodes; the solve's
 * messages name the command when there are any.
 *
 * Pure: it reads positions and connectivity only.
 */
export const ON_MEMBER_TOL = 1e-4;
/** A node this close to an end, as a fraction of the length, is the end. */
const END_T = 1e-6;

type P = { x: number; y: number; z?: number };

/** Every (member, node, t) where the node lies on the member's interior. */
export function nodesOnMembers(
  nodes: ReadonlyMap<number, P>,
  elements: Iterable<{ id: number; nodeI: number; nodeJ: number }>,
  opts: { elementIds?: ReadonlySet<number>; nodeIds?: Iterable<number>; tol?: number } = {},
): Array<{ elementId: number; nodeId: number; t: number }> {
  const tol = opts.tol ?? ON_MEMBER_TOL;
  const candidates = opts.nodeIds ? [...opts.nodeIds] : [...nodes.keys()];
  const out: Array<{ elementId: number; nodeId: number; t: number }> = [];
  for (const e of elements) {
    if (opts.elementIds && !opts.elementIds.has(e.id)) continue;
    const A = nodes.get(e.nodeI), B = nodes.get(e.nodeJ);
    if (!A || !B) continue;
    const a = [A.x, A.y, A.z ?? 0], b = [B.x, B.y, B.z ?? 0];
    const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const L2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    if (!(L2 > 0)) continue;
    const lo = a.map((v, i) => Math.min(v, b[i]!) - tol), hi = a.map((v, i) => Math.max(v, b[i]!) + tol);
    for (const nid of candidates) {
      if (nid === e.nodeI || nid === e.nodeJ) continue;
      const n = nodes.get(nid);
      if (!n) continue;
      const p = [n.x, n.y, n.z ?? 0];
      if (p.some((v, i) => v < lo[i]! || v > hi[i]!)) continue;
      const t = ((p[0]! - a[0]!) * ab[0]! + (p[1]! - a[1]!) * ab[1]! + (p[2]! - a[2]!) * ab[2]!) / L2;
      const q = [a[0]! + t * ab[0]!, a[1]! + t * ab[1]!, a[2]! + t * ab[2]!];
      const dist = Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
      if (dist <= tol && t > END_T && t < 1 - END_T) out.push({ elementId: e.id, nodeId: nid, t });
    }
  }
  return out;
}
