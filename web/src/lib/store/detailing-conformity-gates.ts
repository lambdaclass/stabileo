/**
 * What the constructibility gate reads to say a member conforms at its final geometry.
 *
 * The production command ALWAYS supplies the authoritative verifier. Constructibility requires
 * every member to have been rechecked at its final effective depth. A run without a verifier
 * leaves that condition unmet and the assessment NOT_ESTABLISHED — correct as a default, and
 * unacceptable as the behaviour of the real command.
 *
 * The reinforcement checked is the ASSIGNMENT'S, not the model's: mid-loop they differ, and
 * checking the model's would re-verify the steel the repair is trying to replace.
 *
 * Besides strength, the serviceability verdict (Tabla 24.2.2) and the slab-column joint verdict
 * (`analysis-validity.ts`): both are the verifier's own readings, never a second computation,
 * and `run-detailing.ts` holds `allMembersReverified` and `certificatesMatchGeometry` on them.
 */
import { verificationStore } from './verification.svelte';
import { loadSplitNotEstablished } from './analysis-validity-store';
import type { MemberDesignOutcome } from '../engine/design/outcome';
import type { RunDetailingInput } from '../engine/detailing/run-detailing';

export function memberConformityGates(outcomes: ReadonlyMap<number, MemberDesignOutcome>)
  : Pick<RunDetailingInput, 'reverify' | 'serviceabilityFails' | 'loadSplitNotEstablished'> {
  return {
    reverify: (elementId, loss) => verificationStore.reverifyAtFinalDepth(
      elementId, loss, outcomes.get(elementId)?.accepted),
    serviceabilityFails: (elementId) => verificationStore.serviceabilityFails(elementId),
    loadSplitNotEstablished,
  };
}
