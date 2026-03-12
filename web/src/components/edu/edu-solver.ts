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

/**
 * Solve the current model silently for educational mode.
 * Results are stored in eduStore (for verification) AND resultsStore
 * (for the viewport to read reactions/forces), but all visual output
 * is suppressed.
 */
export function solveForEdu(): void {
  const r = modelStore.solve(uiStore.includeSelfWeight);
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
  window.dispatchEvent(new Event('dedaliano-edu-solved'));
}

// ─── Global solve handler ──────────────────────────────────────────
// When the 'dedaliano-solve' event fires and we're in edu mode,
// this module handles it directly — no routing through live-calc.ts.

let registered = false;

/**
 * Call once (e.g. from EducativePanel mount) to register the edu
 * global solve listener. Idempotent — safe to call multiple times.
 */
export function registerEduSolveHandler(): void {
  if (registered) return;
  registered = true;

  window.addEventListener('dedaliano-solve', () => {
    if (uiStore.analysisMode !== 'edu') return;
    solveForEdu();
  });
}
