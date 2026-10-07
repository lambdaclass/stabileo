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
  return pickLoadsAt(px, py, footprints, toScreen, tolerance, pointLoads)[0] ?? null;
}

/**
 * Every load within `tolerance` pixels, the one a click means first: nearest, with a point load
 * ahead of a distributed one within `TIE` pixels (see `pickLoadAt`). Two loads drawn on top of
 * each other (the same load added twice on a member) are both here, so a click again on the
 * same spot can reach the second (viewport/pick-cycle.ts).
 */
export function pickLoadsAt(
  px: number,
  py: number,
  footprints: ReadonlyMap<number, readonly number[]>,
  toScreen: (x: number, y: number, z: number) => { x: number; y: number },
  tolerance = 10,
  pointLoads: ReadonlySet<number> = new Set(),
): number[] {
  return pickLoadsWithDistance(px, py, footprints, toScreen, tolerance, pointLoads).map((h) => h.id);
}

/** `pickLoadsAt` with each load's distance on screen, in pixels, for comparing with members. */
export function pickLoadsWithDistance(
  px: number,
  py: number,
  footprints: ReadonlyMap<number, readonly number[]>,
  toScreen: (x: number, y: number, z: number) => { x: number; y: number },
  tolerance = 10,
  pointLoads: ReadonlySet<number> = new Set(),
  areas: ReadonlyMap<number, readonly (readonly number[])[]> = new Map(),
): { id: number; d: number }[] {
  const hits: { id: number; key: number; point: boolean; d: number }[] = [];
  /*
   * A load on a plate is also taken by a click on its fill: inside one of its faces on screen it
   * counts as at the tolerance, so an arrow or another load drawn under the pointer still wins.
   */
  const inFace = (id: number) => (areas.get(id) ?? []).some((f) => {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i + 2 < f.length; i += 3) pts.push(toScreen(f[i]!, f[i + 1]!, f[i + 2]!));
    return insidePolygon(px, py, pts);
  });
  const seen = new Set<number>();
  for (const [id, f] of footprints) {
    let d = Infinity;
    for (let i = 0; i + 5 < f.length; i += 6) {
      const a = toScreen(f[i]!, f[i + 1]!, f[i + 2]!);
      const b = toScreen(f[i + 3]!, f[i + 4]!, f[i + 5]!);
      d = Math.min(d, distanceToSegment(px, py, a.x, a.y, b.x, b.y));
    }
    if (d > tolerance && inFace(id)) d = tolerance;
    if (d > tolerance) continue;
    const point = pointLoads.has(id);
    seen.add(id);
    hits.push({ id, key: d - (point ? TIE : 0), point, d });
  }
  // A load that drew a face and no segment near the pointer (a slab temperature, only a tag).
  for (const id of areas.keys()) {
    if (seen.has(id) || !inFace(id)) continue;
    hits.push({ id, key: tolerance, point: false, d: tolerance });
  }
  return hits
    .sort((x, y) => x.key - y.key || Number(y.point) - Number(x.point) || x.id - y.id)
    .map((h) => ({ id: h.id, d: h.d }));
}

const TIE = 2;

/** Whether (px, py) is inside the polygon, by the even-odd rule. */
function insidePolygon(px: number, py: number, pts: ReadonlyArray<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!;
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
