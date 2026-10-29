import { knownIssueRefusal } from './known-issues';
/**
 * live-calc.ts — Extracted live-calculation logic from App.svelte.
 *
 * Provides two functions:
 *  - runLiveCalc()    — called inside the reactive $effect when liveCalc is ON
 *  - runGlobalSolve() — the manual solve: the 'stabileo-solve' global event, Calcular, and in 3D
 *                       Enter, the ribbon and the exports (`actions/solve.ts`)
 *
 * Both delegate to modelStore.solve / solve3D but encapsulate NaN-checking,
 * combination solving, diagram-type restoration and error handling so App.svelte
 * stays thin.
 */

import { meshDeferredSlabs, representFootprints } from '../model/building/deferred-slabs';
import { platesNeedingMesh, preparePlatesForAnalysis } from '../store/physical-plates';
import { noteBaseSolveInput } from '../store/result-provenance';
import { syncDefinedLoadsForAnalysis } from '../store/defined-loads';
import { spectralOrSay } from '../actions/solve';
import { nodesOnMembers } from './nodes-on-members';
import { localizeEngineText } from '../i18n/engine-text';
import { modelStore, resultsStore, uiStore } from '../store';
import { instability } from '../store/instability.svelte';
import { recheckStore } from '../store/recheck.svelte';
import { is3DWorkspace } from '../utils/workspace';
import { requestAutosave } from '../store/autosave-service';
import { publishCombinations3D, activePerCombo3D } from '../store/active-results';
import { t, tp } from '../i18n';
import { initSolver, isWasmReady, combineResults3D } from './wasm-solver';
import { computeGoverning2D, computeGoverning3D } from './governing-case';
import { hasNonlinearBehaviour } from './member-behaviour';
import { allLoadsResult3D } from './shell-combos';
import { markAllLoads } from './solver-service';
import { singleSolveFactors } from './case-effects';
import { reportSolverDiagnostics, reportModelDiagnostics } from './solve-diagnostics';
import { solveForEdu } from '../../components/edu/edu-solver';
import { hasInvalid2DDisplacements, hasInvalid3DDisplacements } from '../geometry/coordinate-system';

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatSolveTiming(timings: any): string {
  if (!timings) return '';
  const totalMs =
    typeof timings.totalMs === 'number' ? timings.totalMs :
    typeof timings.total_us === 'number' ? timings.total_us / 1000 :
    typeof timings.totalUs === 'number' ? timings.totalUs / 1000 :
    null;
  if (totalMs == null || !Number.isFinite(totalMs)) return '';
  return totalMs >= 1000
    ? ` (${(totalMs / 1000).toFixed(2)} s)`
    : ` (${totalMs.toFixed(1)} ms)`;
}

const VALID_2D_DIAGRAMS = ['deformed', 'moment', 'shear', 'axial', 'colorMap', 'axialColor'] as const;
const VALID_3D_DIAGRAMS = ['deformed', 'momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion', 'axialColor', 'colorMap'] as const;

// ─── Stale-response discipline ─────────────────────────────────────────────
// Solves are async now: while a solve is in flight the user can keep editing
// (bumping modelStore.modelVersion) or trigger a newer solve. Each solve
// request captures what it solves and a monotonically increasing request
// id; results are written to the stores only if both are still current.
let solveRequestSeq = 0;

/**
 * What a solve reads: the model, and the settings it reads besides it. Self-weight on or off (and
 * its case) clears the results without moving the model version (App.svelte), and a solve in
 * flight then published its answer without self-weight under the switch.
 */
function solveInputKey(): string {
  return [
    modelStore.modelVersion, uiStore.analysisMode, uiStore.includeSelfWeight, uiStore.selfWeightCaseId,
    uiStore.axisConvention3D, uiStore.drawPlane2D,
  ].join('|');
}

function nextSolveGuard(): () => boolean {
  const inputAtStart = solveInputKey();
  const requestId = ++solveRequestSeq;
  return () => solveInputKey() !== inputAtStart || requestId !== solveRequestSeq;
}

/** How a manual solve ended. */
export type GlobalSolveOutcome =
  /** `combinationsLeftOut`: the model's combinations were to be solved and were not, and why. */
  | { ok: true; combinationsLeftOut: string | null }
  | { ok: false; error: string };

