/**
 * A 3D support from its restraints: which degrees of freedom are held, and the springs on the
 * free ones. Pure: no store.
 */
import type { Support, SupportType } from '../store/model.svelte';
import { supportDofs3D } from '../engine/support-dofs-3d';

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

/** The named 3D support types whose restraints follow from the type alone. */
const TYPES_3D: ReadonlySet<SupportType> = new Set<SupportType>(['fixed3d', 'pinned3d', 'rollerXZ', 'rollerXY', 'rollerYZ', 'spring3d']);

export function is3DSupportType(type: SupportType): boolean {
  return TYPES_3D.has(type);
}

/** The degrees of freedom a named 3D support type holds (the solver's own mapping). */
export function dofRestraintsOfType3D(type: SupportType): Record<Dof3D, boolean> {
  const d = supportDofs3D({ type } as Support);
  return { tx: d.rx, ty: d.ry, tz: d.rz, rx: d.rrx, ry: d.rry, rz: d.rrz };
}

export function hasYRollerMaskOnZRoller(support: Support): boolean {
  const { type, dofRestraints } = support;
  if (type !== 'rollerZ' || !dofRestraints) return false;
  const yRoller = dofRestraintsOfType3D('rollerY');
  return DOF_SPRING.every(([dof]) => dofRestraints[dof] === yRoller[dof]);
}

type SupportConfiguration = Pick<Support, 'dofRestraints' | 'dofFrame' | 'dofLocalElementId'>;

export function supportConfiguration(
  edit: SupportConfiguration,
  base?: SupportConfiguration | SupportType,
): SupportConfiguration {
  const inherited = typeof base === 'object' ? base : undefined;
  const preset = typeof base === 'string' && base.startsWith('roller') && base !== 'rollerZ' && !edit.dofRestraints
    ? base : undefined;
  const restraints = edit.dofRestraints ?? (preset ? dofRestraintsOfType3D(preset) : inherited?.dofRestraints);
  const reference = edit.dofFrame === 'global' ? undefined
    : 'dofLocalElementId' in edit ? edit.dofLocalElementId : inherited?.dofLocalElementId;
  const frame = 'dofFrame' in edit ? edit.dofFrame
    : preset && reference === undefined ? 'global' : inherited?.dofFrame;
  return {
    ...(restraints ? { dofRestraints: { ...restraints } } : {}),
    ...(frame !== undefined ? { dofFrame: frame } : {}),
    ...(reference !== undefined ? { dofLocalElementId: reference } : {}),
  };
}

export function supportIsLocal(support: { dofFrame?: string; dofLocalElementId?: number }): boolean {
  return support.dofFrame === 'local' || support.dofLocalElementId !== undefined;
}
