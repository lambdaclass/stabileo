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