/** The last manual solve's failure, and what it was a failure of. */
let lastFailure: { input: string; error: string } | null = null;

/**
 * Why the last manual solve failed, while the model and its settings are still what it failed on.
 * An export asked for right after PRO's solve failed (`pro/export-results.ts` then
 * `actions/solve.ts` `ensureResults`) solved the same model again: the same failure, said twice.
 */
export function lastSolveFailure(): string | null {
  return lastFailure && lastFailure.input === solveInputKey() ? lastFailure.error : null;
}

// ─── Live Calc (reactive $effect) ─────────────────────────────────────────

/**
 * Execute live calculation (auto-solve on model change).
 * Called from the $effect in App.svelte when liveCalc is enabled.
 * Sets results/errors directly on the stores, unless the solve went stale
 * (model edited or a newer solve started while it was in flight).
 *
 * @param analysisMode  Current analysis mode ('2d' | '3d' | 'edu')
 * @param axisConvention3D  Current 3D axis convention string
 * @param prevDiagram  Diagram type the user was viewing before clear() — restored after solve
 */
export async function runLiveCalc(analysisMode: string, axisConvention3D: string, prevDiagram?: string): Promise<void> {
  // Skip if model is incomplete (e.g., mid-example-load after clear but before fixture applied)
  if (modelStore.nodes.size < 2 || modelStore.elements.size < 1) return;
  // Floor loads kept as definitions, current before the guard is taken: the edit that started this
  // solve may not have been rewritten yet (`store/defined-loads.ts`).
  if (is3DWorkspace(analysisMode)) syncDefinedLoadsForAnalysis();
  const isStale = nextSolveGuard();
  try {
    if (is3DWorkspace(analysisMode)) {
      await liveCalc3D(axisConvention3D, isStale);
    } else {
      await liveCalc2D(isStale);
    }
    if (isStale()) return;
    const is3DMode = is3DWorkspace(analysisMode);
    // What was on screen before the edit cleared it: diagram, case, combination.
    // Only onto results: a solve that published none (WASM not ready, an error,
    // NaN displacements) leaves the view waiting for the next one.
    if (resultsStore.pendingView) {
      if (is3DMode ? resultsStore.results3D : resultsStore.results) resultsStore.restoreView(is3DMode);
      return;
    }
    // Restore the diagram type the user was viewing before clear() reset it to 'none'.
    // Only restore if it's a valid diagram for the current mode — and only if
    // nothing is showing: a diagram picked while the solve was running (a slow
    // space model under Explore) is the user's latest choice, and restoring
    // the one captured when the solve was queued put it back to the deformed shape.
    if (prevDiagram && prevDiagram !== 'none' && resultsStore.diagramType === 'none') {
      const is3D = is3DWorkspace(analysisMode);
      const validList: readonly string[] = is3D ? VALID_3D_DIAGRAMS : VALID_2D_DIAGRAMS;
      if (validList.includes(prevDiagram)) {
        resultsStore.diagramType = prevDiagram as any;
      }
    }
  } catch (err: any) {
    if (!isStale()) uiStore.liveCalcError = err.message ?? t('error.unknown');
  }
}

async function liveCalc3D(axisConvention: string, isStale: () => boolean): Promise<void> {
  if (!isWasmReady()) {
    initSolver().catch((err) => {
      console.error('[liveCalc3D] WASM initialization failed:', err);
      uiStore.liveCalcError = err?.message ?? t('error.unknown');
    });
    return;
  }
  const isPro = uiStore.analysisMode === 'pro';
  // A plate with no mesh, or one out of date, is not in the model the solve reads: results now would
  // leave it out. Live calc does not mesh behind an edit; the manual analysis does.
  const unmeshed = platesNeedingMesh();
  if (unmeshed.length > 0) {
    uiStore.liveCalcError = tp('plates.liveNeedsMesh', { n: unmeshed.length });
    return;
  }
  const r = await modelStore.solve3DAsync(uiStore.includeSelfWeight, axisConvention === 'leftHand', isPro);
  if (isStale()) return;
  if (typeof r === 'string') {
    uiStore.liveCalcError = r;
    return;
  }
  if (!r) return;

  if (hasInvalid3DDisplacements(r.displacements as Array<{ ux: number; uy: number; uz: number }>)) {
    uiStore.liveCalcError = t('results.numericError3d');
    return;
  }

  resultsStore.setResults3D(r, true);

  /*
   * The combinations, when what was on screen was one of them (or a case, or
   * the envelope): the 3D live calc skips them otherwise, as the model may be
   * large, but re-solving a combination's view to the unit-factor loads would
   * show a different state under the same controls.
   */
  const v = resultsStore.pendingView;
  if (v && modelStore.model.combinations.length > 0 && (v.view !== 'single' || v.caseId !== null)) {
    const combo = modelStore.solveCombinations3D(uiStore.includeSelfWeight, axisConvention === 'leftHand', isPro);
    if (combo && typeof combo !== 'string') {
      resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
      const comboNames = new Map<number, string>();
      for (const c of modelStore.model.combinations) comboNames.set(c.id, c.name);
      // Over what design reads (`activePerCombo3D`): never a service or an SRSS or ABS combination.
      resultsStore.setGoverning3D(computeGoverning3D(activePerCombo3D(), comboNames));
    }
  }
}

