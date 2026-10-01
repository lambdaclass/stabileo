/**
 * What a click meant when its ray hit nothing: the nearest node or member on the screen,
 * within a few pixels.
 *
 * Members are picked by an invisible cylinder 0,15 m in radius, and nodes by their sphere. On a
 * building framed whole, that cylinder is a pixel or two wide, so a click that a reader would
 * call "on the beam" passes beside it and clears the selection. Measured on the screen instead,
 * the tolerance is the same at every zoom. The ray is still asked first, so what it hits wins.
 *
 * Pure: the caller supplies the projection to screen pixels.
 */
export type Project = (x: number, y: number, z: number) => { x: number; y: number } | null;

type P = { x: number; y: number; z?: number };

/** Distance from (px, py) to the segment a–b, in pixels. */
function toSegment(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L2));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/** The node drawn nearest (px, py), if within `tol` pixels. */
export function nodeNearPointer(
  px: number, py: number, nodes: Iterable<P & { id: number }>, project: Project, tol: number,
): number | null {
  let best: { id: number; d: number } | null = null;
  for (const n of nodes) {
    const s = project(n.x, n.y, n.z ?? 0);
    if (!s) continue;
    const d = Math.hypot(px - s.x, py - s.y);
    if (d <= tol && (!best || d < best.d)) best = { id: n.id, d };
  }
  return best?.id ?? null;
}

/** The member drawn nearest (px, py), if within `tol` pixels. */
export function memberNearPointer(
  px: number, py: number,
  members: Iterable<{ id: number; nodeI: number; nodeJ: number }>,
  nodeAt: (id: number) => P | undefined, project: Project, tol: number,
): number | null {
  let best: { id: number; d: number } | null = null;
  for (const m of members) {
    const a = nodeAt(m.nodeI), b = nodeAt(m.nodeJ);
    if (!a || !b) continue;
    const sa = project(a.x, a.y, a.z ?? 0), sb = project(b.x, b.y, b.z ?? 0);
    if (!sa || !sb) continue;
    const d = toSegment(px, py, sa, sb);
    if (d <= tol && (!best || d < best.d)) best = { id: m.id, d };
  }
  return best?.id ?? null;
}
