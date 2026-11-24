/** The support types PRO offers, 3D or 2D, with their labels: one list for every editor. */
import type { SupportType } from '../store/model.svelte';
import { twoD } from '../axes/display';
import { userPlane, type Plane } from '../axes/typed-frame';

const planeIn = (s: string) => s.replace(/\b(XY|XZ|YZ)\b/, (m) => userPlane(m as Plane));

export function supportTypeOptions(is3D: boolean, t: (k: string) => string): Array<{ value: SupportType; label: string }> {
  return is3D ? [
    { value: 'fixed3d', label: t('pro.fixed3d') },
    { value: 'pinned3d', label: t('pro.pinned3d') },
    { value: 'rollerXZ', label: planeIn(t('pro.rollerXZ')) },
    { value: 'rollerXY', label: planeIn(t('pro.rollerXY')) },
    { value: 'rollerYZ', label: planeIn(t('pro.rollerYZ')) },
    { value: 'spring3d', label: t('pro.spring3d') },
    { value: 'custom3d', label: t('pro.custom3d') },
  ] : [
    { value: 'fixed', label: t('pro.fixed') },
    { value: 'pinned', label: t('pro.pinned') },
    { value: 'rollerX', label: t('pro.rollerX').replace(/\bX\b/, twoD.horizontal) },
    { value: 'rollerZ', label: t('pro.rollerY').replace(/\bY\b/, twoD.vertical) },
    { value: 'spring', label: t('pro.spring') },
  ];
}
