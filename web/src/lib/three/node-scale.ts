/**
 * How big a node marker should be, given the model it sits in.
 *
 * ── The defect ──────────────────────────────────────────────────────
 *
 * `NodesInstanced` used a fixed `DEFAULT_RADIUS = 0.07` — a 7 cm sphere, whatever the model. On
 * a 2 m frame that is a ball a third the size of a member; on a 30 m industrial shed it is a
 * speck. The picking bench earlier in this branch measured the on-screen consequence across the
 * working zoom range: **8 px at one end and 144 px at the other**, for the same marker.
 *
 * ── What this does, and the constraint that shapes it ───────────────
 *
 * The radius is a fraction of the model's bounding-box diagonal, so a marker keeps the same
 * apparent weight whether the model is a truss or a shed.
 *
 * The floor is not an aesthetic choice. **`NodesInstanced` raycasts the visible mesh**, so the
 * marker IS the click target — shrinking it to look tidy shrinks what a user can hit. The floor
 * below is therefore a PICKING floor, and it is why this module cannot simply scale linearly and
 * stop there. The measured lesson from the same bench: a marker that reads as small is a
 * usability problem only when it is also the target.
 *
 * The ceiling exists for the opposite reason: on a 1 m detail model an unbounded fraction would
 * produce a sphere larger than the members it joins, which is the "esferas gigantes" complaint
 * this replaces.
 */

/** Fraction of the bounding-box diagonal. Tuned so a 20 m frame keeps roughly the old 7 cm. */
const DIAGONAL_FRACTION = 0.0025;

/**
 * Smallest radius, metres — a PICKING floor, not a visual one.
 *
 * `NodesInstanced` raycasts the visible geometry, so this is the smallest target a pointer can
 * reasonably hit on a large model. Below it, nodes stop being selectable before they stop being
 * visible, which is the worse of the two failures.
 */
export const MIN_NODE_RADIUS_M = 0.02;

/** Largest radius, metres. Above this the marker starts to hide the members meeting at it. */
export const MAX_NODE_RADIUS_M = 0.18;

export interface ModelExtent {
  /** Bounding-box diagonal of the model, metres. */
  diagonalM: number;
}

/**
 * The marker radius for a model, metres.
 *
 * A degenerate extent — one node, or a diagonal of zero — takes the floor rather than zero: a
 * model with a single node still has to show it.
 */
export function nodeRadiusFor(extent: ModelExtent): number {
  const d = extent.diagonalM;
  if (!Number.isFinite(d) || d <= 0) return MIN_NODE_RADIUS_M;
  return Math.min(MAX_NODE_RADIUS_M, Math.max(MIN_NODE_RADIUS_M, d * DIAGONAL_FRACTION));
}

/** Bounding-box diagonal of a set of points, metres. */
export function diagonalOf(points: ReadonlyArray<{ x: number; y: number; z?: number }>): number {
  if (points.length === 0) return 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    const z = p.z ?? 0;
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
}

/**
 * The radius to use while the section view is on.
 *
 * With the extruded profiles drawn, a full-size marker at every panel point buries the very
 * geometry the mode exists to show. Halved rather than hidden, and never below the picking
 * floor: a node that cannot be clicked in one mode and can in another is worse than a small one.
 */
export function nodeRadiusForSections(extent: ModelExtent): number {
  return Math.max(MIN_NODE_RADIUS_M, nodeRadiusFor(extent) * 0.5);
}
