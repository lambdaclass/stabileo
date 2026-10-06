/**
 * The axes a member's local loads are stated in, as the user sees and types them: the member's
 * own local-Y reference if it has one, its roll plus the section's rotation, and the chosen
 * axis convention. A point load on a member (`pointOnElement3d`) is drawn along these
 * (viewport3d/scene-sync.ts) and made along them from a global direction (Viewport3D's load
 * tool), so both read them here.
 */
import { computeLocalAxes3D, type LocalAxes3D } from '../engine/local-axes-3d';

interface AxesNode { x: number; y: number; z?: number }
interface AxesMember {
  nodeI: number; nodeJ: number; sectionId: number;
  localYx?: number; localYy?: number; localYz?: number; rollAngle?: number;
}

export function memberLoadAxes(
  elem: AxesMember,
  nodes: ReadonlyMap<number, AxesNode>,
  sections: ReadonlyMap<number, { rotation?: number }>,
  leftHand: boolean,
): LocalAxes3D | null {
  const nI = nodes.get(elem.nodeI), nJ = nodes.get(elem.nodeJ);
  if (!nI || !nJ) return null;
  const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
    ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
  try {
    return computeLocalAxes3D(
      { id: 0, x: nI.x, y: nI.y, z: nI.z ?? 0 },
      { id: 0, x: nJ.x, y: nJ.y, z: nJ.z ?? 0 },
      localY,
      (elem.rollAngle ?? 0) + (sections.get(elem.sectionId)?.rotation ?? 0),
      leftHand,
    );
  } catch {
    return null;
  }
}

/**
 * A global force on a member point as the member's local transverse components (py, pz), or
 * null when part of it runs along the member: a point load on a member carries no axial part
 * here, so that part would be lost.
 */
export function globalToMemberTransverse(force: [number, number, number], axes: LocalAxes3D): { py: number; pz: number } | null {
  const dot = (v: [number, number, number]) => force[0] * v[0] + force[1] * v[1] + force[2] * v[2];
  const mag = Math.hypot(force[0], force[1], force[2]);
  if (!(mag > 0)) return null;
  if (Math.abs(dot(axes.ex)) > 1e-6 * mag) return null;
  return { py: dot(axes.ey), pz: dot(axes.ez) };
}