async function liveCalc2D(isStale: () => boolean): Promise<void> {
  const r = await modelStore.solveAsync(uiStore.includeSelfWeight, uiStore.drawPlane2D);
  if (isStale()) return;
  if (typeof r === 'string') {
    uiStore.liveCalcError = r;
    return;
  }
  if (!r) return;

  if (hasInvalid2DDisplacements(r.displacements as Array<{ ux: number; uz?: number; uy?: number; ry?: number; rz?: number }>)) {
    uiStore.liveCalcError = t('results.numericError');
    return;
  }

  resultsStore.setResults(r, true);

  // Auto-solve combinations if defined (sync single WASM call — the model
  // cannot drift while it runs, so no extra stale check is needed here)
  if (modelStore.model.combinations.length > 0) {
    const combo = modelStore.solveCombinations(uiStore.includeSelfWeight, uiStore.drawPlane2D);
    if (combo && typeof combo !== 'string') {
      resultsStore.setCombinationResults(combo.perCase, combo.perCombo, combo.envelope);
      const comboNames = new Map<number, string>();
      for (const c of modelStore.model.combinations) comboNames.set(c.id, c.name);
      resultsStore.setGoverning2D(computeGoverning2D(combo.perCombo, comboNames));
    }
  }
}

// ─── Global Solve (manual "Calcular" button) ─────────────────────────────

/**
 * Solve the structure manually (Calcular, and in 3D Enter, the ribbon and the exports through
 * `actions/solve.ts`). Handles 2D and 3D, combinations, toasts and mobile panel, and says how it
 * ended. Throws only when the solver cannot be started.
 */
/**
 * The shell's pending live calc (App.svelte debounces it after each edit), cancelled by every manual
 * solve: Enter, the ribbon, an export, the re-run. A live calc firing during the manual solve would
 * supersede it under the solve guard, and the manual solve would report "the model changed" for a
 * model nobody touched, or publish the live calc's single solve in its place.
 */
let cancelPendingLiveCalc: (() => void) | null = null;

export function registerLiveCalcCanceller(cancel: (() => void) | null): void {
  cancelPendingLiveCalc = cancel;
}

