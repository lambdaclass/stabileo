import { modeToPath } from '../../lib/app-mode';
import { openExplainedCatalog } from '../../lib/actions/step-wizards';
import { modelStore, resultsStore, tabManager, uiStore } from '../../lib/store';
import { examLock } from '../../lib/store/exam-lock.svelte';
import { buildFromSpec, type ModelSpec } from './exercise-spec';
import { exerciseStoreApi, leaveExamExercise } from './exercise-session';

const KEY = 'stabileo.exam.steps.v1';

export interface StepsHandoff {
  title: string;
  model: ModelSpec;
}

/** Leaves the exam room for Basic, which opens the step-by-step on this structure in a tab of its own. */
export function handOffSteps(title: string, model: ModelSpec): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ title, model } satisfies StepsHandoff));
  } catch {
    return;
  }
  leaveExamExercise();
  examLock.leaveRoom();
  location.assign(modeToPath('basico'));
}

/** Read once: a reload after it was taken opens Basic as usual. */
export function takeStepsHandoff(): StepsHandoff | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as StepsHandoff;
    if (typeof v?.title !== 'string' || !Array.isArray(v.model?.nodes) || !Array.isArray(v.model?.elements)) return null;
    return v;
  } catch {
    return null;
  }
}

/** Opens the handed-off structure in a new Basic tab, beside the reader's own, with the step-by-step catalog. */
export function openHandedOffSteps(h: StepsHandoff): void {
  tabManager.createTab();
  uiStore.analysisMode = '2d';
  modelStore.clear();
  resultsStore.clear();
  buildFromSpec(h.model, exerciseStoreApi());
  if (tabManager.activeTabId) tabManager.renameTab(tabManager.activeTabId, h.title);
  openExplainedCatalog();
}
