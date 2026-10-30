/**
 * Where on a member a click puts the section: the click projected on the member, onto an end or
 * the midpoint when within `tol` of it, else rounded to the centimetre.
 */
export function sectionAt(
  click: { x: number; y: number }, ni: { x: number; y: number }, nj: { x: number; y: number }, tol: number,
): number {
  const dx = nj.x - ni.x, dy = nj.y - ni.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return 0;
  const x = Math.max(0, Math.min(L, ((click.x - ni.x) * dx + (click.y - ni.y) * dy) / L));
  for (const snap of [0, L, L / 2]) if (Math.abs(x - snap) <= tol) return snap / L;
  return Math.round(x * 100) / 100 / L;
}

/** A typed position x (m) as t ∈ [0, 1], or null when it is outside the member. */
export function positionToT(x: number, L: number): number | null {
  if (!Number.isFinite(x) || L <= 0) return null;
  if (x < -1e-9 || x > L + 1e-9) return null;
  return Math.max(0, Math.min(1, x / L));
}

/**
 * The member on the other side of an end node that continues this one in a straight line, and
 * the same section read in it (its own end at that node), or null.
 */
export function otherSideOf(
  elementId: number, t: number,
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number; type: string }>,
  nodes: ReadonlyMap<number, { x: number; y: number }>,
): { elementId: number; t: number } | null {
  if (t > 1e-9 && t < 1 - 1e-9) return null;
  const e = elements.get(elementId);
  if (!e) return null;
  const node = t < 0.5 ? e.nodeI : e.nodeJ;
  const far = t < 0.5 ? e.nodeJ : e.nodeI;
  const n0 = nodes.get(node), n1 = nodes.get(far);
  if (!n0 || !n1) return null;
  const ux = n1.x - n0.x, uy = n1.y - n0.y;
  const lu = Math.hypot(ux, uy);
  for (const o of elements.values()) {
    if (o.id === elementId || o.type !== e.type || (o.nodeI !== node && o.nodeJ !== node)) continue;
    const ofar = nodes.get(o.nodeI === node ? o.nodeJ : o.nodeI);
    if (!ofar) continue;
    const vx = ofar.x - n0.x, vy = ofar.y - n0.y;
    const lv = Math.hypot(vx, vy);
    if (lu < 1e-12 || lv < 1e-12) continue;
    const cos = (ux * vx + uy * vy) / (lu * lv);
    if (cos < -1 + 1e-6) return { elementId: o.id, t: o.nodeI === node ? 0 : 1 };
  }
  return null;
}
