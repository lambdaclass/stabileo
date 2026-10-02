/**
 * A 3D support from its restraints: which degrees of freedom are held, and the springs on the
 * free ones. Pure: no store.
 */
import type { SupportType } from '../store/model.svelte';

export type Dof3D = 'tx' | 'ty' | 'tz' | 'rx' | 'ry' | 'rz';
export type SpringKey = 'kx' | 'ky' | 'kz' | 'krx' | 'kry' | 'krz';
/** Each degree of freedom and the spring constant that acts along it. */
export const DOF_SPRING: ReadonlyArray<readonly [Dof3D, SpringKey]> = [
  ['tx', 'kx'], ['ty', 'ky'], ['tz', 'kz'], ['rx', 'krx'], ['ry', 'kry'], ['rz', 'krz'],
];

/**
 * The support a set of restraints describes: fixed, pinned, springs only or custom, with a
 * spring on each free degree of freedom that has a stiffness. Basic's tool and PRO's drawing
 * draft both place supports through this.
 */
export function support3DFrom(
  dofRestraints: Record<Dof3D, boolean>,
  springsOnFree: Partial<Record<SpringKey, number>>,
  dofFrame: 'global' | 'local',
): { type: SupportType; springs?: Partial<Record<SpringKey, number>>; opts: { dofRestraints: Record<Dof3D, boolean>; dofFrame: 'global' | 'local' } } {
  const r = { ...dofRestraints };
  const allFixed = Object.values(r).every(Boolean);
  const onlyTrans = r.tx && r.ty && r.tz && !r.rx && !r.ry && !r.rz;
  const noneFixed = !Object.values(r).some(Boolean);
  const type: SupportType = allFixed ? 'fixed3d' : onlyTrans ? 'pinned3d' : noneFixed ? 'spring3d' : 'custom3d';
  const active = DOF_SPRING.filter(([dof, key]) => !r[dof] && (springsOnFree[key] ?? 0) > 0);
  const springs = active.length > 0 || noneFixed
    ? Object.fromEntries(active.map(([, key]) => [key, springsOnFree[key]!]))
    : undefined;
  return { type, springs, opts: { dofRestraints: r, dofFrame } };
}
