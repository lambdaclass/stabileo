/**
 * The combinations that design and reports read, and the one place results are published.
 *
 * Design, verification, detailing, joints, the report and the export all used to read every
 * solved combination. In PRO they read the ACTIVE list the project states
 * (`engine/result-scopes.ts`); unstated, that is every combination but the service ones a code
 * wrote (`designComboIds`). The viewport and
 * the combination selectors keep offering every combination — the list decides what is used,
 * not what can be looked at.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { t } from '../i18n';
import { activeComboIds, isMagnitudeCombination, isServiceCombination, narrowPerCombo } from '../engine/result-scopes';
import { computeGoverning3D } from '../engine/governing-case';
import type { AnalysisResults3D, FullEnvelope3D } from '../engine/types-3d';

/**
 * The ids design reads: the stated active list in PRO, every combination otherwise; never an SRSS
 * or ABS one, a magnitude without a sign (`isMagnitudeCombination`), in either.
 */
export function activeCombinationIds(): number[] {
  const combos = modelStore.model.combinations;
  return uiStore.analysisMode === 'pro' ? activeComboIds(modelStore.resultScopes, combos) : combos.filter((c) => !isMagnitudeCombination(c)).map((c) => c.id);
}

/**
 * The solved combinations design reads. With no stated list, every one but the service
 * combinations a code wrote (`designComboIds`): it returned all of them, and joints, footings,
 * floors, the report and the tables read service combinations as design demands.
 */
export function activePerCombo3D(): Map<number, AnalysisResults3D> {
  const all = resultsStore.perCombo3D;
  const combos = modelStore.model.combinations;
  // An SRSS or ABS combination read as signed demands: a column in compression designed in tension.
  const magnitude = combos.some(isMagnitudeCombination);
  if (uiStore.analysisMode !== 'pro' && !magnitude) return all;
  if (!modelStore.resultScopes?.active && !combos.some(isServiceCombination) && !magnitude) return all;
  return narrowPerCombo(all, activeCombinationIds());
}

/**
 * The one result set footings, joints and floors read when no linear combination is active.
 *
 * With no combination solved it is the result on screen, as before, unless the model has
 * combinations to design for and they are not solved (`combinationsUnsolved`). With combinations
 * solved and none of them active and linear (every active one an SRSS or ABS, say), it is the
 * solve of every load ("All loads", `singleResults3D`): the result on screen could be the
 * magnitude, read as a signed state (a footing's 60,13 kN for 56,0). Never a result that is a
 * magnitude; null when there is no other, and the caller says why (`noLinearCombinationActive`,
 * `combinationsUnsolved`).
 */
export function activeResultSet3D(): AnalysisResults3D | null {
  const shown = resultsStore.results3D;
  if (resultsStore.perCombo3D.size === 0) return shown && !shown.magnitude && !combinationsUnsolved() ? shown : null;
  const single = resultsStore.singleResults3D;
  return single && !single.magnitude ? single : null;
}

/**
 * The model is solved, has combinations design reads, and none of them is solved. Live calc leaves
 * them out while the single view is on screen (`engine/live-calc.ts`, for a large model's sake), so
 * after an edit the results on hand are every load at factor 1: a footing or a joint designed for
 * D + W where 1.2D + 1.6W acts. Not in Basic with load cases off, which solves no combination.
 */
export function combinationsUnsolved(): boolean {
  return !!resultsStore.results3D && resultsStore.perCombo3D.size === 0 && uiStore.showLoadCasePicker
    && activeCombinationIds().length > 0;
}

/** Combinations are solved, none active and linear, and an SRSS or ABS one among them. */
export function noLinearCombinationActive(): boolean {
  if (resultsStore.perCombo3D.size === 0 || activePerCombo3D().size > 0) return false;
  return modelStore.model.combinations.some((c) => isMagnitudeCombination(c) && resultsStore.perCombo3D.has(c.id));
}

/** The active combinations, as design consumers list them. */
export function activeCombinations() {
  const ids = new Set(activeCombinationIds());
  return modelStore.model.combinations.filter((c) => ids.has(c.id));
}

/**
 * The combinations the last published solve left out for having no second-order equilibrium.
 * Meaningful while those results are the ones on screen, which is when the exports read it.
 */
export function unstableCombinations(): readonly number[] {
  return resultsStore.unstableCombinations3D;
}

/**
 * Publish a solved combination bundle and the governing combination of each member.
 * Every entry point that solves combinations goes through here, so the governing search sees
 * the same active list as the envelope does.
 */
export function publishCombinations3D(bundle: {
  perCase: Map<number, AnalysisResults3D>;
  perCombo: Map<number, AnalysisResults3D>;
  envelope: FullEnvelope3D;
  /** Solved with P-Delta and left out: no second-order equilibrium at their load. */
  unstable?: number[];
}): void {
  resultsStore.setCombinationResults3D(bundle.perCase, bundle.perCombo, bundle.envelope, bundle.unstable);
  const names = new Map(modelStore.model.combinations.map((c) => [c.id, c.name]));
  resultsStore.setGoverning3D(computeGoverning3D(activePerCombo3D(), names));
  if (bundle.unstable?.length) {
    const listed = bundle.unstable.map((id) => names.get(id) ?? `#${id}`).join(', ');
    uiStore.toast(t('results.pdeltaUnstable').replace('{names}', listed), 'error');
  }
}
