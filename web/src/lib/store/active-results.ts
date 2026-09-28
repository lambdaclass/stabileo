/**
 * The combinations that design and reports read, and the one place results are published.
 *
 * Design, verification, detailing, joints, the report and the export all used to read every
 * solved combination. In PRO they read the ACTIVE list the project states
 * (`engine/result-scopes.ts`); unstated, that is every combination, as before. The viewport and
 * the combination selectors keep offering every combination — the list decides what is used,
 * not what can be looked at.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { activeComboIds, narrowPerCombo } from '../engine/result-scopes';
import { computeGoverning3D } from '../engine/governing-case';
import type { AnalysisResults3D, FullEnvelope3D } from '../engine/types-3d';

/** The ids design reads: the stated active list in PRO, every combination otherwise. */
export function activeCombinationIds(): number[] {
  const combos = modelStore.model.combinations;
  return uiStore.analysisMode === 'pro' ? activeComboIds(modelStore.resultScopes, combos) : combos.map((c) => c.id);
}

/** The solved combinations design reads. */
export function activePerCombo3D(): Map<number, AnalysisResults3D> {
  const all = resultsStore.perCombo3D;
  if (uiStore.analysisMode !== 'pro' || !modelStore.resultScopes?.active) return all;
  return narrowPerCombo(all, activeCombinationIds());
}

/** The active combinations, as design consumers list them. */
export function activeCombinations() {
  const ids = new Set(activeCombinationIds());
  return modelStore.model.combinations.filter((c) => ids.has(c.id));
}

/**
 * Publish a solved combination bundle and the governing combination of each member.
 *
 * Every entry point that solves combinations goes through here, so the governing search sees
 * the same active list as the envelope does. Before, only the live calculation computed it.
 */
export function publishCombinations3D(bundle: {
  perCase: Map<number, AnalysisResults3D>;
  perCombo: Map<number, AnalysisResults3D>;
  envelope: FullEnvelope3D;
}): void {
  resultsStore.setCombinationResults3D(bundle.perCase, bundle.perCombo, bundle.envelope);
  const names = new Map(modelStore.model.combinations.map((c) => [c.id, c.name]));
  resultsStore.setGoverning3D(computeGoverning3D(activePerCombo3D(), names));
}
