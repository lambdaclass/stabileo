/**
 * The 3D support the support tool describes, placed on one node.
 *
 * Shared by the viewport's support tool and the context menu's "Add support",
 * so both place the same thing. The menu used to call the 2D path, whose
 * default 'pinned' restrains ux, uy, uz, rx and ry in a space model — nearly a
 * fixed end.
 */
import { modelStore, uiStore } from '.';
import type { SupportType } from './model.svelte';

export function addSupportFromTool3D(nodeId: number): number {
  const dofRestraints = {
    tx: uiStore.sup3dTx, ty: uiStore.sup3dTy, tz: uiStore.sup3dTz,
    rx: uiStore.sup3dRx, ry: uiStore.sup3dRy, rz: uiStore.sup3dRz,
  };
  const allFixed = Object.values(dofRestraints).every(Boolean);
  const onlyTrans = dofRestraints.tx && dofRestraints.ty && dofRestraints.tz
    && !dofRestraints.rx && !dofRestraints.ry && !dofRestraints.rz;
  const noneFixed = !Object.values(dofRestraints).some(Boolean);
  const type: SupportType = allFixed ? 'fixed3d' : onlyTrans ? 'pinned3d' : noneFixed ? 'spring3d' : 'custom3d';

  // Springs on the unrestrained DOFs that have a stiffness.
  const candidates: Array<[keyof typeof dofRestraints, 'kx' | 'ky' | 'kz' | 'krx' | 'kry' | 'krz', number]> = [
    ['tx', 'kx', uiStore.sup3dKx], ['ty', 'ky', uiStore.sup3dKy], ['tz', 'kz', uiStore.sup3dKz],
    ['rx', 'krx', uiStore.sup3dKrx], ['ry', 'kry', uiStore.sup3dKry], ['rz', 'krz', uiStore.sup3dKrz],
  ];
  const active = candidates.filter(([dof, , k]) => !dofRestraints[dof] && k > 0);
  const springs = active.length > 0 || noneFixed
    ? Object.fromEntries(active.map(([, key, k]) => [key, k]))
    : undefined;

  return modelStore.addSupport(nodeId, type, springs, { dofRestraints, dofFrame: uiStore.supportFrame3D } as any);
}
