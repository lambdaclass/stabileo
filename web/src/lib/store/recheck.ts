/**
 * Reopening a project: the analysis results are not saved with it (they are recomputed), the
 * reinforcement and the detailing are. Until the model is solved again, the memoria and the
 * report have nothing to verify the saved bars against, and they used to show an empty memoria
 * next to a detailing that was still there. This is the one action that brings them back: solve,
 * then check the saved reinforcement again, without designing anything anew.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { detailingStore } from './detailing.svelte';
import { designRunStore } from './design-run.svelte';
import { verificationStore } from './verification.svelte';
import { runSteelCheck } from './steel-check';
import { runMaterialChecks } from './material-check.svelte';
import { runGlobalSolve } from '../engine/live-calc';

/** Saved design work with nothing to verify it against: the state right after opening a project. */
export function needsRecheck(): boolean {
  if (resultsStore.results3D) return false;
  const bars = [...modelStore.elements.values()].some((e) => e.reinforcement);
  return bars || detailingStore.assemblies.length > 0;
}

/** Solve, then verify what the project holds: the concrete through its demands, steel and the other materials through their checks. */
export async function solveAndRecheck(): Promise<boolean> {
  await runGlobalSolve();
  if (!resultsStore.results3D) return false;
  const bars = [...modelStore.elements.values()].some((e) => e.reinforcement);
  if (bars && verificationStore.contexts.size === 0) designRunStore.computeDemands();
  runSteelCheck();
  runMaterialChecks();
  return true;
}
