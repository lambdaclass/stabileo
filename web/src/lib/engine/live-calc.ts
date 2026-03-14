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
import { t } from '../i18n';

// ─── Helpers ──────────────────────────────────────────────────────────────

function hasNaN2D(displacements: { ux: number; uy: number; rz: number }[]): boolean {
  return displacements.some(d => !isFinite(d.ux) || !isFinite(d.uy) || !isFinite(d.rz));
}

function hasNaN3D(displacements: { ux: number; uy: number; uz: number }[]): boolean {
  return displacements.some(d => !isFinite(d.ux) || !isFinite(d.uy) || !isFinite(d.uz));
}

const VALID_2D_DIAGRAMS = ['deformed', 'moment', 'shear', 'axial', 'colorMap', 'axialColor'] as const;
const VALID_3D_DIAGRAMS = ['deformed', 'momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion', 'axialColor', 'colorMap'] as const;

// ─── Live Calc (reactive $effect) ─────────────────────────────────────────

/**
 * Execute live calculation (auto-solve on model change).
 * Called from the $effect in App.svelte when liveCalc is enabled.
 * Sets results/errors directly on the stores.
 *
 * @param analysisMode  Current analysis mode ('2d' | '3d' | 'edu')
 * @param axisConvention3D  Current 3D axis convention string
 * @param prevDiagram  Diagram type the user was viewing before clear() — restored after solve
 */
export function runLiveCalc(analysisMode: string, axisConvention3D: string, prevDiagram?: string): void {
  try {
    if (analysisMode === '3d' || analysisMode === 'pro') {
      liveCalc3D(axisConvention3D);
    } else {
      liveCalc2D();
    }
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
    uiStore.liveCalcError = err.message ?? t('error.unknown');
  }
}

function liveCalc3D(axisConvention: string): void {
  const isPro = uiStore.analysisMode === 'pro';
  const r = modelStore.solve3D(uiStore.includeSelfWeight, axisConvention === 'leftHand', isPro);
  if (typeof r === 'string') {
    uiStore.liveCalcError = r;
    return;
  }
  if (!r) return;

  if (hasNaN3D(r.displacements as any)) {
    uiStore.liveCalcError = t('results.numericError3d');
    return;
  }

  resultsStore.setResults3D(r, true);
}

function liveCalc2D(): void {
  const r = modelStore.solve(uiStore.includeSelfWeight);
  if (typeof r === 'string') {
    uiStore.liveCalcError = r;
    return;
  }
  if (!r) return;

  if (hasNaN2D(r.displacements as any)) {
    uiStore.liveCalcError = t('results.numericError');
    return;
  }

  resultsStore.setResults(r, true);

  // Auto-solve combinations if defined
  if (modelStore.model.combinations.length > 0) {
    const combo = modelStore.solveCombinations(uiStore.includeSelfWeight);
    if (combo && typeof combo !== 'string') {
      resultsStore.setCombinationResults(combo.perCase, combo.perCombo, combo.envelope);
    }
  }
}

// ─── Global Solve (manual "Calcular" button) ─────────────────────────────

/**
 * Solve the structure manually (triggered by Enter key / Calcular button).
 * Handles 2D and 3D, combinations, toasts and mobile panel.
 */
export async function runGlobalSolve(): Promise<void> {
  if (uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro') {
    await globalSolve3D();
  } else if (uiStore.analysisMode === 'edu') {
    // Edu mode handles its own solve via edu-solver.ts (registered listener).
    // This branch is a no-op safety fallback — the edu module's listener
    // fires first on the same 'stabileo-solve' event.
    return;
  } else {
    globalSolve2D();
  }
}

/** Show solver diagnostic warnings/errors as toasts (max 2 to avoid spam) */
function showSolverWarningToasts(diags?: import('./types').SolverDiagnostic[]): void {
  if (!diags) return;
  const important = diags.filter(d => d.severity === 'error' || d.severity === 'warning');
  for (const d of important.slice(0, 2)) {
    const msg = t(d.message) !== d.message ? t(d.message) : d.message;
    uiStore.toast(msg, d.severity === 'error' ? 'error' : 'info');
  }
}

/** Detect if an error message is mechanism/hipostatic-related */
function isMechanismError(msg: string): boolean {
  const lc = msg.toLowerCase();
  return lc.includes('mecanismo') || lc.includes('hipostática') || lc.includes('singular') || lc.includes('inestable')
    || lc.includes('mechanism') || lc.includes('hypostatic') || lc.includes('unstable');
}

