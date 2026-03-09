/**
 * live-calc.ts — Extracted live-calculation logic from App.svelte.
 *
 * Provides two functions:
 *  - runLiveCalc()    — called inside the reactive $effect when liveCalc is ON
 *  - runGlobalSolve() — called from the 'dedaliano-solve' global event (manual solve)
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
 * @param analysisMode  Current analysis mode ('2d' | '3d')
 * @param axisConvention3D  Current 3D axis convention string
 * @param prevDiagram  Diagram type before results were cleared (to restore user selection)
 */
export function runLiveCalc(analysisMode: string, axisConvention3D: string, prevDiagram: string): void {
  try {
    if (analysisMode === '3d') {
      liveCalc3D(axisConvention3D, prevDiagram);
    } else {
      liveCalc2D(prevDiagram);
    }
  } catch (err: any) {
    uiStore.liveCalcError = err.message ?? t('error.unknown');
  }
}

function liveCalc3D(axisConvention: string, prevDiagram: string): void {
  const r = modelStore.solve3D(uiStore.includeSelfWeight, axisConvention === 'leftHand');
  if (typeof r === 'string') {
    uiStore.liveCalcError = r;
    return;
  }
  if (!r) return;

  if (hasNaN3D(r.displacements as any)) {
    uiStore.liveCalcError = t('results.numericError3d');
    return;
  }

  resultsStore.setResults3D(r);
  if ((VALID_3D_DIAGRAMS as readonly string[]).includes(prevDiagram)) {
    resultsStore.diagramType = prevDiagram as any;
  }
}

function liveCalc2D(prevDiagram: string): void {
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

  resultsStore.setResults(r);

  // Auto-solve combinations if defined
  if (modelStore.model.combinations.length > 0) {
    const combo = modelStore.solveCombinations(uiStore.includeSelfWeight);
    if (combo && typeof combo !== 'string') {
      resultsStore.setCombinationResults(combo.perCase, combo.perCombo, combo.envelope);
    }
  }

  // Restore diagram type if it was a valid results view
  if ((VALID_2D_DIAGRAMS as readonly string[]).includes(prevDiagram)) {
    resultsStore.diagramType = prevDiagram as any;
  }
}

// ─── Global Solve (manual "Calcular" button) ─────────────────────────────

/**
 * Solve the structure manually (triggered by Enter key / Calcular button).
 * Handles 2D and 3D, combinations, toasts and mobile panel.
 */
export function runGlobalSolve(): void {
  if (uiStore.analysisMode === '3d') {
    globalSolve3D();
  } else {
    globalSolve2D();
  }
}

/** Detect if an error message is mechanism/hipostatic-related */
function isMechanismError(msg: string): boolean {
  const lc = msg.toLowerCase();
  return lc.includes('mecanismo') || lc.includes('hipostática') || lc.includes('singular') || lc.includes('inestable')
    || lc.includes('mechanism') || lc.includes('hypostatic') || lc.includes('unstable');
}

function globalSolve3D(): void {
  const r = modelStore.solve3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
  if (typeof r === 'string') {
    // No kinematic action in 3D — panel is 2D only
    uiStore.toast(r, 'error');
  } else if (r) {
    resultsStore.setResults3D(r);
    if (uiStore.isMobile) uiStore.mobileResultsPanelOpen = true;
    uiStore.toast(
      `${t('results.analysis3dSuccess')} — ${r.elementForces.length} ${t('results.bars')}, ${r.reactions.length} ${t('results.reactions')}`,
      'success',
    );
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
  uiStore.toast(
    `${t('results.calcSuccess')}${classText} — ${r.elementForces.length} ${t('results.bars')}, ${r.reactions.length} ${t('results.reactions')}${comboText}`,
    'success',
  );
}
