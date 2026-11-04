/**
 * Load states and their combinations from Basic's Advanced panel: the CIRSOC 101 strength
 * combinations written onto the model's states, and the combination that governs each member.
 */
import { modelStore, resultsStore, uiStore } from '../store';
import { expandCombinations, presentSymbols } from '../engine/loads/combination-cases';
import { addGeneratedCombinations, templateCombinationSpecs } from '../store/generated-combinations';
import { runEngineAction } from '../store/engine-action';
import { computeGoverning2D, type GoverningPerElement } from '../engine/governing-case';
import { OPEN_PANEL_EVENT, type OpenPanelRequest } from '../tool-keys';
import { tp, t } from '../i18n';

const sameFactors = (a: ReadonlyArray<{ caseId: number; factor: number }>, b: ReadonlyArray<{ caseId: number; factor: number }>) => {
  const key = (l: ReadonlyArray<{ caseId: number; factor: number }>) => l.filter((f) => Math.abs(f.factor) > 1e-12).map((f) => `${f.caseId}:${f.factor}`).sort().join(' ');
  return key(a) === key(b);
};

/**
 * Adds the CIRSOC 101-2025 strength combinations the states call for, leaving out the ones the
 * model already has. Needs a state of type D. Returns how many were added, or null when refused.
 */
export function addCirsocCombinations(): number | null {
  const cases = modelStore.model.loadCases;
  if (!cases.some((c) => (c.type || '').toUpperCase() === 'D')) {
    uiStore.toast(t('course.influence.states.needDead'), 'error');
    return null;
  }
  const expanded = runEngineAction(() => expandCombinations(templateCombinationSpecs('lrfd', presentSymbols(cases), []), cases));
  if (!expanded) return null;
  const fresh = expanded.filter((c) => !modelStore.combinations.some((k) => sameFactors(k.factors, c.factors)));
  if (fresh.length) {
    modelStore.batch(() => { addGeneratedCombinations(fresh); });
    if (resultsStore.hasCombinations) resultsStore.combinationsDirty = true;
  }
  uiStore.toast(tp('course.influence.states.added', { n: fresh.length }), fresh.length ? 'success' : 'info');
  return fresh.length;
}

/** The combination that gives each member its largest |M|, |V| and |N|, from the solved combinations. */
export function governingByMember(): Map<number, GoverningPerElement> {
  const names = new Map(modelStore.model.combinations.map((c) => [c.id, c.name]));
  return computeGoverning2D(resultsStore.perCombo, names);
}

/** The loads table, where each load is given its state. */
export function openLoadsTable(): void {
  const detail: OpenPanelRequest = { panel: 'data', dataTab: 'loads', toggle: false };
  window.dispatchEvent(new CustomEvent(OPEN_PANEL_EVENT, { detail }));
}