async function globalSolve3D(): Promise<void> {
  const isPro = uiStore.analysisMode === 'pro';
  const leftHand = uiStore.axisConvention3D === 'leftHand';
  const hasCombos = modelStore.model.combinations.length > 0;
  const t0 = performance.now();

  // When combinations exist, use parallel Web Workers for maximum performance
  if (hasCombos) {
    try {
      const comboResult = await modelStore.solveCombinations3DParallel(uiStore.includeSelfWeight, leftHand, isPro);
      if (typeof comboResult === 'string') {
        uiStore.toast(comboResult, 'error');
        return;
      }
      if (!comboResult) {
        uiStore.toast(t('results.emptyModelError'), 'error');
        return;
      }

      // Use first per-case result as the "single" baseline view
      const firstCaseResult = comboResult.perCase.values().next().value;
      if (firstCaseResult) resultsStore.setResults3D(firstCaseResult);

      resultsStore.setCombinationResults3D(comboResult.perCase, comboResult.perCombo, comboResult.envelope);

      if (uiStore.isMobile) uiStore.mobileResultsPanelOpen = true;
      const elapsed = performance.now() - t0;
      const timeStr = elapsed >= 1000 ? (elapsed / 1000).toFixed(2) + ' s' : elapsed.toFixed(0) + ' ms';
      const nBars = firstCaseResult?.elementForces.length ?? 0;
      const nReac = firstCaseResult?.reactions.length ?? 0;
      uiStore.toast(
        `${t('results.analysis3dSuccess')} (${timeStr}) — ${nBars} ${t('results.bars')}, ${nReac} ${t('results.reactions')} + ${comboResult.perCombo.size} ${t('results.combinations')}`,
        'success',
      );
      if (firstCaseResult) showSolverWarningToasts(firstCaseResult.solverDiagnostics);
    } catch (e: any) {
      console.error('[globalSolve3D] Combination solving failed:', e.message);
      uiStore.toast(e.message, 'error');
    }
    return;
  }

  // No combinations — single solve only
  const r = modelStore.solve3D(uiStore.includeSelfWeight, leftHand, isPro);
  if (typeof r === 'string') {
    uiStore.toast(r, 'error');
  } else if (r) {
    resultsStore.setResults3D(r);
    if (uiStore.isMobile) uiStore.mobileResultsPanelOpen = true;
    const timeStr = r.timings ? ` (${r.timings.totalMs >= 1000 ? (r.timings.totalMs / 1000).toFixed(2) + ' s' : r.timings.totalMs.toFixed(1) + ' ms'})` : '';
    uiStore.toast(
      `${t('results.analysis3dSuccess')}${timeStr} — ${r.elementForces.length} ${t('results.bars')}, ${r.reactions.length} ${t('results.reactions')}`,
      'success',
    );
    showSolverWarningToasts(r.solverDiagnostics);
  } else {
    uiStore.toast(t('results.emptyModelError'), 'error');
  }
}

function globalSolve2D(): void {
  const r = modelStore.solve(uiStore.includeSelfWeight);
  if (typeof r === 'string') {
    uiStore.toast(r, 'error', isMechanismError(r) ? 'kinematic' : undefined);
    return;
  }
  if (!r) {
    uiStore.toast(t('results.emptyModelError'), 'error');
    return;
  }

  if (hasNaN2D(r.displacements as any)) {
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
    const comboResult = modelStore.solveCombinations(uiStore.includeSelfWeight);
    if (comboResult && typeof comboResult !== 'string') {
      resultsStore.setCombinationResults(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
      comboText = ` + ${comboResult.perCombo.size} ${t('results.combinations')}`;
    }
  }

  if (uiStore.isMobile) uiStore.mobileResultsPanelOpen = true;
  const timeStr = r.timings ? ` (${r.timings.totalMs >= 1000 ? (r.timings.totalMs / 1000).toFixed(2) + ' s' : r.timings.totalMs.toFixed(1) + ' ms'})` : '';
  uiStore.toast(
    `${t('results.calcSuccess')}${classText}${timeStr} — ${r.elementForces.length} ${t('results.bars')}, ${r.reactions.length} ${t('results.reactions')}${comboText}`,
    'success',
  );

  // Show solver warnings/errors as separate toasts
  showSolverWarningToasts(r.solverDiagnostics);
}
