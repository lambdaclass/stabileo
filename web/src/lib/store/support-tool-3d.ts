import { modelFlags } from '../axes/display';
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
  const global = uiStore.supportFrame3D !== 'local';
  const t = global ? modelFlags(uiStore.sup3dTx, uiStore.sup3dTy, uiStore.sup3dTz) : [uiStore.sup3dTx, uiStore.sup3dTy, uiStore.sup3dTz];
  const r = global ? modelFlags(uiStore.sup3dRx, uiStore.sup3dRy, uiStore.sup3dRz) : [uiStore.sup3dRx, uiStore.sup3dRy, uiStore.sup3dRz];
  const k = global ? modelFlags(uiStore.sup3dKx, uiStore.sup3dKy, uiStore.sup3dKz) : [uiStore.sup3dKx, uiStore.sup3dKy, uiStore.sup3dKz];
  const kr = global ? modelFlags(uiStore.sup3dKrx, uiStore.sup3dKry, uiStore.sup3dKrz) : [uiStore.sup3dKrx, uiStore.sup3dKry, uiStore.sup3dKrz];
  const s = support3DFrom(
    { tx: t[0], ty: t[1], tz: t[2], rx: r[0], ry: r[1], rz: r[2] },
    { kx: k[0], ky: k[1], kz: k[2], krx: kr[0], kry: kr[1], krz: kr[2] },
    uiStore.supportFrame3D,
  );
  return modelStore.addSupport(nodeId, s.type, s.springs, s.opts as any);
}
