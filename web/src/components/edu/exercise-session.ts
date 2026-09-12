import { modelStore, resultsStore } from '../../lib/store';
import { eduStore } from './edu-store.svelte';

/**
 * Giving back the model an exercise borrowed.
 *
 * ── Why this is a module and not a function in the panel ───────────
 *
 * Two places end an exercise, and only one of them is the panel. The other is
 * the Settings checkbox that hides Educational from Basic: switching it off
 * with an exercise open takes away the only surface that could have given the
 * reader's structure back, so it has to give it back itself. Four lines in two
 * components is exactly the kind of pair that drifts, and the failure when it
 * does is a silently discarded model.
 */

/** Hand back the model the exercise borrowed, or clear if it borrowed none. */
export function returnBorrowedModel(): void {
  const kept = eduStore.borrowedModel as ReturnType<typeof modelStore.snapshot> | null;
  eduStore.borrowedModel = null;
  if (kept) modelStore.restore(kept);
  else modelStore.clear();
}

/** End the exercise entirely: clear it, drop its results, restore the model. */
export function leaveExercise(): void {
  eduStore.clearExercise();
  eduStore.authoring = false;
  eduStore.markBrowsing();
  resultsStore.clear();
  returnBorrowedModel();
}
