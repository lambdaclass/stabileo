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

/**
 * Node ids of the current exercise's model, in `addNode()` call order.
 *
 * `EduExercise.supports[].nodeIndex` indexes this array. Exercises are
 * authored against their own construction order while the model store assigns
 * ids from a counter shared with whatever was loaded before, so the two only
 * coincide by luck. Recorded by `EducativePanel` as it runs `exercise.build()`.
 */
let nodeIdsByIndex = $state<number[]>([]);

/**
 * How this session started, which is what decides whose workspace this is.
 *
 * `browsing` is the mode as it has always been: a list of exercises, the
 * authoring form, everything reachable. `handout` is a student who followed a
 * link a teacher gave them — they were handed ONE exercise, and the window
 * should say so. Same application, two situations, and the difference was
 * invisible: a student saw the mode switcher, the tab bar and a "+" for a new
 * project, none of which mean anything to someone who was sent a beam to
 * solve.
 */
export type EduSession = 'browsing' | 'handout';
let session = $state<EduSession>('browsing');

/**
 * Whether the authoring form is open.
 *
 * It lives here rather than inside the panel because the SHELL has to know:
 * authoring is the one situation in Education where a canvas needs drawing
 * tools, and those are mounted by App. Without this the form's first option —
 * "draw the structure, then take it" — was an instruction with nothing to
 * carry it out, on a mode that renders no toolbar at all.
 */
let authoring = $state(false);

// ─── Public API ────────────────────────────────────────────────────

let borrowedModel = $state<unknown>(null);

export const eduStore = {
  // ── Exercise lifecycle ────────────────────────────────────────
  get exercise() { return currentExercise; },
  get exerciseKey() { return exerciseKey; },

  get results() { return solvedResults; },
  set results(r: AnalysisResults | null) { solvedResults = r; },

  /** Node ids of the built model in `addNode()` order — see `nodeIdsByIndex`. */
  get nodeIdsByIndex(): readonly number[] { return nodeIdsByIndex; },

  loadExercise(ex: EduExercise, builtNodeIds: readonly number[] = []) {
    currentExercise = ex;
    exerciseKey++;
    solvedResults = null;
    nodeIdsByIndex = [...builtNodeIds];
  },

  clearExercise() {
    currentExercise = null;
    solvedResults = null;
    nodeIdsByIndex = [];
  },

  get hasExercise() { return currentExercise !== null; },

  // ── Session ───────────────────────────────────────────────────
  get session() { return session; },

  /** True while the window belongs to a student who was handed this exercise. */
  get isHandout() { return session === 'handout' && currentExercise !== null; },

  /** Called when an exercise arrives from a link: this window is a handout. */
  markHandout() { session = 'handout'; },

  /** Back to browsing — the teacher's own window, or a student who chose to
   *  leave the exercise they were given. */
  markBrowsing() { session = 'browsing'; },

  // ── The model an exercise borrowed ────────────────────────────
  /*
   * Opening an exercise REPLACES the model: `loadExercise` clears the store
   * and builds the exercise's own structure. That was harmless while
   * Education was a separate application — you went there to do exercises and
   * the canvas was the exercise's — and it is not harmless inside Basic,
   * where the reader may have been drawing a frame for an hour.
   *
   * So the model is set aside rather than destroyed, and handed back when the
   * exercise is left. This is the same thing `switchAppMode` does with
   * `modeSnapshots`; the difference is only that here the two share one mode.
   *
   * `unknown` because this module must not import the model store: it is the
   * store that hands the snapshot in and takes it back out.
   */
  get borrowedModel() { return borrowedModel; },
  set borrowedModel(v: unknown) { borrowedModel = v; },

  // ── Authoring ─────────────────────────────────────────────────
  get authoring() { return authoring; },
  set authoring(v: boolean) { authoring = v; },
};
