// Read-only 3D preview of an analytical member offset:
//   - ghost reference line along the node centerline (where the member "is" topologically)
//   - the offset analytical member line (where it now acts)
//   - rigid arms connecting each offset end back to its joint node
// Purely visual; tied to element offset metadata. Excluded from raycasting.

import * as THREE from 'three';

export type V3 = { x: number; y: number; z: number };

const C_GHOST = 0x5a6a86;  // dim — original centerline
const C_OFFSET = 0x4ecdc4; // teal — offset analytical line
const C_ARM = 0xffae42;    // amber — rigid arm

function line(a: V3, b: V3, color: number, opacity = 1): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z),
  ]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  const l = new THREE.Line(geo, mat);
  l.raycast = () => {};
  l.renderOrder = 3;
  return l;
}

/**
 * Build the offset preview for one member. `offI`/`offJ` are world offset
 * vectors at each end (null = that end is not offset).
 */
export function createMemberOffsetViz(pI: V3, pJ: V3, offI: V3 | null, offJ: V3 | null): THREE.Group {
  const g = new THREE.Group();
  g.name = 'memberOffsetViz';
  const aI: V3 = { x: pI.x + (offI?.x ?? 0), y: pI.y + (offI?.y ?? 0), z: pI.z + (offI?.z ?? 0) };
  const aJ: V3 = { x: pJ.x + (offJ?.x ?? 0), y: pJ.y + (offJ?.y ?? 0), z: pJ.z + (offJ?.z ?? 0) };
  g.add(line(pI, pJ, C_GHOST, 0.5));   // original centerline (ghost)
  g.add(line(aI, aJ, C_OFFSET));        // offset analytical member
  if (offI) g.add(line(pI, aI, C_ARM)); // rigid arm at I
  if (offJ) g.add(line(pJ, aJ, C_ARM)); // rigid arm at J
  return g;
}
