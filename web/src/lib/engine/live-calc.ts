/**
 * live-calc.ts — Extracted live-calculation logic from App.svelte.
 *
 * Provides two functions:
 *  - runLiveCalc()    — called inside the reactive $effect when liveCalc is ON
 *  - runGlobalSolve() — called from the 'stabileo-solve' global event (manual solve)
 *
 * Both delegate to modelStore.solve / solve3D but encapsulate NaN-checking,
 * combination solving, diagram-type restoration and error handling so App.svelte
 * stays thin.
 */

import { modelStore, resultsStore, uiStore } from '../store';
import { requestAutosave } from '../store/autosave-service';
import { t } from '../i18n';
import { initSolver, isWasmReady } from './wasm-solver';
import { computeGoverning2D, computeGoverning3D } from './governing-case';
import { reportSolverDiagnostics } from './solve-diagnostics';
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
// request captures the model version and a monotonically increasing request
// id; results are written to the stores only if both are still current.
let solveRequestSeq = 0;

function nextSolveGuard(): () => boolean {
  const versionAtStart = modelStore.modelVersion;
  const requestId = ++solveRequestSeq;
  return () => modelStore.modelVersion !== versionAtStart || requestId !== solveRequestSeq;
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
  const isStale = nextSolveGuard();
  try {
    if (analysisMode === '3d' || analysisMode === 'pro') {
      await liveCalc3D(axisConvention3D, isStale);
    } else {
      await liveCalc2D(isStale);
    }
    if (isStale()) return;
    // Restore the diagram type the user was viewing before clear() reset it to 'none'.
    // Only restore if it's a valid diagram for the current mode.
    if (prevDiagram && prevDiagram !== 'none') {
      const is3D = analysisMode === '3d' || analysisMode === 'pro';
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
 * Solve the structure manually (triggered by Enter key / Calcular button).
 * Handles 2D and 3D, combinations, toasts and mobile panel.
 */
export async function runGlobalSolve(): Promise<void> {
  // Supersede any in-flight solve (live calc or an earlier manual solve).
  const isStale = nextSolveGuard();
  if (uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro') {
    await ensureWasmReady('runGlobalSolve');
    await globalSolve3D(isStale);
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
    return;
  } else {
    await globalSolve2D(isStale);
  }
  // A solve is minutes of computed state produced by one click. Waiting for the 30 s timer
  // to notice is how a run gets lost to a closed tab.
  void requestAutosave('solve');
}

async function ensureWasmReady(context: string): Promise<void> {
  if (isWasmReady()) return;
  try {
    console.warn(`[${context}] WASM solver not ready, initializing now...`);
    await initSolver();
  } catch (err: any) {
    console.error(`[${context}] WASM initialization failed:`, err);
    throw new Error(err?.message || 'WASM solver initialization failed.');
  }
}

/** Show solver diagnostic warnings/errors as toasts (max 2 to avoid spam).
 *  Lives in `solve-diagnostics.ts` so Education shares the same reporting. */
const showSolverWarningToasts = reportSolverDiagnostics;

/** Detect if an error message is mechanism/hipostatic-related */
function isMechanismError(msg: string): boolean {
  const lc = msg.toLowerCase();
  return lc.includes('mecanismo') || lc.includes('hipostática') || lc.includes('singular') || lc.includes('inestable')
    || lc.includes('mechanism') || lc.includes('hypostatic') || lc.includes('unstable');
}

async function globalSolve3D(isStale: () => boolean): Promise<void> {
  const isPro = uiStore.analysisMode === 'pro';
  const leftHand = uiStore.axisConvention3D === 'leftHand';
  const hasCombos = modelStore.model.combinations.length > 0;
  const t0 = performance.now();

  const runSingleSolve = async () => {
    const r = await modelStore.solve3DAsync(uiStore.includeSelfWeight, leftHand, isPro);
    if (isStale()) return null;
    if (typeof r === 'string') {
      uiStore.toast(r, 'error');
      return null;
    }
    if (!r) {
      uiStore.toast(t('results.emptyModelError'), 'error');
      return null;
    }
    resultsStore.setResults3D(r);
    const timeStr = formatSolveTiming(r.timings);
    uiStore.toast(
      `${t('results.analysis3dSuccess')}${timeStr} — ${r.elementForces.length} ${t('results.bars')}, ${r.reactions.length} ${t('results.reactions')}`,
      'success',
    );
    showSolverWarningToasts(r.solverDiagnostics);
    return r;
  };

  const runComboSolve = async () => {
    // Version guard: capture the model's mutation epoch right before dispatching
    // the async solve. If the model changed while the (worker-based) combo solve
    // was in flight, the result below describes a superseded model — publishing
    // it would resurrect pre-edit forces as current over whatever the mid-flight
    // edit already cleared. Discard silently instead (no fallback re-solve, no
    // toast): the next live-calc pass / manual solve will pick up the new model.
    const solveEpoch = modelStore.modelVersion;
    const comboResult = await modelStore.solveCombinations3DParallel(uiStore.includeSelfWeight, leftHand, isPro);
    if (isStale()) return null;
    if (typeof comboResult === 'string') return comboResult;
    if (!comboResult) return t('results.emptyModelError');
    if (modelStore.modelVersion !== solveEpoch) return null;

    // Use first per-case result as the "single" baseline view
    const firstCaseResult = comboResult.perCase.values().next().value;
    if (!firstCaseResult) return t('results.emptyModelError');

    resultsStore.setResults3D(firstCaseResult);
    resultsStore.setCombinationResults3D(comboResult.perCase, comboResult.perCombo, comboResult.envelope);

    // Compute governing combo per element
    const comboNames = new Map<number, string>();
    for (const c of modelStore.model.combinations) comboNames.set(c.id, c.name);
    resultsStore.setGoverning3D(computeGoverning3D(comboResult.perCombo, comboNames));

    const elapsed = performance.now() - t0;
    const timeStr = elapsed >= 1000 ? (elapsed / 1000).toFixed(2) + ' s' : elapsed.toFixed(0) + ' ms';
    const nBars = firstCaseResult?.elementForces.length ?? 0;
    const nReac = firstCaseResult?.reactions.length ?? 0;
    uiStore.toast(
      `${t('results.analysis3dSuccess')} (${timeStr}) — ${nBars} ${t('results.bars')}, ${nReac} ${t('results.reactions')} + ${comboResult.perCombo.size} ${t('results.combinations')}`,
      'success',
    );
    showSolverWarningToasts(firstCaseResult.solverDiagnostics);
    return null;
  };

  // When combinations exist, use parallel Web Workers for maximum performance
  if (hasCombos) {
    if (isPro) {
      // The combination solve already returns per-case results (runComboSolve
      // seeds the baseline/current view from the first per-case result), so the
      // old eager baseline single-solve was redundant work — a full extra solve
      // on every PRO solve. Run combos directly; fall back to a single solve
      // ONLY if the combination path fails, so the user still gets results.
      try {
        const comboError = await runComboSolve();
        if (comboError) {
          console.warn('[globalSolve3D] Combination solve returned error in PRO, falling back to single solve:', comboError);
          const fallback = await runSingleSolve();
          if (!fallback) uiStore.toast(comboError, 'info');
        }
      } catch (e: any) {
        console.error('[globalSolve3D] Combination solving failed in PRO, falling back to single solve:', e.message);
        const fallback = await runSingleSolve();
        if (!fallback) uiStore.toast(e.message, 'info');
      }
      return;
    }

    try {
      const comboError = await runComboSolve();
      if (comboError) {
        console.warn('[globalSolve3D] Combination solve returned error, falling back to single solve:', comboError);
        uiStore.toast(comboError, 'error');
        await runSingleSolve();
        return;
      }
    } catch (e: any) {
      console.error('[globalSolve3D] Combination solving failed:', e.message);
      uiStore.toast(e.message, 'error');
      await runSingleSolve();
    }
    return;
  }

  // No combinations — single solve only
  await runSingleSolve();
}

async function globalSolve2D(isStale: () => boolean): Promise<void> {
  const r = await modelStore.solveAsync(uiStore.includeSelfWeight, uiStore.drawPlane2D);
  if (isStale()) return;
  if (typeof r === 'string') {
    uiStore.toast(r, 'error', isMechanismError(r) ? 'kinematic' : undefined);
    return;
  }
  if (!r) {
    uiStore.toast(t('results.emptyModelError'), 'error');
    return;
  }

  if (hasInvalid2DDisplacements(r.displacements as Array<{ ux: number; uz?: number; uy?: number; ry?: number; rz?: number }>)) {
    uiStore.toast(t('results.numericError'), 'error', 'kinematic');
    return;
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
  if (modelStore.model.combinations.length > 0) {
    const comboResult = modelStore.solveCombinations(uiStore.includeSelfWeight, uiStore.drawPlane2D);
    if (comboResult && typeof comboResult !== 'string') {
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
}
