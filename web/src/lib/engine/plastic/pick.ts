/**
 * Where a tap on the canvas puts a hinge of a user's mechanism: on the frame
 * member under it, at its nearer end when close to one (the end of that member,
 * so at a joint the member tapped is the one that turns), else at a point load,
 * a hinge the step-by-step analysis formed or the middle when one is near, else
 * where the tap was, to the centimetre.
 */
import type { SolverInput } from '../types';

export function pickHinge(
  input: SolverInput,
  at: { x: number; z: number },
  tol: number,
  snaps: Array<{ member: number; t: number }> = [],
): { member: number; t: number } | null {
  let best: { member: number; t: number; dist: number; L: number } | null = null;
  for (const e of input.elements.values()) {
    if (e.type === 'truss') continue;
    const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
    if (L2 < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.z - a.z) * dz) / L2));
    const dist = Math.hypot(a.x + dx * t - at.x, a.z + dz * t - at.z);
    if (dist <= tol && (!best || dist < best.dist)) best = { member: e.id, t, dist, L: Math.sqrt(L2) };
  }
  if (!best) return null;
  const { member, L } = best;
  let t = best.t;
  const endZone = Math.max(1.5 * tol, 0.12 * L) / L;
  if (t <= endZone) return { member, t: 0 };
  if (t >= 1 - endZone) return { member, t: 1 };
  const targets = [
    0.5,
    ...input.loads.filter((l) => l.type === 'pointOnElement' && l.data.elementId === member).map((l) => (l.data as { a: number }).a / L),
    ...snaps.filter((s) => s.member === member).map((s) => s.t),
  ].filter((v) => v > 0 && v < 1);
  const near = targets.map((v) => ({ v, d: Math.abs(v - t) * L })).sort((x, y) => x.d - y.d)[0];
  if (near && near.d <= 1.5 * tol) return { member, t: near.v };
  t = Math.round(t * L * 100) / 100 / L;
  return { member, t };
}
