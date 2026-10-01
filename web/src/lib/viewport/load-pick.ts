/**
 * Which load a click lands on.
 *
 * The 3D viewport draws every load into one batch, so there is no object per load to raycast.
 * The batch records the world segments each load drew (shafts, envelopes, outlines); this
 * measures the click against them on screen and takes the nearest, within a tolerance in pixels.
 * A click on the arrow is what a user aims at, so the arrow is what is measured, not the node or
 * the member the load sits on.
 */
export function pickLoadAt(
  px: number,
  py: number,
  footprints: ReadonlyMap<number, readonly number[]>,
  toScreen: (x: number, y: number, z: number) => { x: number; y: number },
  tolerance = 10,
  /**
   * Loads that act at a point (nodal, point on a member). At a joint the first arrow of a
   * distributed load lands on the same spot as a nodal load there; a click on that spot means
   * the load that acts at it, so within `TIE` pixels these win.
   */
  pointLoads: ReadonlySet<number> = new Set(),
): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const [id, f] of footprints) {
    let d = Infinity;
    for (let i = 0; i + 5 < f.length; i += 6) {
      const a = toScreen(f[i]!, f[i + 1]!, f[i + 2]!);
      const b = toScreen(f[i + 3]!, f[i + 4]!, f[i + 5]!);
      d = Math.min(d, distanceToSegment(px, py, a.x, a.y, b.x, b.y));
    }
    if (d > tolerance) continue;
    const beats = best === null
      || (pointLoads.has(id) && !pointLoads.has(best) ? d <= bestD + TIE
        : !pointLoads.has(id) && pointLoads.has(best) ? d < bestD - TIE
        : d < bestD);
    if (beats) { best = id; bestD = d; }
  }
  return best;
}

const TIE = 2;

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
