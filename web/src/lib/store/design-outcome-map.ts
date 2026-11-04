import type { MemberDesignOutcome } from '../engine/design/outcome';
import { getDesignCode } from '../engine/design/code-adapter';
import { outcomeFromProvided } from '../engine/design/candidate-search';
import { modelStore } from './model.svelte';
import { verificationStore } from './verification.svelte';
import { regulationsStore } from './regulations.svelte';
import { designRunStore } from './design-run.svelte';

/**
 * The outcome the detailing draws, per member.
 *
 * A member someone edited is drawn with the bars it HAS: its edit, verified now, with its own
 * certificate, or not drawn at all when the edit does not verify. The design run's arrangement used
 * to be drawn instead, so the table and the drawings disagreed after every edit.
 */
export function designOutcomeMap(): ReadonlyMap<number, MemberDesignOutcome> {
  const out = new Map<number, MemberDesignOutcome>();
  const codeId = regulationsStore.concreteDesignCode();
  const adapter = codeId ? getDesignCode(codeId) : undefined;
  for (const [id, ctx] of verificationStore.contexts) {
    const edited = designRunStore.manualOverrides.has(id);
    const reinf = edited ? modelStore.elements.get(id)?.reinforcement : undefined;
    const verdict = reinf ? verificationStore.providedFor(id) : null;
    if (adapter && reinf && verdict) {
      // An edit that does not verify is not drawn: no outcome for it.
      const own = outcomeFromProvided(adapter, ctx, reinf, verdict);
      if (own) out.set(id, own);
      continue;
    }
    const o = verificationStore.outcomeFor(id);
    if (o) out.set(id, o);
  }
  return out;
}
