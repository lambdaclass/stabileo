/**
 * When the model-diagnostics warning is allowed to speak.
 *
 * ── The report this exists to answer ───────────────────────────────
 *
 * "A yellow warning sits over the right panel the moment PRO opens, before I have done
 * anything, and hovering it says `Fix before solving`."
 *
 * It was telling the truth and it was still wrong. `checkModel` on an empty model returns three
 * errors — `MODEL_FEW_NODES`, `MODEL_NO_ELEMENTS`, `MODEL_NO_SUPPORTS` — and the chip rendered
 * whenever that count was above zero. So an untouched PRO greeted every user with "⚠ 3" for the
 * crime of being empty. An empty workspace is not a defect; it is a workspace.
 *
 * ── The rule ──────────────────────────────────────────────────────
 *
 * The warning needs BOTH an actionable diagnostic and a reason to believe the user wants to
 * hear about it. It appears when:
 *
 *   1. there is a model at all (a node exists) — an empty PRO is classified `empty` and stays
 *      silent however loudly `checkModel` complains; AND
 *   2. the session is ARMED, meaning the user has loaded or restored a project, tried to
 *      calculate, tried to design, run a verification, or opened Diagnostics themselves; AND
 *   3. at least one diagnostic survives at `error` severity; AND
 *   4. the current diagnostic set is not the one they dismissed.
 *
 * Arming on "a model exists" covers load and restore without instrumenting either path — a
 * model does not appear in PRO by itself. The explicit `arm()` calls cover the case the user
 * asked for by name: pressing Calculate on a model that cannot be calculated must explain
 * itself, even if the press is the first thing they did.
 *
 * ── The dismissal policy, and why this one ────────────────────────
 *
 * Dismissal is scoped to the DIAGNOSTIC SIGNATURE, for the current session.
 *
 *   - It survives navigating away and back, so hiding it is worth doing.
 *   - It does not survive a reload: a fresh session is a fresh judgement.
 *   - It lapses the moment the diagnostics change — a new code, or a different count of an
 *     existing one, is a new fact and gets to interrupt again.
 *
 * The alternative — dismiss forever, per project — was rejected because it would have to be
 * persisted, and a hidden warning that outlives the session it was hidden in is how a project
 * gets handed over with a defect nobody can see any more.
 *
 * **Hiding this chip can never change what the design does.** The pre-solve gate in `ProPanel`
 * and the design commands call `checkModel` directly and refuse on their own; this module is
 * consulted by nothing but the chip. That separation is deliberate: a dismissal must be able to
 * quieten a notification without ever being able to falsify a state.
 */

import { modelStore } from './model.svelte';
import { checkModel } from '../engine/model-diagnostics';
import type { SolverDiagnostic } from '../engine/types';

/**
 * What the diagnostics currently amount to.
 *
 * `empty` is the case the bug report was about and is kept apart from every other: it is the
 * absence of a model, not a fault in one. `incomplete` is a model that exists but is missing
 * something the analysis needs; `blocking` is anything else at error severity. Provisional
 * proposals and bar conflicts are NOT here — they have their own surfaces (the badge, the
 * chips, the banners, the status panel) and folding them in would blur a proposal into a fault.
 */
export type DiagnosticsKind = 'empty' | 'incomplete' | 'blocking';

/** Codes that only ever mean "you have not built anything yet". */
const ABSENCE_CODES = new Set(['MODEL_FEW_NODES', 'MODEL_NO_ELEMENTS']);
/** Codes that mean "the model exists but is missing an input the analysis needs". */
const INCOMPLETE_CODES = new Set(['MODEL_NO_SUPPORTS', 'MODEL_NO_LOADS']);

function currentErrors(): SolverDiagnostic[] {
  return checkModel({
    nodes: modelStore.nodes,
    elements: modelStore.elements,
    materials: modelStore.materials,
    sections: modelStore.sections,
    supports: modelStore.supports,
    loads: modelStore.loads as never,
    loadCases: modelStore.model.loadCases,
    plates: modelStore.model.plates,
    quads: modelStore.model.quads,
    connectors: modelStore.model.connectors,
    constraints: modelStore.model.constraints,
  }).filter((d) => d.severity === 'error');
}

/**
 * A stable fingerprint of the diagnostic set.
 *
 * Codes and their counts, sorted. Deliberately NOT the element ids: fixing one of nine
 * coincident-node pairs should not re-raise a warning the user has already read and chosen to
 * work through. A code appearing or disappearing, or its count changing, does.
 */
