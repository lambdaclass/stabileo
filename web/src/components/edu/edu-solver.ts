/**
 * edu-solver.ts — Educational mode solver service.
 *
 * Self-contained module: uses the shared 2D solver (modelStore.solve) but
 * manages its own result lifecycle. Education deliberately withholds the
 * answer-bearing output — reactions and diagrams stay hidden until the student
 * has answered — so it cannot simply reuse the Basic publish path.
 *
 * What it must NOT withhold is trust information. This module previously
 * skipped the non-finite displacement gate that every Basic solve path runs,
 * and silently discarded every severity-`warning` diagnostic the solver
 * produced, so a degenerate or unreliable result could be used to grade a
 * student. Both now go through the same shared helpers Basic uses.
 *
 * Numerics stay in the shared solver; nothing here computes anything.
 */

import { modelStore, resultsStore, uiStore } from '../../lib/store';
import { t } from '../../lib/i18n';
import { eduStore } from './edu-store.svelte';
import { examLock } from '../../lib/store/exam-lock.svelte';
import { solveEduPDelta } from './edu-pdelta';
import { errorText } from '../../lib/utils/error-text';
import { reportSolverDiagnostics } from '../../lib/engine/solve-diagnostics';
import { hasInvalid2DDisplacements } from '../../lib/geometry/coordinate-system';

/**
 * Solve the current model for educational mode.
 *
 * On success the results are stored in `eduStore` (for grading) AND in
 * `resultsStore` (so the viewport can read them), but every visual channel
 * that would give the answer away is suppressed.
 *
 * On a hard error, a non-finite result, or an empty model NOTHING is
 * published: `eduStore.results` stays null and the student's answers stay
 * ungradeable rather than being scored against garbage.
 *
 * Called directly from `live-calc.runGlobalSolve()` when the app is in edu
 * mode — see the note at the bottom of this file about why there is no
 * window listener any more.
 */
export function solveForEdu(): void {
  // The exam room never solves on screen: its answers are marked from the stored spec after it closes.
  if (examLock.room) return;
  const exercise = eduStore.exercise;
  const usePDelta = exercise?.solverType === 'pdelta';

  function refuse(message: string) {
    eduStore.results = null;
    resultsStore.clear();
    uiStore.toast(message, 'error');
  }

  let r: ReturnType<typeof modelStore.solve>;

  if (usePDelta) {
    try {
      const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
      if (!input) {
        refuse(t('results.emptyModelError'));
        return;
      }
      r = solveEduPDelta(input);
    } catch (error) {
      refuse(errorText(error, t('results.emptyModelError')));
      return;
    }
  } else {
    r = modelStore.solve(uiStore.includeSelfWeight, uiStore.drawPlane2D);
  }

  // Hard errors (validation failures, mechanisms, solver errors) stay visible.
  if (typeof r === 'string') {
    refuse(r);
    return;
  }
  if (!r) {
    refuse(t('results.emptyModelError'));
    return;
  }

  // The same non-finite gate all three Basic solve paths apply. A NaN/Infinity
  // displacement field means the "result" is not a result; refuse to publish it
  // so nothing downstream can grade against it.
  if (hasInvalid2DDisplacements(r.displacements)) {
    refuse(t('results.numericError'));
    return;
  }

  // Store results in edu's own store
  eduStore.results = r;

  // Also push to resultsStore so EduExerciseView can read reactions.
  // (resultsStore.setResults auto-sets diagramType='deformed', so override.)
  //
  // Suppression is deliberate and independent of the diagnostics below: a
  // reliability warning must never become a back door that reveals the answer.
  resultsStore.setResults(r);
  resultsStore.diagramType = 'none';
  resultsStore.showReactions = false;

  // Reliability diagnostics are surfaced AFTER the answer-bearing output has
  // been suppressed, so showing them cannot reveal anything.
  reportSolverDiagnostics(r.solverDiagnostics);

  // Notify any listener that edu solve completed
  window.dispatchEvent(new Event('stabileo-edu-solved'));
}

// ─── Global solve dispatch ─────────────────────────────────────────
// There is deliberately NO window listener here.
//
// This module used to register its own 'stabileo-solve' listener from
// EducativePanel's mount, while `live-calc.runGlobalSolve()` returned early for
// edu mode on the assumption that the edu listener "fires first". Correctness
// therefore depended on listener-registration order, and a solve dispatched
// before EducativePanel mounted did nothing at all.
//
// `runGlobalSolve()` now calls `solveForEdu()` directly. One dispatch path, no
// ordering hazard, no possibility of double-solving.
