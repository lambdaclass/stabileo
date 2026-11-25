/**
 * Applied loads of a static result, shared by figures and the free-body view: the loads the solve
 * that gave the result was given, self-weight included, so the free body drawn with them balances.
 *
 * The result is the one being drawn, which a figure may choose (a combination exported while a
 * case is on screen): it is matched by identity against the solve's cases, combinations and
 * single solve, never read off the selection on screen.
 */
import { sumCombinationFactors } from '../engine/wasm-solver';
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { singleSolveModel, withCaseEffects } from '../engine/case-effects';
import { activeModel } from '../engine/member-behaviour';
import { selfWeightFor, selfWeightMemberLoads } from '../engine/self-weight';
import type { ModelData } from '../engine/solver-service';
import type { AnalysisResults3D } from '../engine/types-3d';
import { scaledLoad } from '../model/loads/load-magnitudes';
import type { Load } from './model.svelte';
import { t } from '../i18n';

/**
 * Why a free body of a result is not drawn as one state of equilibrium, or `spectral` when it is
 * drawn with a part (a spectral response) whose loads it cannot show.
 *   envelope   the largest value of each quantity, each from its own combination;
 *   magnitude  an SRSS or ABS combination: every quantity a magnitude, without a sign;
 *   spectral   a spectral case, or a combination taking one: the static loads only are drawn.
 */
export type DespieceNote = 'envelope' | 'magnitude' | 'spectral';

type Which =
  | { kind: 'case'; id: number } | { kind: 'combo'; id: number } | { kind: 'single' }
  | { kind: 'envelope' } | { kind: 'magnitude' } | { kind: 'other' };

function which3D(r: AnalysisResults3D): Which {
  if (r.magnitude) return { kind: 'magnitude' };
  const s = resultsStore;
  if (r === s.envelope3D?.maxAbsResults3D || r === s.fullEnvelope3D?.maxAbsResults3D
    || (r === s.results3D && s.activeView === 'envelope')) return { kind: 'envelope' };
  if (s.activeView === 'combo' && s.activeComboId !== null && s.perCombo3D.get(s.activeComboId) === r) return { kind: 'combo', id: s.activeComboId };
  if (s.activeView === 'single' && s.activeCaseId !== null && s.perCase3D.get(s.activeCaseId) === r) return { kind: 'case', id: s.activeCaseId };
  if (r === s.singleResults3D) return { kind: 'single' };
  for (const [id, v] of s.perCombo3D) if (v === r) return { kind: 'combo', id };
  for (const [id, v] of s.perCase3D) if (v === r) return { kind: 'case', id };
  return { kind: 'other' };
}

/** Whether a free body is drawn with its actions: not an envelope's nor a magnitude's, no state of equilibrium. */
export const despieceDrawsActions = (note: DespieceNote | null): boolean => note !== 'envelope' && note !== 'magnitude';

/** What the drawing says about a note, at its top. */
export function despieceNoteText(note: DespieceNote | null): string | undefined {
  return note === 'envelope' ? t('despiece.noteEnvelope')
    : note === 'magnitude' ? t('despiece.noteMagnitude')
    : note === 'spectral' ? t('despiece.noteSpectral') : undefined;
}

/** What the free body of `r` (the result on screen when absent) cannot claim; null for a static state. */
export function despieceNote3D(r: AnalysisResults3D | null | undefined = resultsStore.results3D): DespieceNote | null {
  if (!r) return null;
  const w = which3D(r);
  if (w.kind === 'envelope' || w.kind === 'magnitude') return w.kind;
  const spectral = new Set(modelStore.loadCases.filter((c) => c.spectral).map((c) => c.id));
  if (!spectral.size) return null;
  if (w.kind === 'case' && spectral.has(w.id)) return 'spectral';
  if (w.kind === 'combo' && modelStore.combinations.find((c) => c.id === w.id)?.factors.some((f) => f.factor !== 0 && spectral.has(f.caseId))) return 'spectral';
  return null;
}

let memo: { key: unknown[]; loads: Load[] } | undefined;

/**
 * The applied loads of `r`, the result on screen when absent. Envelopes and magnitude/advanced
 * results have no single set of static applied loads: none.
 */
export function displayedLoads3D(r: AnalysisResults3D | null | undefined = resultsStore.results3D): Load[] {
  if (!r) return modelStore.loads;
  const w = which3D(r);
  if (w.kind !== 'case' && w.kind !== 'combo' && w.kind !== 'single') return [];

  const isPro = uiStore.analysisMode === 'pro';
  const key = [r, w.kind, 'id' in w ? w.id : null, modelStore.modelVersion, modelStore.loads, modelStore.loadCases,
    modelStore.combinations, modelStore.model.analysis, uiStore.includeSelfWeight, uiStore.selfWeightCaseId, isPro, uiStore.axisConvention3D];
  if (memo && key.every((v, i) => v === memo!.key[i])) return memo.loads;

  // The settings the solve was given: PRO's self-weight rows, or Basic's rule (`analysisFor`).
  const include = uiStore.includeSelfWeight;
  const base = { ...activeModel(modelStore.model as unknown as ModelData), analysis: modelStore.solveAnalysis(isPro, include) } as ModelData;
  const firstId = Math.max(0, ...modelStore.loads.map((l) => l.data.id)) + 1_000_000;
  let loads: Load[];
  if (w.kind === 'single') {
    // Every load once, and the weight once, as the single solve takes them (`singleSolveModel`).
    const single = singleSolveModel(base, modelStore.loadCases);
    loads = [...single.loads, ...selfWeightMemberLoads(single, selfWeightFor(single, null, include), { plane: false, firstId })];
  } else {
    const cases = withCaseEffects(base, modelStore.loadCases, { includeSelfWeight: include, leftHand: uiStore.axisConvention3D === 'leftHand' });
    const combo = w.kind === 'combo' ? modelStore.combinations.find((c) => c.id === w.id) : undefined;
    const factors = new Map(sumCombinationFactors(combo?.factors ?? [{ caseId: w.id, factor: 1 }])
      .map(({ caseId, factor }) => [caseId, factor]));
    loads = cases.loads.flatMap((l) => {
      const k = factors.get(l.data.caseId ?? 1) ?? 0;
      return k === 0 ? [] : [k === 1 ? l : scaledLoad(l, k)];
    });
    // Each case's self-weight, as the per-case solve reads it (`selfWeightFor` on the cases as solved).
    const rows = [...factors].flatMap(([caseId, k]) => {
      const lc = modelStore.loadCases.find((c) => c.id === caseId);
      return k === 0 || !lc ? [] : selfWeightFor(cases, lc, include).map((row) => ({ ...row, factor: row.factor * k }));
    });
    loads.push(...selfWeightMemberLoads(cases, rows, { plane: false, firstId }));
  }
  // Case expansion can generate notional loads; do it once per model/result, not per camera frame.
  memo = { key, loads };
  return loads;
}