export async function runGlobalSolve(options: { directBase?: boolean } = {}): Promise<GlobalSolveOutcome> {
  cancelPendingLiveCalc?.();
  // A solve that was asked for the combinations and did not get them must not end the stale state
  // (`store/recheck.svelte.ts`): its single-solve publish stamps the project, so the stamp before it
  // is put back below. Every entry point, not only the re-check's re-run.
  const stampBefore = recheckStore.capture();
  // Slabs placed to be meshed at the analysis get their mesh first, so what follows (the floor
  // loads, the solve, the results, the slab design) reads the mesh (`deferred-slabs.ts`).
  if (uiStore.is3DWorkspace) {
    // A slab meshed before its columns' sections were represented is meshed again with them
    // (`column-footprints.ts`): held at one node, its load split is the mesh's, not the building's.
    const f = representFootprints();
    if (f.slabs > 0) uiStore.toast(tp('building.slabs.footprintsAtSolve', { n: f.slabs }), 'info');
    const m = meshDeferredSlabs();
    if (m.slabs > 0) uiStore.toast(tp('building.slabs.meshedAtSolve', { n: m.slabs, shells: m.shells }), 'info');
    // Physical plates with no mesh or an out-of-date one (`store/physical-plates.ts`): meshed here,
    // once for the whole solve and before its inputs are taken, or the solve stops and says which.
    const p = preparePlatesForAnalysis();
    if (!p.ok) {
      const error = tp(p.reason === 'needsMesh' ? 'plates.analysisNeedsMesh' : p.reason === 'localLoads' ? 'plates.analysisLocalLoads' : 'plates.analysisMeshRefused', { names: p.plates.join(', ') });
      uiStore.toast(error, 'error');
      return { ok: false, error };
    }
    if (p.meshed > 0) uiStore.toast(tp('plates.meshedAtAnalysis', { n: p.meshed, cells: p.cells }), 'info');
  }
  // Floor loads kept as definitions are rewritten first when the model moved under them, so the
  // guard below starts from the model that is solved (`store/defined-loads.ts`).
  if (uiStore.is3DWorkspace) syncDefinedLoadsForAnalysis();
  // Supersede any in-flight solve (live calc or an earlier manual solve).
  const isStale = nextSolveGuard();
  const input = solveInputKey();

  // Pre-solve model hygiene, for the modes that had none. The PRO exclusion
  // is inside `reportModelDiagnostics` itself, so this call site — like the
  // one in `actions/solve.ts` — cannot forget it.
  //
  // Deliberately here and not in `runLiveCalc`: live calc re-solves on every
  // edit, so the same warning would fire on each keystroke of a half-built
  // model. A manual solve is the moment the user asserts the model is ready.
  reportModelDiagnostics();
  let outcome: GlobalSolveOutcome;
  if (uiStore.is3DWorkspace) {
    await ensureWasmReady('runGlobalSolve');
    outcome = await globalSolve3D(isStale, options.directBase ?? false);
  } else if (uiStore.analysisMode === 'edu') {
    // Education owns its own solve lifecycle (results are withheld until the
    // student answers), so dispatch to it explicitly.
    //
    // This used to be a bare `return`, on the assumption that edu-solver's own
    // window listener had already fired on the same 'stabileo-solve' event.
    // That made correctness depend on listener-registration order — and
    // edu-solver only registered on EducativePanel mount, so a solve dispatched
    // before mount silently did nothing at all. A direct call has no ordering
    // hazard and cannot double-solve.
    solveForEdu();
    return { ok: true, combinationsLeftOut: null };
  } else {
    outcome = await globalSolve2D(isStale);
  }
  if (!isStale()) {
    lastFailure = outcome.ok ? null : { input, error: outcome.error };
    resultsStore.restoreView(uiStore.is3DWorkspace);
  }
  if (outcome.ok && outcome.combinationsLeftOut !== null) recheckStore.restoreStamp(stampBefore);
  // A solve is minutes of computed state produced by one click. Waiting for the 30 s timer
  // to notice is how a run gets lost to a closed tab.
  void requestAutosave('solve');
  return outcome;
}

async function ensureWasmReady(context: string): Promise<void> {
  if (isWasmReady()) return;
  try {
    console.warn(`[${context}] WASM solver not ready, initializing now...`);
    await initSolver();
  } catch (err: any) {
    console.error(`[${context}] WASM initialization failed:`, err);
    throw new Error(err?.message || t('toast.solverInitFailed'));
  }
}

/** Show solver diagnostic warnings/errors as toasts (max 2 to avoid spam).
 *  Lives in `solve-diagnostics.ts` so Education shares the same reporting. */
const showSolverWarningToasts = reportSolverDiagnostics;

/**
 * The action a failed solve's message offers. When members pass nodes they are not cut at,
 * which is how a first model usually falls apart, the fix is one command away and the message
 * offers it; otherwise a mechanism message offers the kinematic panel.
 */
function solveErrorAction(msg: string): string | undefined {
  if (nodesOnMembers(modelStore.nodes, modelStore.elements.values()).length > 0) return 'split-at-nodes';
  return isMechanismError(msg) ? 'kinematic' : undefined;
}

