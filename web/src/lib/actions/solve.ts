/**
 * Solving, as an action rather than a component method.
 *
 * `handleSolve` lived inside ToolbarResults, so the only way to solve was to
 * open the results panel and press the button in it. The ribbon's Solve command
 * therefore could not solve — it opened the panel and asked the user to press
 * Solve again, which is two clicks and a detour for the single most-used action
 * in the application.
 *
 * Moving it here gives one implementation with one set of 3D handling, NaN
 * checks and toasts, callable from anywhere. Duplicating it into the ribbon
 * would have been the other option, and two copies of a solver entry point is
 * how they drift apart.
 */

import { uiStore, resultsStore, modelStore } from '../store';
import { t } from '../i18n';
import { hasInvalid2DDisplacements, hasInvalid3DDisplacements } from '../geometry/coordinate-system';
import { initSolver, isWasmReady } from '../engine/wasm-solver';

export function runSolve() {
  if (uiStore.analysisMode === '3d') {
    runSolve3D();
    return;
  }
  const results = modelStore.solve(uiStore.includeSelfWeight, uiStore.drawPlane2D);
  if (typeof results === 'string') {
    uiStore.toast(results, 'error');
  } else if (results) {
    // Validate results aren't degenerate
    const hasNaN = hasInvalid2DDisplacements(results.displacements);
    if (hasNaN) {
      uiStore.toast(t('results.numericError'), 'error');
      return;
    }
    resultsStore.setResults(results);
    // Show classification in success toast
    const kin = modelStore.kinematicResult;
    let classText = '';
    if (kin) {
      if (kin.classification === 'isostatic') classText = t('toast.isostatic');
      else if (kin.classification === 'hyperstatic') classText = t('toast.hyperstatic').replace('{degree}', String(kin.degree));
    }
    // Auto-solve combinations if they exist
    let comboText = '';
    if (modelStore.model.combinations.length > 0) {
      const comboResult = modelStore.solveCombinations(uiStore.includeSelfWeight, uiStore.drawPlane2D);
      if (comboResult && typeof comboResult !== 'string') {
        resultsStore.setCombinationResults(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
        comboText = t('toast.plusCombinations').replace('{n}', String(comboResult.perCombo.size));
      }
    }
    // Show diagnostics warnings if present
    const diagWarnings = [
      ...(results.diagnostics ?? []).filter(d => d.metric === 'negative_jacobian').map(d => d.message),
      ...(results.solverDiagnostics ?? []).filter(d => d.severity === 'warning').map(d => d.message),
    ];
    if (diagWarnings.length > 0) {
      uiStore.toast(diagWarnings.join(' | '), 'info');
    }
    uiStore.toast(`${t('results.calcSuccess')}${classText} — ${results.elementForces.length} ${t('results.bars')}, ${results.reactions.length} ${t('results.reactions')}${comboText}`, 'success');
  } else {
    uiStore.toast(t('results.emptyModelError'), 'error');
  }
}

export async function runSolve3D() {
  if (!isWasmReady()) {
    try { await initSolver(); } catch (e: any) {
      uiStore.toast(e?.message || 'WASM solver initialization failed', 'error');
      return;
    }
  }
  const isPro = uiStore.analysisMode === 'pro';
  const versionAtStart = modelStore.modelVersion;
  const results = await modelStore.solve3DAsync(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', isPro);
  if (modelStore.modelVersion !== versionAtStart) return; // stale — user edited mid-solve
  if (typeof results === 'string') {
    uiStore.toast(results, 'error');
  } else if (results) {
    // Validate results aren't degenerate
    const hasNaN = hasInvalid3DDisplacements(results.displacements as Array<{ ux: number; uy: number; uz: number }>);
    if (hasNaN) {
      uiStore.toast(t('results.numericError3d'), 'error');
      return;
    }
    resultsStore.setResults3D(results);
    // Auto-solve 3D combinations if they exist
    let comboText = '';
    if (modelStore.model.combinations.length > 0) {
      const comboResult = modelStore.solveCombinations3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand', isPro);
      if (comboResult && typeof comboResult !== 'string') {
        resultsStore.setCombinationResults3D(comboResult.perCase, comboResult.perCombo, comboResult.envelope);
        comboText = t('toast.plusCombinations').replace('{n}', String(comboResult.perCombo.size));
      }
    }
    // Show diagnostics warnings if present
    const diagWarnings3D = [
      ...(results.diagnostics ?? []).filter((d: { metric: string }) => d.metric === 'negative_jacobian').map((d: { message: string }) => d.message),
      ...(results.solverDiagnostics ?? []).filter((d: { severity: string }) => d.severity === 'warning').map((d: { message: string }) => d.message),
    ];
    if (diagWarnings3D.length > 0) {
      uiStore.toast(diagWarnings3D.join(' | '), 'info');
    }
    uiStore.toast(
      `${t('results.analysis3dSuccess')} — ${results.elementForces.length} ${t('results.bars')}, ${results.reactions.length} ${t('results.reactions')}${comboText}`,
      'success',
    );
  } else {
    uiStore.toast(t('results.emptyModelError'), 'error');
  }
}
