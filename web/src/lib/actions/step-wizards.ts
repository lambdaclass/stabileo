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
import { loadCourse, type Course } from '../course/load-course';
import { blocked, refused } from './wizard-guard';

function inputFor(threeD: boolean) {
  return threeD
    ? modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', { basic: uiStore.analysisMode !== 'pro', expandMemberOffsets: false })
    : modelStore.buildSolverInput(uiStore.includeSelfWeight);
}

function errText(e: unknown, fallbackKey: string): string {
  if (typeof e === 'string' && e.trim()) return e;
  const msg = (e as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && msg.trim() ? msg : t(fallbackKey);
}

/*
 * Shows the panel the wizards and the catalog render in. It does not re-frame
 * the model: it used to dispatch a zoom-to-fit, so merely opening the catalog
 * (or a wizard from it) and going back left a model the reader had panned or
 * zoomed framed afresh. Where opening a panel does resize the canvas, the
 * phone's sheet, App.svelte re-frames on that transition; a desktop panel
 * takes width from a canvas that has plenty. Loading an example from the
 * catalog is the one step that frames the model (StepsCatalog's `example`).
 */
function showPanel() {
  if (uiStore.isMobile) uiStore.rightDrawerOpen = true;
  else uiStore.rightSidebarOpen = true;
}

/** Open the stiffness wizard on the current model; false (with a toast) when it cannot. */
export async function openStiffnessWizard(): Promise<boolean> {
  let course: Course;
  try {
    course = await loadCourse();
  } catch (e: unknown) {
    uiStore.toast(errText(e, 'toast.detailedSolverError'), 'error');
    return false;
  }
  if (blocked()) return false;
  const threeD = uiStore.is3DWorkspace;
  const input = inputFor(threeD);
  if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return false; }
  if (refused(input, threeD)) return false;
  try {
    const { solveDetailed, solveDetailed3D } = course;
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
export async function openFlexibilityWizard(): Promise<boolean> {
  let course: Course;
  try {
    course = await loadCourse();
  } catch (e: unknown) {
    uiStore.toast(errText(e, 'fm.err.unstable'), 'error');
    return false;
  }
  if (blocked()) return false;
  const threeD = uiStore.is3DWorkspace;
  const input = inputFor(threeD);
  if (!input) { uiStore.toast(t('advanced.emptyModel'), 'error'); return false; }
  if (refused(input, threeD)) return false;
  const { solveForceMethod, solveForceMethod3D, ForceMethodError, FM_MAX_GH } = course;
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

/** Open one explained method's document from another panel. */
export function openExplainedMethod(id: string): void {
  dsmStepsStore.close();
  fmStepsStore.close();
  explainedSteps.openMethod(id);
  showPanel();
}
