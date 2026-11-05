import { t } from '../i18n';
import { uiStore, modelStore } from '../store';
import { stepByStepScope, STEP_BY_STEP_MAX_DOFS } from '../engine/step-by-step-scope';

export function blocked(): boolean {
  if (modelStore.hasSlidingJoints()) { uiStore.toast(t('advanced.slidingUnsupported'), 'error'); return true; }
  if (modelStore.hasJoint3D()) { uiStore.toast(t('advanced.jointsUnsupported'), 'error'); return true; }
  return false;
}

export function refused(input: Parameters<typeof stepByStepScope>[0], threeD: boolean): boolean {
  const v = stepByStepScope(input, threeD);
  if (v.ok) return false;
  uiStore.toast(t(`sbs.scope.${v.reason}`).replace('{n}', String(v.dofs)).replace('{max}', String(STEP_BY_STEP_MAX_DOFS)), 'error');
  return true;
}
