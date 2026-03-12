/**
 * edu-store.svelte.ts — Educational mode state.
 *
 * Centralises all edu-specific state (current exercise, answers,
 * verification, step completion) so it lives outside the shared stores
 * and can evolve independently of Basic / PRO modes.
 */

import type { EduExercise } from './exercises';
import type { AnalysisResults } from '../../lib/engine/types';

// ─── Types ─────────────────────────────────────────────────────────
export type VerifState = 'pending' | 'correct' | 'incorrect';
export type ReactionAnswer = Record<string, string>;

// ─── Singleton state ───────────────────────────────────────────────

let currentExercise = $state<EduExercise | null>(null);
let exerciseKey = $state(0);

/** Internal copy of solver results — edu owns its own reference */
let solvedResults = $state<AnalysisResults | null>(null);

// ─── Public API ────────────────────────────────────────────────────

export const eduStore = {
  // ── Exercise lifecycle ────────────────────────────────────────
  get exercise() { return currentExercise; },
  get exerciseKey() { return exerciseKey; },

  get results() { return solvedResults; },
  set results(r: AnalysisResults | null) { solvedResults = r; },

  loadExercise(ex: EduExercise) {
    currentExercise = ex;
    exerciseKey++;
    solvedResults = null;
  },

  clearExercise() {
    currentExercise = null;
    solvedResults = null;
  },

  get hasExercise() { return currentExercise !== null; },
};
