/**
 * Why a bar's stiffness matrix looks the way it does — shared by Step 2 and
 * the matrix view, so the two never explain the same matrix differently.
 */
import { t } from '../../lib/i18n';
import type { ElementStepData } from '../../lib/engine/solver-detailed';

export function matrixWhy(elem: ElementStepData, is3D: boolean): string {
  if (elem.type === 'truss') return t('dsm.step2.whyTruss');
  if (!is3D) {
    if (elem.hingeStart && elem.hingeEnd) return t('dsm.step2.whyBothHinged');
    if (elem.hingeStart) return t('dsm.step2.whyHinge').replaceAll('{end}', 'i').replaceAll('{other}', 'j');
    if (elem.hingeEnd) return t('dsm.step2.whyHinge').replaceAll('{end}', 'j').replaceAll('{other}', 'i');
    return '';
  }
  const r = elem.releases;
  if (!r) return '';
  const list = [
    r.myStart && 'My (i)', r.myEnd && 'My (j)', r.mzStart && 'Mz (i)', r.mzEnd && 'Mz (j)',
    (r.tStart || r.tEnd) && `T (${[r.tStart && 'i', r.tEnd && 'j'].filter(Boolean).join(', ')})`,
  ].filter(Boolean);
  return list.length ? t('dsm.step2.whyReleases3d').replace('{list}', list.join(', ')) : '';
}
