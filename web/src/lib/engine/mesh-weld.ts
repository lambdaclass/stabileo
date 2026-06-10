// Mesh ↔ frame node-sharing geometry helpers (PR [8] QA-B).
//
// Stabileo couples shells to beams ONLY through shared nodes. When the quick
// mesh generator runs it should (a) reuse any existing node that coincides with
// a generated mesh node — no duplicates — and (b) optionally split a beam that
// passes through a mesh node so the beam and shell SHARE that node and load
// transfers continuously along the edge. These are the pure geometry primitives
// behind both behaviours; the actual node-creation / element-splitting is done
// by the model store (splitElementAtPoint), so this module stays side-effect free
// and unit-testable.

export interface NodeLike { id: number; x: number; y: number; z?: number }
export interface ElemLike { id: number; nodeI: number; nodeJ: number }

export const WELD_TOL = 1e-4;

/** Id of an existing node coincident with (x,y,z) within tol, else null. */
export function findCoincidentNode(
  nodes: Iterable<NodeLike>, x: number, y: number, z: number, tol = WELD_TOL,
): number | null {
  for (const n of nodes) {
    if (Math.abs(n.x - x) < tol && Math.abs(n.y - y) < tol && Math.abs((n.z ?? 0) - z) < tol) {
      return n.id;
    }
  }
  return null;
}

/**
 * If a frame/truss element passes through (x,y,z) strictly between its ends,
 * return its id and the parameter t∈(0,1) of the projection, else null.
 * Endpoints (t≈0/1) are excluded — those are already shared, not a split site.
 */
export function beamThrough(
  nodeById: (id: number) => NodeLike | undefined,
  elements: Iterable<ElemLike>,
  x: number, y: number, z: number,
  posTol = 1e-3, endTol = 0.02,
): { id: number; t: number } | null {
  for (const el of elements) {
    const a = nodeById(el.nodeI), b = nodeById(el.nodeJ);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z ?? 0) - (a.z ?? 0);
    const L2 = dx * dx + dy * dy + dz * dz;
    if (L2 < 1e-12) continue;
    const t = ((x - a.x) * dx + (y - a.y) * dy + (z - (a.z ?? 0)) * dz) / L2;
    if (t <= endTol || t >= 1 - endTol) continue;
    const px = a.x + t * dx, py = a.y + t * dy, pz = (a.z ?? 0) + t * dz;
    if ((px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 < posTol * posTol) return { id: el.id, t };
  }
  return null;
}
