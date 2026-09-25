/**
 * Add generated combinations to the model, and file the service ones where the service checks
 * read them.
 *
 * A service combination is not a strength combination with small factors: it is what the
 * deflection check reads (`store/service-deflection.ts` takes the project's service
 * envelopes). So when service combinations are added they join a named envelope of purpose
 * `service`, and they are kept OUT of the active list the design reads — unless the project
 * has stated its own active list, which is left exactly as it was.
 *
 * Run inside the caller's batch: one command, one undo step.
 */
import { modelStore } from './model.svelte';
import type { CaseCombination } from '../engine/loads/combination-cases';

/** The envelope the generated service combinations join, created when missing. */
export const SERVICE_ENVELOPE_NAME = 'SLS';

export function addGeneratedCombinations(list: readonly CaseCombination[], prefix: (c: CaseCombination) => string = () => ''): number[] {
  const before = modelStore.combinations.map((c) => c.id);
  const ids: number[] = [];
  const service: number[] = [];
  for (const c of list) {
    const id = modelStore.addCombination(`${prefix(c)}${c.name}`, c.factors);
    ids.push(id);
    if (c.purpose === 'service') service.push(id);
  }
  if (service.length === 0) return ids;

  const scopes = modelStore.resultScopes ?? {};
  const envelopes = [...(scopes.envelopes ?? [])];
  const existing = envelopes.find((e) => e.purpose === 'service' && e.name === SERVICE_ENVELOPE_NAME);
  if (existing) {
    existing.comboIds = [...new Set([...existing.comboIds, ...service])];
  } else {
    const nextId = envelopes.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    envelopes.push({ id: nextId, name: SERVICE_ENVELOPE_NAME, purpose: 'service', comboIds: service });
  }
  // "All combinations" would now include the service ones; state the list without them.
  const active = scopes.active ?? [...before, ...ids.filter((id) => !service.includes(id))];
  modelStore.setResultScopes({ ...scopes, active, envelopes });
  return ids;
}
