/**
 * Solving, as an action rather than a component method.
 *
 * `handleSolve` lived inside ToolbarResults, so the only way to solve was to
 * open the results panel and press the button in it. The ribbon's Solve command
 * therefore could not solve — it opened the panel and asked the user to press
 * Solve again, which is two clicks and a detour for the single most-used action
 * in the application.
 *
 * Moving it here gives one implementation with one set of 3D handling, NaN
 * checks and toasts, callable from anywhere. Duplicating it into the ribbon
 * would have been the other option, and two copies of a solver entry point is
 * how they drift apart. In 3D that implementation is Calcular's
 * (`engine/live-calc.ts` `runGlobalSolve`), for that reason.
 */

import { uiStore, resultsStore, modelStore } from '../store';
import { t } from '../i18n';
import { hasInvalid2DDisplacements } from '../geometry/coordinate-system';
import { reportModelDiagnostics } from '../engine/solve-diagnostics';
import { runGlobalSolve, lastSolveFailure } from '../engine/live-calc';
import { requestAutosave } from '../store/autosave-service';
import { spectralCaseResults } from '../store/spectral-cases';
import { errorText } from '../utils/error-text';

/**
 * The spectral cases' results, or nothing (said) when they cannot be had: those cases are left out.
 * What the reader should know of results that were had (too little mass moving in a direction, a
 * scale the regulation no longer gives) is said too.
 */
export function spectralOrSay() {
  if (!modelStore.model.loadCases.some((c) => c.spectral)) return undefined;
  const r = spectralCaseResults();
  if (typeof r === 'string') { uiStore.toast(t('spectralCase.leftOut') + ' ' + r, 'error'); return undefined; }
  for (const w of r.warnings) uiStore.toast(w, 'info');
  return r.results;
}

/** How a solve ended: with results, or with the message the reader was shown. */
export type SolveOutcome = { ok: true } | { ok: false; error: string };

export function runSolve(): void {
  /*
   * This is the solve entry point the Basic UI actually uses — Enter, the
   * ribbon's Solve command and Calcular all land here. In 3D it is the manual
   * solve every other entry point uses (`runGlobalSolve`): a copy of its own
   * took no part in that solve's guard, so an older Enter solve landing after
   * a newer one was published. The pre-solve hygiene report (issue #181) fires
   * in both arms; the PRO exclusion is inside the reporter itself.
   */
  void solveNow();
}

/** Whether the results on hand are the current model's: an edit clears them. */
export function hasCurrentResults(): boolean {
  return uiStore.is3DWorkspace ? !!resultsStore.results3D : !!resultsStore.results;
}

/**
 * Solve unless the results on hand are already the model's, and say how it went.
 *
 * For the exports: a workbook or a report asked for before Calcular solves first, rather than
 * coming out without results and without saying why. The failure is the message the reader was
 * also shown as a toast, so the export can carry it. A solve that just failed on this very model
 * (PRO's export solves first, `pro/export-results.ts`) is not run again: it fails the same way.
 * An empty model is not solved: the export says it is empty instead (`export/empty-model.ts`).
 */
export async function ensureResults(): Promise<SolveOutcome> {
  if (hasCurrentResults()) return { ok: true };
  if (modelStore.nodes.size === 0) return { ok: false, error: t('export.emptyModel') };
  const failed = lastSolveFailure();
  if (failed !== null) return { ok: false, error: failed };
  return solveNow();
}

/**
 * Solve now and say how it went. In 3D through `runGlobalSolve`, with the base solved directly as
 * this entry point always had it (a provenance names it, `store/result-provenance.ts`).
 */
export async function solveNow(): Promise<SolveOutcome> {
  if (!uiStore.is3DWorkspace) {
    reportModelDiagnostics();
    return runSolve2D();
  }
  try {
    return await runGlobalSolve({ directBase: true });
  } catch (e) {
    const error = errorText(e, t('toast.solverInitFailed'));
    uiStore.toast(error, 'error');
    return { ok: false, error };
  }
}

function runSolve2D(): SolveOutcome {
  const results = modelStore.solve(uiStore.includeSelfWeight, uiStore.drawPlane2D);
  if (typeof results === 'string') {
    uiStore.toast(results, 'error');
    return { ok: false, error: results };
  } else if (results) {
    // Validate results aren't degenerate
    const hasNaN = hasInvalid2DDisplacements(results.displacements);
    if (hasNaN) {
      uiStore.toast(t('results.numericError'), 'error');
      return { ok: false, error: t('results.numericError') };
    }
    resultsStore.setResults(results);
    // Show classification in success toast
    const kin = modelStore.kinematicResult;
    let classText = '';
    if (kin) {
      if (kin.classification === 'isostatic') classText = t('toast.isostatic');
      else if (kin.classification === 'hyperstatic') classText = t('toast.hyperstatic').replace('{degree}', String(kin.degree));
    }
    // Auto-solve combinations if they exist
    let comboText = '';
    // Basic with load cases off shows no combinations: none are solved.
    if (modelStore.model.combinations.length > 0 && uiStore.showLoadCasePicker) {
      const comboResult = modelStore.solveCombinations(uiStore.includeSelfWeight, uiStore.drawPlane2D);
      if (comboResult && typeof comboResult !== 'string') {
        resultsStore.setCombinationResults(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
        comboText = t('toast.plusCombinations').replace('{n}', String(comboResult.perCombo.size));
      }
    }
    // Show diagnostics warnings if present
    const diagWarnings = [
      ...(results.diagnostics ?? []).filter(d => d.metric === 'negative_jacobian').map(d => d.message),
      ...(results.solverDiagnostics ?? []).filter(d => d.severity === 'warning').map(d => d.message),
    ];
    if (diagWarnings.length > 0) {
      uiStore.toast(diagWarnings.join(' | '), 'info');
    }
    uiStore.toast(`${t('results.calcSuccess')}${classText} — ${results.elementForces.length} ${t('results.bars')}, ${results.reactions.length} ${t('results.reactions')}${comboText}`, 'success');
    // A solve is the expensive operation autosave exists for; only live-calc asked for one.
    void requestAutosave('solve');
    return { ok: true };
  }
  uiStore.toast(t('results.emptyModelError'), 'error');
  return { ok: false, error: t('results.emptyModelError') };
  /*
   * A solve no longer opens anything by itself on a phone.
   *
   * `leftDrawerOpen` closed the old Toolbar drawer, which nothing renders any
   * more — the write survived the drawer. `mobileResultsPanelOpen` raised the
   * floating results panel, which on Basic does not exist at all (the panel
   * requires `appMode === 'pro'`) and on PRO landed on top of the results
   * sheet that `ProPanel.solve()` had just opened. The panel is now opened by
   * the bar's own button, and only when it is asked for.
   */
}
