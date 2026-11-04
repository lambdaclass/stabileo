/**
 * "Re-run analysis and design", offered by the re-check notice (`store/recheck.svelte.ts`).
 *
 * The analysis is the manual solve every other entry point uses (`runGlobalSolve`), so the re-run
 * is exactly what pressing Calcular does; its publish stamps the project with this build and ends
 * the stale state. The design re-run is the RC code check over the provided reinforcement (PRO),
 * NOT the auto-design: re-designing would overwrite reinforcement the engineer chose, and the
 * question here is whether what they chose still passes under the changed checks. The steel
 * checks read the new results by themselves.
 */
import { uiStore, resultsStore } from '../store';
import { designRunStore } from '../store/design-run.svelte';
import { recheckStore } from '../store/recheck.svelte';
import { runGlobalSolve } from '../engine/live-calc';
import { RESULTS_VERSION } from '../provenance/registry';
import { t, tp } from '../i18n';
import { errorText } from '../utils/error-text';


/** The re-run's words: «analysis and design», or the analysis alone where PRO's design is off. */
export function recheckKey(key: string): string {
  return uiStore.analysisMode === 'pro' && !uiStore.designInPro ? `${key}Analysis` : key;
}

export async function rerunAnalysisAndDesign(): Promise<{ ok: boolean; error?: string }> {
  uiStore.toast(t(recheckKey('recheck.rerunning')), 'info');
  const failed = (error: string) => {
    uiStore.toast(tp('recheck.rerunFailed', { error }), 'error');
    return { ok: false, error };
  };
  const before = recheckStore.capture();
  let outcome;
  try {
    outcome = await runGlobalSolve();
  } catch (e) {
    return failed(errorText(e, 'error'));
  }
  if (!outcome.ok) return failed(outcome.error);
  /*
   * The combinations refused (an empty active list) or failed, and the single solve stood in for
   * them: the model is not what was asked for, and design has nothing to read. The project stays
   * stale, as the message says: `runGlobalSolve` put the earlier stamp back (for every entry point,
   * so a plain Calcular after this does not end it either). Restored here too, as this re-run's
   * own guarantee.
   */
  if (outcome.combinationsLeftOut !== null) {
    recheckStore.restoreStamp(before);
    return failed(tp('recheck.combinationsLeftOut', { reason: outcome.combinationsLeftOut }));
  }
  const solved = uiStore.is3DWorkspace ? !!resultsStore.results3D : !!resultsStore.results;
  if (!solved || recheckStore.stale) return failed(t('results.emptyModelError'));
  // Design is re-run only where it is on (PRO's settings, `uiStore.designInPro`): off, the re-run is
  // the analysis alone, and nothing of design is computed or drawn.
  if (uiStore.analysisMode === 'pro' && uiStore.designInPro && resultsStore.results3D) {
    // A refusal here (no combinations, no concrete members) is not a failed re-run: there was
    // no RC check to repeat. The design panel says why when it is opened.
    designRunStore.runCodeCheck();
  }
  uiStore.toast(tp(recheckKey('recheck.rerunDone'), { v: RESULTS_VERSION }), 'success');
  return { ok: true };
}
