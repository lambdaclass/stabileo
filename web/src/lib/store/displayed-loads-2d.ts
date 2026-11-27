/**
 * Applied loads of a plane static result, for the 2D free-body view and its figure: the loads the
 * plane solve that gave the result was given (`solver-service.ts` `buildSolverLoads2D`), so the
 * free body drawn with them balances. The 3D counterpart is `displayed-loads-3d.ts`.
 *
 *   a case          its own loads, and the self-weight when Basic's rule puts it in that case;
 *   a combination   its cases' loads and weight, each times its factor (the combination is the
 *                   factored sum of the cases' results, `combineResults`);
 *   the single solve every load once, and the weight once when it is on;
 *   an envelope     none: no state of equilibrium (`despieceNote2D`).
 *
 * The plane solve takes each case's own loads: a case's includes, notional loads and reduction
 * are read by the space solve only (`case-effects.ts`), and are not drawn here either.
 *
 * The result is matched by identity against the solve's, never read off the selection alone.
 */
import { sumCombinationFactors } from '../engine/wasm-solver';
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { selfWeightFor, selfWeightMemberLoads } from '../engine/self-weight';
import { GRAVITY_SELF_WEIGHT } from '../engine/analysis-settings';
import type { AnalysisResults } from '../engine/types';
import { scaledLoad } from '../model/loads/load-magnitudes';
import type { Load } from './model.svelte';
import type { DespieceNote } from './displayed-loads-3d';

export type PlaneLoadView = { kind: 'case'; id: number } | { kind: 'combo'; id: number } | { kind: 'single' } | { kind: 'envelope' } | { kind: 'other' };

export function planeLoadView(r: AnalysisResults | null): PlaneLoadView {
  if (!r) return { kind: 'other' };
  const s = resultsStore;
  if (r === s.envelope?.maxAbsResults || (r === s.results && s.activeView === 'envelope')) return { kind: 'envelope' };
  if (s.activeView === 'combo' && s.activeComboId !== null && s.perCombo.get(s.activeComboId) === r) return { kind: 'combo', id: s.activeComboId };
  if (s.activeView === 'single' && s.activeCaseId !== null && s.perCase.get(s.activeCaseId) === r) return { kind: 'case', id: s.activeCaseId };
  if (r === s.singleResults) return { kind: 'single' };
  for (const [id, v] of s.perCombo) if (v === r) return { kind: 'combo', id };
  for (const [id, v] of s.perCase) if (v === r) return { kind: 'case', id };
  return { kind: 'other' };
}

/** What the free body of `r` (the result on screen when absent) cannot claim; null for a static state. */
export function despieceNote2D(r: AnalysisResults | null | undefined = resultsStore.screen.results): DespieceNote | null {
  return r && (resultsStore.screen.held && r === resultsStore.screen.results ? resultsStore.screen.planeLoadView : planeLoadView(r)).kind === 'envelope' ? 'envelope' : null;
}

/** The applied loads of `r`, the result on screen when absent; none for a result of no one load state. */
export function displayedLoads2D(r: AnalysisResults | null | undefined = resultsStore.screen.results): Load[] {
  if (!r) return modelStore.loads;
  const w = (resultsStore.screen.held && r === resultsStore.screen.results ? resultsStore.screen.planeLoadView : planeLoadView(r));
  if (w.kind !== 'case' && w.kind !== 'combo' && w.kind !== 'single') return [];
  const held = r === resultsStore.screen.results ? resultsStore.screen.model : undefined;
  const include = held?.includeSelfWeight ?? uiStore.includeSelfWeight;
  const model = held ?? modelStore.model;
  const firstId = Math.max(0, ...model.loads.map((l) => l.data.id)) + 1_000_000;
  // The plane solve's weight is the whole model's, straight down (`buildSolverLoads2D`).
  const weight = (caseId: number, k: number) => selfWeightMemberLoads(model, [{ caseId, ...GRAVITY_SELF_WEIGHT, factor: GRAVITY_SELF_WEIGHT.factor * k }], { plane: true, firstId });
  if (w.kind === 'single') return [...model.loads, ...(include ? weight(0, 1) : [])];

  // Basic's rule for which case carries the weight, as the plane solve is given it (`remapModelForPlane`).
  const analysis = held ? held.planeAnalysis : modelStore.solveAnalysis(false, include);
  const combo = w.kind === 'combo' ? model.combinations.find((c) => c.id === w.id) : undefined;
  const factors = new Map(sumCombinationFactors(combo?.factors ?? [{ caseId: w.id, factor: 1 }])
    .map(({ caseId, factor }) => [caseId, factor]));
  const out: Load[] = [];
  for (const l of model.loads) {
    const k = factors.get(l.data.caseId ?? 1) ?? 0;
    if (k !== 0) out.push(k === 1 ? l : scaledLoad(l, k));
  }
  for (const [caseId, k] of factors) {
    const lc = model.loadCases.find((c) => c.id === caseId);
    if (k !== 0 && lc && selfWeightFor({ analysis }, lc, include).length > 0) out.push(...weight(caseId, k));
  }
  return out;
}