function signatureOf(diags: SolverDiagnostic[]): string {
  const tally = new Map<string, number>();
  for (const d of diags) tally.set(d.code, (tally.get(d.code) ?? 0) + 1);
  return [...tally.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([code, n]) => `${code}:${n}`).join('|');
}

function createDiagnosticsWarning() {
  let armedExplicitly = $state(false);
  let dismissedSignature = $state<string | null>(null);

  /**
   * Computed on read, memoised on the model's shape — deliberately NOT `$derived`.
   *
   * A `$derived` declared here would be created outside any effect root, because this factory
   * runs at import time. Svelte then has no owner to invalidate it against: the first read
   * caches, and every later read returns the same answer however much the model changes. It
   * looks correct inside a component, which has its own root, and is wrong everywhere else —
   * a unit test caught it reporting an empty model after two nodes had been added.
   *
   * Plain getters have the opposite property, and it is the one this needs: the dependency is
   * tracked by WHOEVER reads them. A component reading `visible` in its template touches
   * `modelStore.nodes` synchronously through this function and re-renders when it changes; a
   * test reading it gets the current answer with no reactive context at all.
   *
   * The memo key is the same set of counts `ProPanel` has always used to decide that the model
   * diagnostics are worth recomputing, so this costs one `checkModel` per model edit rather
   * than one per read.
   */
  let memoKey = '';
  let memoErrors: SolverDiagnostic[] = [];

  function errorsNow(): SolverDiagnostic[] {
    const key = `${modelStore.nodes.size}|${modelStore.elements.size}`
      + `|${modelStore.supports.size}|${modelStore.loads.length}`
      + `|${modelStore.materials.size}|${modelStore.sections.size}`
      + `|${modelStore.model.plates?.size ?? 0}|${modelStore.model.quads?.size ?? 0}`
      + `|${modelStore.modelVersion}`;
    if (key !== memoKey) {
      memoKey = key;
      memoErrors = currentErrors();
    }
    return memoErrors;
  }

  function hasModelNow(): boolean { return modelStore.nodes.size > 0; }

  function kindNow(): DiagnosticsKind {
    if (!hasModelNow()) return 'empty';
    const errs = errorsNow();
    if (errs.every((d) => ABSENCE_CODES.has(d.code) || INCOMPLETE_CODES.has(d.code))) {
      return 'incomplete';
    }
    return 'blocking';
  }

  return {
    /** Every error-severity diagnostic, whatever the chip is doing. Never filtered. */
    get errors() { return errorsNow(); },
    get count() { return errorsNow().length; },
    get kind() { return kindNow(); },
    get signature() { return signatureOf(errorsNow()); },
    /**
     * Having a model IS an interaction.
     *
     * A model does not appear in PRO by itself — someone loaded an example, opened a file,
     * restored an autosave or drew it. So this covers "loaded or restored a project" without
     * instrumenting every path that can produce one, and `armedExplicitly` covers the presses
     * that must explain themselves even before a model exists.
     */
    get armed() { return armedExplicitly || hasModelNow(); },
    get dismissed() {
      return dismissedSignature !== null && dismissedSignature === signatureOf(errorsNow());
    },

    /** The one predicate the chip reads. All four conditions, in the order documented above. */
    get visible() {
      if (!hasModelNow()) return false;
      const errs = errorsNow();
      if (errs.length === 0) return false;
      if (!(armedExplicitly || hasModelNow())) return false;
      return dismissedSignature !== signatureOf(errs);
    },

    /**
     * The user did something that makes a diagnostic worth raising.
     *
     * Called from Calculate, the design commands, verification, and from opening Diagnostics.
     * Loading and restoring arm implicitly, by producing a model.
     */
    arm() { armedExplicitly = true; },

    /** Hide the CURRENT diagnostic set. A different set will speak up again. */
    dismiss() { dismissedSignature = signatureOf(errorsNow()); },

    /** Undo a dismissal — the control in Diagnostics is a toggle, not a one-way door. */
    restore() { dismissedSignature = null; },

    /**
     * The user followed the chip through to Diagnostics.
     *
     * Arms rather than dismisses: they have gone to look, not decided it does not matter.
     */
    markSeen() { armedExplicitly = true; },

    /** Test seam. Not called by the app. */
    resetForTests() { armedExplicitly = false; dismissedSignature = null; },
  };
}

export const diagnosticsWarning = createDiagnosticsWarning();
