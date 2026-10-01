/**
 * The 3D support the support tool describes, placed on one node.
 *
 * Shared by the viewport's support tool and the context menu's "Add support",
 * so both place the same thing. The menu used to call the 2D path, whose
 * default 'pinned' restrains ux, uy, uz, rx and ry in a space model — nearly a
 * fixed end.
 */
import { modelStore, uiStore } from '.';
import { support3DFrom } from '../model/support-3d';

export function addSupportFromTool3D(nodeId: number): number {
  const s = support3DFrom(
    { tx: uiStore.sup3dTx, ty: uiStore.sup3dTy, tz: uiStore.sup3dTz, rx: uiStore.sup3dRx, ry: uiStore.sup3dRy, rz: uiStore.sup3dRz },
    { kx: uiStore.sup3dKx, ky: uiStore.sup3dKy, kz: uiStore.sup3dKz, krx: uiStore.sup3dKrx, kry: uiStore.sup3dKry, krz: uiStore.sup3dKrz },
    uiStore.supportFrame3D,
  );
  return modelStore.addSupport(nodeId, s.type, s.springs, s.opts as any);
}
