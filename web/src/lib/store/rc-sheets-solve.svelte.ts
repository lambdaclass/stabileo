import { runGlobalSolve, type GlobalSolveOutcome } from '../engine/live-calc';
import { errorText } from '../utils/error-text';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { designSheets } from './rc-sheets-view.svelte';

export const sheetsSolve = $state({ busy: false });

/** Solve the model and design the sheets on its results; false when the solve did not give any. */
export async function solveAndDesign(solve: () => Promise<GlobalSolveOutcome> = runGlobalSolve): Promise<boolean> {
  if (sheetsSolve.busy) return false;
  sheetsSolve.busy = true;
  try {
    const outcome = await solve();
    if (!outcome.ok || !resultsStore.results3D) return false;
    await designSheets();
    return true;
  } catch (err) {
    uiStore.toast(errorText(err, String(err)), 'error');
    return false;
  } finally {
    sheetsSolve.busy = false;
  }
}
