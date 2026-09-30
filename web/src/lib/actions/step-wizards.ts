/**
 * Opening the stiffness and flexibility wizards, from wherever they are asked
 * for: the "Explained step by step" catalog lists them with the other methods.
 *
 * Both check first that the model is one they can show honestly (bars only,
 * small enough to print its matrices, no joints they do not model) and say
 * which limit it crossed when it is not. See `step-by-step-scope.ts`.
 */
import { t } from '../i18n';
import { uiStore, modelStore, dsmStepsStore, fmStepsStore } from '../store';
import { explainedSteps } from '../store/explained-steps.svelte';
import { stepByStepScope, STEP_BY_STEP_MAX_DOFS } from '../engine/step-by-step-scope';
import { solveDetailed } from '../engine/solver-detailed';
import { solveDetailed3D } from '../engine/solver-detailed-3d';
import { solveForceMethod, ForceMethodError, FM_MAX_GH } from '../engine/force-method/solve';
import { solveForceMethod3D } from '../engine/force-method/solve-3d';

function blocked(): boolean {
  if (modelStore.hasSlidingJoints()) { uiStore.toast(t('advanced.slidingUnsupported'), 'error'); return true; }
  if (modelStore.hasJoint3D()) { uiStore.toast(t('advanced.jointsUnsupported'), 'error'); return true; }
  return false;
}

function inputFor(threeD: boolean) {
  return threeD
    ? modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', { expandMemberOffsets: false })
    : modelStore.buildSolverInput(uiStore.includeSelfWeight);
}

function refused(input: Parameters<typeof stepByStepScope>[0], threeD: boolean): boolean {
  const v = stepByStepScope(input, threeD);
  if (v.ok) return false;
  uiStore.toast(t(`sbs.scope.${v.reason}`).replace('{n}', String(v.dofs)).replace('{max}', String(STEP_BY_STEP_MAX_DOFS)), 'error');
  return true;
}

function errText(e: unknown, fallbackKey: string): string {
  if (typeof e === 'string' && e.trim()) return e;
  const msg = (e as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && msg.trim() ? msg : t(fallbackKey);
}

function showPanel() {
  if (uiStore.isMobile) uiStore.rightDrawerOpen = true;
  else uiStore.rightSidebarOpen = true;
  setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 100);
}

/** Open the stiffness wizard on the current model; false (with a toast) when it cannot. */
export function openStiffnessWizard(): boolean {
  if (blocked()) return false;
  const threeD = uiStore.analysisMode === '3d';
  const input = inputFor(threeD);
  if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return false; }
  if (refused(input, threeD)) return false;
  try {
    const data = threeD ? solveDetailed3D(input as never) : solveDetailed(input as never);
    fmStepsStore.close();
    explainedSteps.leaveForWizard();
    dsmStepsStore.setStepData(data);
    dsmStepsStore.open();
    showPanel();
    return true;
  } catch (e: unknown) {
    uiStore.toast(errText(e, threeD ? 'toast.detailedSolver3dError' : 'toast.detailedSolverError'), 'error');
    return false;
  }
}

/** Open the flexibility wizard on the current model; false (with a toast) when it cannot. */
export function openFlexibilityWizard(): boolean {
  if (blocked()) return false;
  const threeD = uiStore.analysisMode === '3d';
  const input = inputFor(threeD);
  if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return false; }
  if (refused(input, threeD)) return false;
  try {
    const result = threeD ? solveForceMethod3D(input as never) : solveForceMethod(input as never);
    dsmStepsStore.close();
    explainedSteps.leaveForWizard();
    fmStepsStore.setResult(result);
    fmStepsStore.open();
    showPanel();
    return true;
  } catch (e: unknown) {
    if (e instanceof ForceMethodError) {
      const dofs = e.dofs.length ? ` (${e.dofs.slice(0, 8).join(', ')}${e.dofs.length > 8 ? '…' : ''})` : '';
      uiStore.toast(t(`fm.err.${e.key}`).replace('{gh}', String(e.gh)).replace('{max}', String(FM_MAX_GH)) + dofs, 'error');
    } else {
      uiStore.toast(errText(e, 'fm.err.unstable'), 'error');
    }
    return false;
  }
}

/** Open the catalog in the data panel (the wizards and documents live there too). */
export function openExplainedCatalog(): void {
  dsmStepsStore.close();
  fmStepsStore.close();
  explainedSteps.openCatalog();
  showPanel();
}
