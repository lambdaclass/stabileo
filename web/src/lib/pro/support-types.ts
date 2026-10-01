/** The support types PRO offers, 3D or 2D, with their labels: one list for every editor. */
import type { SupportType } from '../store/model.svelte';

export function supportTypeOptions(is3D: boolean, t: (k: string) => string): Array<{ value: SupportType; label: string }> {
  return is3D ? [
    { value: 'fixed3d', label: t('pro.fixed3d') },
    { value: 'pinned3d', label: t('pro.pinned3d') },
    { value: 'rollerXZ', label: t('pro.rollerXZ') },
    { value: 'rollerXY', label: t('pro.rollerXY') },
    { value: 'rollerYZ', label: t('pro.rollerYZ') },
    { value: 'spring3d', label: t('pro.spring3d') },
    { value: 'custom3d', label: t('pro.custom3d') },
  ] : [
    { value: 'fixed', label: t('pro.fixed') },
    { value: 'pinned', label: t('pro.pinned') },
    { value: 'rollerX', label: t('pro.rollerX') },
    { value: 'rollerZ', label: t('pro.rollerY') },
    { value: 'spring', label: t('pro.spring') },
  ];
}
