/**
 * Foundation springs: a slab or raft on the ground as vertical springs at its nodes, k = ks · A,
 * with A the area each node takes of the shells around it (a quadrilateral gives a quarter of
 * its area to each corner, a triangle a third). ks is the Winkler subgrade modulus, kN/m³, from
 * the project's soil profile or typed.
 *
 * Pure: no store.
 */

type P = { x: number; y: number; z?: number };

function polyArea(pts: P[]): number {
  // Area of a planar polygon in space: half the norm of the summed cross products.
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const az = a.z ?? 0, bz = b.z ?? 0;
    cx += a.y * bz - az * b.y;
    cy += az * b.x - a.x * bz;
    cz += a.x * b.y - a.y * b.x;
  }
  return Math.hypot(cx, cy, cz) / 2;
}

/** The area each node takes of the given shells, m². */
export function tributaryAreas(
  nodes: Map<number, P>,
  shells: Array<{ nodes: number[] }>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of shells) {
    const pts = s.nodes.map((id) => nodes.get(id)).filter((p): p is P => !!p);
    if (pts.length !== s.nodes.length || pts.length < 3) continue;
    const share = polyArea(pts) / s.nodes.length;
    for (const id of s.nodes) out.set(id, (out.get(id) ?? 0) + share);
  }
  return out;
}

export interface FoundationSpring { nodeId: number; area: number; kz: number }

export function foundationSprings(areas: Map<number, number>, ksKNm3: number): FoundationSpring[] {
  return [...areas].filter(([, a]) => a > 0).map(([nodeId, area]) => ({ nodeId, area, kz: ksKNm3 * area }));
}