/** Detect if an error message is mechanism/hipostatic-related */
function isMechanismError(msg: string): boolean {
  const lc = msg.toLowerCase();
  return lc.includes('mecanismo') || lc.includes('hipostática') || lc.includes('singular') || lc.includes('inestable')
    || lc.includes('mechanism') || lc.includes('hypostatic') || lc.includes('unstable');
}

async function globalSolve3D(isStale: () => boolean, directBase: boolean): Promise<GlobalSolveOutcome> {
  const isPro = uiStore.analysisMode === 'pro';
  const leftHand = uiStore.axisConvention3D === 'leftHand';
  // Basic with load cases off shows no combinations: none are solved.
  const hasCombos = modelStore.model.combinations.length > 0 && uiStore.showLoadCasePicker;
  const t0 = performance.now();
  // Superseded: an edit, a setting or a newer solve. Nothing was published.
  const stale: GlobalSolveOutcome = { ok: false, error: t('results.editedDuringSolve') };
  const failed = (error: string): GlobalSolveOutcome => ({ ok: false, error });

  const runSingleSolve = async (): Promise<GlobalSolveOutcome> => {
    const r = await modelStore.solve3DAsync(uiStore.includeSelfWeight, leftHand, isPro);
    if (isStale()) return stale;
    if (typeof r === 'string') {
      uiStore.toast(knownIssueRefusal(r) ?? localizeEngineText(r), 'error', solveErrorAction(r));
      // Name the mechanism, when that is what stopped it (`store/instability.svelte.ts`).
      if (isPro) instability.explain(uiStore.includeSelfWeight, leftHand);
      return failed(knownIssueRefusal(r) ?? localizeEngineText(r));
    }
    if (!r) {
      uiStore.toast(t('results.emptyModelError'), 'error');
      return failed(t('results.emptyModelError'));
    }
    instability.clear();
    if (hasInvalid3DDisplacements(r.displacements as Array<{ ux: number; uy: number; uz: number }>)) {
      uiStore.toast(t('results.numericError3d'), 'error');
      return failed(t('results.numericError3d'));
    }
    resultsStore.setResults3D(r);
    const timeStr = formatSolveTiming(r.timings);
    uiStore.toast(
      `${t('results.analysis3dSuccess')}${timeStr} — ${r.elementForces.length} ${t('results.bars')}, ${r.reactions.length} ${t('results.reactions')}`,
      'success',
    );
    showSolverWarningToasts(r.solverDiagnostics);
    return { ok: true, combinationsLeftOut: null };
  };

  /** The combinations and "All loads" published, or why the combinations could not be had. */
  const runComboSolve = async (): Promise<GlobalSolveOutcome | string> => {
    // Version guard: capture the model's mutation epoch right before dispatching
    // the async solve. If the model changed while the (worker-based) combo solve
    // was in flight, the result below describes a superseded model — publishing
    // it would resurrect pre-edit forces as current over whatever the mid-flight
    // edit already cleared. Discard silently instead (no fallback re-solve, no
    // toast): the next live-calc pass / manual solve will pick up the new model.
    const solveEpoch = modelStore.modelVersion;
    const comboResult = await modelStore.solveCombinations3DParallel(uiStore.includeSelfWeight, leftHand, isPro, isPro ? spectralOrSay() : undefined);
    if (isStale()) return stale;
    if (typeof comboResult === 'string') return comboResult;
    if (!comboResult) return t('results.emptyModelError');
    if (modelStore.modelVersion !== solveEpoch) return stale;

    // "All loads" is an unfactored physical load state, the single solve's (`case-effects.ts`
    // `singleSolveModel`). Only a linear model can reuse the sum of independently solved cases:
    // one-way members and lifting/curved supports need the active set of the combined loads,
    // including settlements exactly once. And the sum is taken at the single solve's factors
    // (`singleSolveFactors`): at 1 each, a composite case's parts were counted twice. Where no
    // factors give it (a notional case, the older self-weight switch on several dead-load cases),
    // the single solve is solved.
    // A reproduction must keep the original arithmetic: a sum of case solves is not bit-for-bit
    // identical to solving all loads together, even for a linear model.
    const listedFactors = directBase || hasNonlinearBehaviour(modelStore.model) ? null : singleSolveFactors(modelStore.model.loadCases, {
      // The rows a solve reads are PRO's; elsewhere the older switch (`analysisFor`).
      legacySelfWeight: uiStore.includeSelfWeight && !(isPro && modelStore.model.analysis?.selfWeight),
    });
    const caseIds = [...comboResult.perCase.keys()];
    const factors = caseIds.map((caseId) => ({ caseId, factor: listedFactors?.get(caseId) ?? 1 })).filter((f) => f.factor !== 0);
    let firstCaseResult;
    if (listedFactors === null || factors.length === 0) {
      const single = await modelStore.solve3DAsync(uiStore.includeSelfWeight, leftHand, isPro);
      if (isStale() || modelStore.modelVersion !== solveEpoch) return stale;
      if (typeof single === 'string') return single;
      firstCaseResult = single;
    } else {
      const only = factors.length === 1 && factors[0]!.factor === 1 ? comboResult.perCase.get(factors[0]!.caseId) : null;
      const combined = only ? null : combineResults3D(factors, comboResult.perCase);
      firstCaseResult = only ?? (combined ? allLoadsResult3D(combined, comboResult.perCase, modelStore.plates, factors) : null);
      // No single solve returned this sum: the discretization estimate reads the one it stands for.
      if (firstCaseResult) markAllLoads(firstCaseResult, comboResult.perCase, factors);
    }
    if (!firstCaseResult) return t('results.emptyModelError');
    // The same check the single solve makes, on everything this path would publish: the base and
    // every case and combination. A NaN here goes back as the combinations' failure, and the
    // single-solve fallback refuses a NaN base by itself.
    const invalid = (r: { displacements: unknown[] }) => hasInvalid3DDisplacements(r.displacements as Array<{ ux: number; uy: number; uz: number }>);
    if (invalid(firstCaseResult) || [...comboResult.perCase.values(), ...comboResult.perCombo.values()].some(invalid)) {
      return t('results.numericError3d');
    }

    resultsStore.setResults3D(firstCaseResult);
    // A case, or the sum of the cases, has no engine input of its own: the provenance names the
    // direct single solve's (store/result-provenance.ts), so reports carry engine hashes and the
    // CLI reproduce has an input to run.
    noteBaseSolveInput(modelStore.singleSolveInput3D(uiStore.includeSelfWeight, leftHand, isPro),
      listedFactors === null || factors.length === 0 ? 'direct' : 'case-superposition');
    publishCombinations3D(comboResult);

    const elapsed = performance.now() - t0;
    const timeStr = elapsed >= 1000 ? (elapsed / 1000).toFixed(2) + ' s' : elapsed.toFixed(0) + ' ms';
    const nBars = firstCaseResult?.elementForces.length ?? 0;
    const nReac = firstCaseResult?.reactions.length ?? 0;
    uiStore.toast(
      `${t('results.analysis3dSuccess')} (${timeStr}) — ${nBars} ${t('results.bars')}, ${nReac} ${t('results.reactions')} + ${comboResult.perCombo.size} ${t('results.combinations')}`,
      'success',
    );
    showSolverWarningToasts(firstCaseResult.solverDiagnostics);
    return { ok: true, combinationsLeftOut: null };
  };

  // When combinations exist, use parallel Web Workers for maximum performance
  if (hasCombos) {
    /** The single solve stands; the combinations it was asked for are not there, and why. */
    const withoutCombinations = (fallback: GlobalSolveOutcome, why: string): GlobalSolveOutcome =>
      fallback.ok ? { ok: true, combinationsLeftOut: knownIssueRefusal(why) ?? localizeEngineText(why) } : fallback;
    if (isPro) {
      // The combination solve already returns per-case results (runComboSolve
      // seeds the baseline/current view from the first per-case result), so the
      // old eager baseline single-solve was redundant work — a full extra solve
      // on every PRO solve. Run combos directly; fall back to a single solve
      // ONLY if the combination path fails, so the user still gets results.
      try {
        const combo = await runComboSolve();
        if (typeof combo !== 'string') return combo;
        console.warn('[globalSolve3D] Combination solve returned error in PRO, falling back to single solve:', combo);
        const fallback = await runSingleSolve();
        // Said either way: with the fallback the model is solved, but without the
        // combinations asked for — an empty active list, for one, is refused here. The
        // command that may fix a solve is offered only when the fallback failed too.
        uiStore.toast(knownIssueRefusal(combo) ?? localizeEngineText(combo), 'info', fallback.ok ? undefined : solveErrorAction(combo));
        return withoutCombinations(fallback, combo);
      } catch (e: any) {
        console.error('[globalSolve3D] Combination solving failed in PRO, falling back to single solve:', e.message);
        const fallback = await runSingleSolve();
        if (!fallback.ok) uiStore.toast(knownIssueRefusal(e) ?? localizeEngineText(e.message), 'info', solveErrorAction(e.message));
        return withoutCombinations(fallback, e.message);
      }
    }

    // As in PRO: the single solve stands in, and the combinations' failure is said as
    // information next to its success, or as the error (with its action) when it failed too.
    try {
      const combo = await runComboSolve();
      if (typeof combo !== 'string') return combo;
      console.warn('[globalSolve3D] Combination solve returned error, falling back to single solve:', combo);
      const fallback = await runSingleSolve();
      uiStore.toast(knownIssueRefusal(combo) ?? localizeEngineText(combo), fallback.ok ? 'info' : 'error', fallback.ok ? undefined : solveErrorAction(combo));
      return withoutCombinations(fallback, combo);
    } catch (e: any) {
      console.error('[globalSolve3D] Combination solving failed:', e.message);
      const fallback = await runSingleSolve();
      uiStore.toast(knownIssueRefusal(e) ?? localizeEngineText(e.message), fallback.ok ? 'info' : 'error', fallback.ok ? undefined : solveErrorAction(e.message));
      return withoutCombinations(fallback, e.message);
    }
  }

  // No combinations — single solve only
  return runSingleSolve();
}

