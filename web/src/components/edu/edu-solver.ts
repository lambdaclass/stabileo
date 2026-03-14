/**
 * edu-solver.ts — Educational mode solver service.
 *
 * Self-contained module: uses the shared 2D solver (modelStore.solve)
 * but manages its own result lifecycle. No other module needs to
 * import or dispatch to this — edu-solver registers its own listeners.
 */

import { modelStore, resultsStore, uiStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { eduStore } from './edu-store.svelte';
import { solvePDelta } from '../../lib/engine/pdelta';

/**
 * Solve the current model silently for educational mode.
 * Results are stored in eduStore (for verification) AND resultsStore
 * (for the viewport to read reactions/forces), but all visual output
 * is suppressed.
 */
export function solveForEdu(): void {
  const exercise = eduStore.exercise;
  const usePDelta = exercise?.solverType === 'pdelta';

  let r: ReturnType<typeof modelStore.solve>;

  if (usePDelta) {
    // Build solver input and run P-Delta
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) {
      uiStore.toast(t('results.emptyModelError'), 'error');
      return;
    }
    const pdResult = solvePDelta(input);
    if (typeof pdResult === 'string') {
      uiStore.toast(pdResult, 'error');
      return;
    }
    r = pdResult.results;
  } else {
    r = modelStore.solve(uiStore.includeSelfWeight);
  }

  if (typeof r === 'string') {
    uiStore.toast(r, 'error');
    return;
  }
  if (!r) {
    uiStore.toast(t('results.emptyModelError'), 'error');
    return;
  }

  // Store results in edu's own store
  eduStore.results = r;

  // Also push to resultsStore so EduExerciseView can read reactions
  // (resultsStore.setResults auto-sets diagramType='deformed', so override)
  resultsStore.setResults(r);
  resultsStore.diagramType = 'none';
  resultsStore.showReactions = false;

  // Notify any listener that edu solve completed
  window.dispatchEvent(new Event('stabileo-edu-solved'));
}

// ─── Global solve handler ──────────────────────────────────────────
// When the 'stabileo-solve' event fires and we're in edu mode,
// this module handles it directly — no routing through live-calc.ts.

let registered = false;

/**
 * Call once (e.g. from EducativePanel mount) to register the edu
 * global solve listener. Idempotent — safe to call multiple times.
 */
export function registerEduSolveHandler(): void {
  if (registered) return;
  registered = true;

  window.addEventListener('stabileo-solve', () => {
    if (uiStore.analysisMode !== 'edu') return;
    solveForEdu();
  });
}
