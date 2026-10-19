/**
 * The concrete pipeline's readings from the stores that own them, in one place: what the steps at
 * the top of the Design stage (`design-steps.ts`) and the stage chips derive their state from.
 * Each reading is the fact the command that performs the step gates on.
 */
import type { RcFlowReadings } from '../flow/rc-stages';
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { verificationStore } from './verification.svelte';
import { regulationsStore } from './regulations.svelte';
import { detailingStore } from './detailing.svelte';

export function currentRcReadings(): RcFlowReadings {
  const p = verificationStore.providedSummary;
  return {
    hasModel: modelStore.nodes.size > 0,
    solved: resultsStore.results3D !== null || resultsStore.results !== null,
    analysisStale: verificationStore.isBaselineStale,
    codeChosen: regulationsStore.concreteDesignCode() !== null,
    hasDemands: verificationStore.demandRevision > 0,
    designApplicable: p.total,
    designProposed: p.withReinforcement,
    designVerified: p.ok,
    designUnresolved: p.fail + p.provisional + p.unavailable + p.stale,
    detailed: detailingStore.assemblies.length > 0,
    detailingConflicts: detailingStore.assemblies.reduce((n, a) => n + (a.conflicts ?? []).filter((c) => c.severity !== 'marginal').length, 0),
    documented: detailingStore.document !== null,
  };
}