async function globalSolve2D(isStale: () => boolean): Promise<GlobalSolveOutcome> {
  const r = await modelStore.solveAsync(uiStore.includeSelfWeight, uiStore.drawPlane2D);
  if (isStale()) return { ok: false, error: t('results.editedDuringSolve') };
  if (typeof r === 'string') {
    uiStore.toast(knownIssueRefusal(r) ?? localizeEngineText(r), 'error', solveErrorAction(r));
    return { ok: false, error: knownIssueRefusal(r) ?? localizeEngineText(r) };
  }
  if (!r) {
    uiStore.toast(t('results.emptyModelError'), 'error');
    return { ok: false, error: t('results.emptyModelError') };
  }

  if (hasInvalid2DDisplacements(r.displacements as Array<{ ux: number; uz?: number; uy?: number; ry?: number; rz?: number }>)) {
    uiStore.toast(t('results.numericError'), 'error', 'kinematic');
    return { ok: false, error: t('results.numericError') };
  }

  resultsStore.setResults(r);

  const kin = modelStore.kinematicResult;
  let classText = '';
  if (kin) {
    if (kin.classification === 'isostatic') classText = ` — ${t('results.isostatic')}`;
    else if (kin.classification === 'hyperstatic') classText = ` — ${t('results.hyperstatic')} (${t('results.degree')} ${kin.degree})`;
  }

  // Auto-solve combinations if defined
  let comboText = '';
  let combinationsLeftOut: string | null = null;
  if (modelStore.model.combinations.length > 0) {
    const comboResult = modelStore.solveCombinations(uiStore.includeSelfWeight, uiStore.drawPlane2D);
    if (typeof comboResult === 'string') combinationsLeftOut = knownIssueRefusal(comboResult) ?? localizeEngineText(comboResult);
    else if (!comboResult) combinationsLeftOut = t('results.emptyModelError');
    else {
      resultsStore.setCombinationResults(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
      const comboNames = new Map<number, string>();
      for (const c of modelStore.model.combinations) comboNames.set(c.id, c.name);
      resultsStore.setGoverning2D(computeGoverning2D(comboResult.perCombo, comboNames));
      comboText = ` + ${comboResult.perCombo.size} ${t('results.combinations')}`;
    }
  }

  const timeStr = formatSolveTiming(r.timings);
  uiStore.toast(
    `${t('results.calcSuccess')}${classText}${timeStr} — ${r.elementForces.length} ${t('results.bars')}, ${r.reactions.length} ${t('results.reactions')}${comboText}`,
    'success',
  );

  // Show solver warnings/errors as separate toasts
  showSolverWarningToasts(r.solverDiagnostics);
  return { ok: true, combinationsLeftOut };
}
