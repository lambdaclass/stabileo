/**
 * solve-diagnostics.ts — shared post-solve reliability reporting.
 *
 * Extracted from `live-calc.ts` so Education can reuse it instead of growing a
 * second copy. Education previously discarded every severity-`warning`
 * diagnostic the solver produced and never ran the non-finite displacement
 * gate that all three Basic solve paths run, which meant a degenerate result
 * could be used to grade a student's answers.
 *
 * This module reports; it never decides what a solve means and never touches
 * numerics.
 */

import { uiStore } from '../store/ui.svelte';
import { modelStore } from '../store/model.svelte';
import { t } from '../i18n';
import { checkModel } from './model-diagnostics';
import type { SolverDiagnostic } from './types';

/** Max diagnostics surfaced at once, so a noisy model cannot bury the UI. */
const MAX_TOASTS = 2;

/**
 * Surface solver warnings/errors as toasts.
 *
 * Diagnostic messages may be i18n keys or already-localized text; `t()` returns
 * its input unchanged when there is no matching key, so both work.
 */
export function reportSolverDiagnostics(diags?: SolverDiagnostic[]): void {
  if (!diags) return;
  const important = diags.filter((d) => d.severity === 'error' || d.severity === 'warning');
  for (const d of important.slice(0, MAX_TOASTS)) {
    const msg = t(d.message) !== d.message ? t(d.message) : d.message;
    uiStore.toast(msg, d.severity === 'error' ? 'error' : 'info');
  }
}

/**
 * `checkModel` against the live store.
 *
 * The ModelData literal was written out twice in `ProPanel.svelte` already; this
 * is the shared builder so the Basic path does not become a third copy that can
 * drift from the other two.
 */
export function checkCurrentModel(): SolverDiagnostic[] {
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
  });
}

/**
 * Pre-solve model hygiene for the paths that are not PRO.
 *
 * `checkModel` defines 21 checks — 13 of them severity `error` — and until now
 * it was called ONLY from `pro/` components. A Basic user solving a model with
 * duplicated members, a zero-area section or an orphan support got numbers and
 * no warning at all; the duplicate-member case is issue #181, reported from the
 * 2D workflow where none of this ran.
 *
 * Reports, never blocks: PRO refuses to solve on errors because it owns a
 * panel that explains them, whereas here a toast is the whole channel, and
 * silently refusing a solve the user asked for is worse than a wrong number
 * they were warned about. Blocking is a product decision, not a bug fix.
 *
 * Errors sort ahead of warnings because only MAX_TOASTS surface, and burying an
 * error under two warnings is the exact failure this exists to end.
 *
 * The PRO exclusion lives HERE, not at the call sites: the app has two solve
 * entry points (`runGlobalSolve` for the event path, `runSolve` for Enter, the
 * ribbon and Calcular), and a guard each caller has to remember is a guard one
 * of them eventually forgets. PRO reports these same diagnostics in its own
 * panel and refuses to run on errors, so toasting too would double-report.
 */
export function reportModelDiagnostics(): void {
  if (uiStore.analysisMode === 'pro') return;
  const rank = (d: SolverDiagnostic) => (d.severity === 'error' ? 0 : 1);
  reportSolverDiagnostics([...checkCurrentModel()].sort((a, b) => rank(a) - rank(b)));
}
