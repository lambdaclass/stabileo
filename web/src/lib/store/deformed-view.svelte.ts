/**
 * How the static deformed shape is drawn.
 *
 *   · EXACT: each member bends along its length — Hermite on the end displacements and rotations
 *     plus the span loads' particular solution (`engine/member-deflection.ts`). This is what a
 *     simply supported beam needs to show any deflection at all.
 *   · QUICK: straight lines between the displaced nodes. On a large model it is far cheaper to
 *     build, and for reading how a structure sways it says the same thing.
 *
 * Displacement labels ride on "show values": when it is on, the nodes that moved most carry
 * their resultant displacement, and the labels stay in a PNG export because they are drawn in
 * the scene.
 */
let exact = $state(true);

export const deformedView = {
  get exact() { return exact; },
  set exact(v: boolean) { exact = v; },
};

/** At most this many displacement labels; the largest first. */
export const MAX_DISPLACEMENT_LABELS = 150;
/** Nodes that moved less than this fraction of the largest are not labelled. */
export const DISPLACEMENT_LABEL_FLOOR = 0.25;

/** Which nodes to label: those that moved at least a quarter of the most, the largest first. */
export function nodesToLabel(displacements: ReadonlyArray<{ nodeId: number; ux: number; uy: number; uz: number }>): Array<{ nodeId: number; magnitude: number }> {
  const all = displacements.map((d) => ({ nodeId: d.nodeId, magnitude: Math.hypot(d.ux, d.uy, d.uz) }));
  const max = all.reduce((m, d) => Math.max(m, d.magnitude), 0);
  if (!(max > 0)) return [];
  return all.filter((d) => d.magnitude >= DISPLACEMENT_LABEL_FLOOR * max)
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, MAX_DISPLACEMENT_LABELS);
}
