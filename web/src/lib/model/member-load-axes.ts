/**
 * The axes a member's local loads are stated in, as the user sees and types them: the member's
 * own local-Y reference if it has one, its roll plus the section's rotation, and the chosen
 * axis convention. A point load on a member (`pointOnElement3d`) is drawn along these
 * (viewport3d/scene-sync.ts).
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

