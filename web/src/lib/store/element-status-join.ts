/**
 * The one place the design outcome and the provided verification are joined.
 *
 * ── Why it is a module and not two derived blocks ──────────────────
 *
 * It was two derived blocks — one in `RebarWorkspace`, one in `RebarScenePanel` — building the
 * same map from the same two stores. They drifted the first time the map gained a field: the
 * workspace threaded `verificationLimiting`, the sidebar did not, and the same member was
 * reported PROVISIONAL on the overlay and FAILED on the panel behind it. Two screens, one
 * model, two answers, no error.
 *
 * `element-status.ts` cannot host this: it is pure by contract and reads no store. So the join
 * lives here, next to the stores it reads, and both screens call it.
 */

import { modelStore } from './model.svelte';
import { verificationStore } from './verification.svelte';
import { failingLimits, type DesignOutcomeSummary }
  from '../engine/detailing/element-status';

/**
 * Every member the design run or the verification knows about, summarised.
 *
 * Members neither knows about are omitted rather than given an empty summary: `statusOf`
 * distinguishes "no outcome" from "an outcome that says nothing", and inventing the second
 * would make an unevaluated member look evaluated.
 */
export function buildOutcomeSummaries(): Map<number, DesignOutcomeSummary> {
  const m = new Map<number, DesignOutcomeSummary>();
  for (const id of modelStore.model.elements.keys()) {
    const o = verificationStore.outcomeFor(id);
    const v = verificationStore.providedFor(id);
    if (!o && !v) continue;
    /*
     * The member's verdict (`member-verdict.ts`), as the desk reads it: a hold that fails the
     * member (its deflection, a condition the detailing left open) fails it here too, and one that
     * leaves it not verified (its analysis, its seismic checks) makes it HELD, never MODELLED.
     */
    const verdict = verificationStore.memberVerdict(id);
    const failingHolds = verdict.holds.filter((h) => h.kind === 'deflection' || h.kind === 'detailing').map((h) => h.kind);
    const deflection = !!v && verificationStore.serviceabilityFails(id);
    const localPass = !!v && (v.overallStatus === 'ok' || v.overallStatus === 'warn');
    const held = verdict.holds.filter((h) => h.kind === 'analysis' || h.kind === 'seismic').map((h) => h.kind);
    m.set(id, {
      outcome: o?.outcome,
      ...(held.length ? { held } : {}),
      verificationStatus: (failingHolds.length || deflection) && localPass ? 'fail' : v?.overallStatus,
      /**
       * What FAILED, not merely that something did.
       *
       * A PROVISIONAL_BIAXIAL member's steel fails the authoritative verifier by construction
       * — on the biaxial refusal, which is the same fact the outcome names better. Without
       * this field `statusOf` cannot tell that case from a proposal that ALSO fails on
       * flexure, and it collapses every proposal into the generic failure bucket.
       */
      verificationLimiting: [...failingLimits(v?.checks), ...(deflection ? ['deflection'] : []), ...(failingHolds.includes('detailing') && localPass ? ['detailing'] : [])],
      limiting: o?.limiting ?? [],
      reasonKey: o?.reasons?.[0]?.key,
      secondaryRatio: o?.axes?.secondaryRatio,
    });
  }
  return m;
}
