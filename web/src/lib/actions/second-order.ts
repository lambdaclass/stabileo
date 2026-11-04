/**
 * The Basic mode's P-Δ and critical load as the advanced panel runs them: with the reader's
 * settings in 2D, and the first-mode B₂ added to the space P-Δ.
 */
import type { SolverInput } from '../engine/types';
import type { SolverInput3D } from '../engine/types-3d';
import { runPDelta2D, type SoPDeltaResult } from '../engine/second-order/run-pdelta';
import { runBuckling2D, type SoBucklingResult } from '../engine/second-order/run-buckling';
import { firstModeB2, type SoSettings } from '../engine/second-order/settings';
import { solveBuckling3D } from '../engine/wasm-solver';
import { secondOrderSettings } from '../store/second-order.svelte';
import { explainedSteps } from '../store/explained-steps.svelte';
import { openExplainedCatalog } from './step-wizards';
import { tp } from '../i18n';

/** 2D P-Δ with the panel's settings; a sentence when the chosen method cannot take the model. */
export function pdeltaBasic2D(input: SolverInput): SoPDeltaResult | string {
  const got = runPDelta2D(input, secondOrderSettings.snapshot());
  return got.ok ? got.result : tp(got.reason.key, got.reason.params);
}

export function bucklingBasic2D(input: SolverInput): SoBucklingResult | string {
  const s = secondOrderSettings.snapshot();
  const got = runBuckling2D(input, s);
  return got.ok ? got.result : tp(got.reason.key, got.reason.params);
}

/** The space P-Δ with B₂ = 1/(1 − 1/λ₁) from its first buckling factor, as the plane one reports it. */
export function withFirstModeB2(input: SolverInput3D, result: { b2Factor: number; isStable: boolean }): typeof result & { secondOrder?: { lambda1: number | null; b2: number } } {
  let lambda1: number | null;
  try {
    lambda1 = solveBuckling3D(input, 1).modes[0]?.loadFactor ?? null;
  } catch (e) {
    lambda1 = /no compressed elements/i.test(String((e as Error)?.message ?? e)) ? Infinity : null;
  }
  if (lambda1 === null) return result;
  const b2 = firstModeB2(lambda1);
  return { ...result, b2Factor: b2, isStable: result.isStable && lambda1 > 1, secondOrder: { lambda1, b2 } };
}

/** Open one of the second-order explained methods over the model on screen, with the panel's assumptions. */
export function openSecondOrderSteps(methodId: string, s: Pick<SoSettings, 'method' | 'axialRigid'> = secondOrderSettings.snapshot()): void {
  openExplainedCatalog();
  explainedSteps.openMethod(methodId);
  explainedSteps.setOption('axialRigid', s.axialRigid);
  if (methodId.endsWith('-kg')) explainedSteps.setOption('chord', s.method === 'string');
}
