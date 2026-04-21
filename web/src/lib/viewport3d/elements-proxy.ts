// Flat vertex-position array for the orbit-time elements proxy (one batched
// LineSegments2 draw call instead of thousands of individual element meshes).
// Must project through the same XZ-upright mapping the rest of the scene uses,
// or a flat 2D model displayed upright on XZ would appear to "lie down" on XY
// during orbit.
import { projectNodeToScene, type CoordinateNode } from '../geometry/coordinate-system';

export function buildProxyPositions(
  elements: Iterable<{ nodeI: number; nodeJ: number }>,
  getNode: (id: number) => CoordinateNode | undefined,
  project2DToXZ: boolean,
): number[] {
  const positions: number[] = [];
  for (const el of elements) {
    const ni = getNode(el.nodeI);
    const nj = getNode(el.nodeJ);
    if (!ni || !nj) continue;
    const pi = projectNodeToScene(ni, project2DToXZ);
    const pj = projectNodeToScene(nj, project2DToXZ);
    positions.push(pi.x, pi.y, pi.z, pj.x, pj.y, pj.z);
  }
  return positions;
}
