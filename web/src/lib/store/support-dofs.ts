/**
 * Which degrees of freedom a 3D support type restrains, for a support that
 * carries no explicit per-DOF mask. The supports table and the Explore panel
 * both change a support's type and have to give it the matching mask.
 */
export interface DofRestraints { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean }

export function defaultDofs(type: string): DofRestraints {
  if (type === 'fixed3d' || type === 'fixed') return { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
  if (type === 'pinned3d' || type === 'pinned') return { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false };
  if (type === 'spring3d' || type === 'spring') return { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false };
  if (type === 'rollerXZ') return { tx: false, ty: true, tz: false, rx: false, ry: false, rz: false };
  if (type === 'rollerXY') return { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false };
  if (type === 'rollerYZ') return { tx: true, ty: false, tz: false, rx: false, ry: false, rz: false };
  return { tx: true, ty: true, tz: true, rx: true, ry: true, rz: true };
}
