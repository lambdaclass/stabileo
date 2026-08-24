/**
 * What the project itself states.
 *
 * The code edition in force, the aggregate, the cover, the verifier's identity, the bent-up
 * policy, which members the user has locked, and the highest revision already persisted.
 */

/*
 * ── Why these left the store ─────────────────────────────────────────
 *
 * `detailing.svelte.ts` was 1566 lines against an 800-line ceiling, and 772 of them were
 * readings: functions that hold no state, own no user intent, and answer one question each.
 * The store's job is state and routing; a reading of the model is neither.
 *
 * They are not pure in the strict sense — they read `modelStore`, `resultsStore`,
 * `verificationStore` and `regulationsStore` rather than taking them as arguments — and that
 * is unchanged by the move, deliberately: rewriting twenty signatures to thread four stores
 * through would be a behaviour-shaped change wearing a refactor's clothes.
 *
 * Split three ways rather than one, because one file would have been 820 lines and the
 * problem would only have changed address. The three groups are the three questions the
 * detailing run asks: what the project states, what the floor holds, what lands on a footing.
 *
 * Nothing was rewritten. The bodies are the ones that were in the store, moved verbatim.
 */

import { modelStore } from './model.svelte';
import { verificationStore } from './verification.svelte';
import { regulationsStore } from './regulations.svelte';
import { getDesignCode } from '../engine/design/code-adapter';
import { DAGG_ASSUMED_MM } from '../codes/project-code-settings';
import type { RegulationEdition } from '../codes/regulation';
import type { MemberDesignOutcome } from '../engine/design/outcome';
import type { BentUpPolicy } from '../engine/detailing/generate-beam';
import { DEFAULT_COVER, DEFAULT_REBAR_FY } from '../engine/design/member-context';

export function designOutcomeMap(): ReadonlyMap<number, MemberDesignOutcome> {
  const out = new Map<number, MemberDesignOutcome>();
  for (const id of verificationStore.contexts.keys()) {
    const o = verificationStore.outcomeFor(id);
    if (o) out.set(id, o);
  }
  return out;
}


/** The concrete edition currently bound to the `concrete` role. */
export function currentConcreteEdition(): RegulationEdition {
  const e = regulationsStore.binding('concrete').edition;
  return (e === '2005' ? '2005' : '2025') as RegulationEdition;
}


/**
 * THE authoritative verifier identity, derived from the verification that actually ran.
 *
 * Both production detailing commands used to default this to `''` and only the test chain
 * passed one, so every real user's certificate named no verifier at all. The fix belongs
 * here rather than in each caller: a certificate's provenance is a property of the run, not
 * an argument a panel happens to remember to supply, and two UI call sites able to disagree
 * is the same three-sources-for-one-decision shape `adapter()` was already repaired for.
 *
 * It is READ from the issued certificates, never composed from the binding alone. That
 * distinction is the whole point — the binding says which code is selected, the certificates
 * say which verifier was executed, and only the second is true of the work:
 *
 *   * no completed design run → no identity, and the export refuses;
 *   * a run that issued no certificate → no identity (nothing was actually verified);
 *   * a certificate naming a verifier other than the one bound NOW → no identity, because
 *     rebinding the regulation after the run makes the earlier identity a stale claim.
 *
 * Returning `''` is therefore never a silent default. It is the honest "no verifier ran",
 * and `buildFootingCadHandoff` turns it into a stated refusal rather than an empty field.
 */
export function resolveVerifierId(): string {
  const summary = verificationStore.runSummary;
  if (!summary) return '';

  const boundId = regulationsStore.concreteDesignCode();
  const expected = boundId ? getDesignCode(boundId)?.provenance().verifierId : undefined;
  if (!expected) return '';

  let issued = 0;
  for (const outcome of summary.outcomes.values()) {
    const id = outcome.certificate?.verifierId;
    if (!id) continue;
    // One disagreeing certificate is enough to withhold the identity: the assembly would
    // otherwise carry a verifier that part of the design was not checked against.
    if (id !== expected) return '';
    issued++;
  }
  return issued > 0 ? expected : '';
}


/**
 * Maximum aggregate size as the MATERIALS state it, or null when none of them does.
 *
 * PR16 moved this off the regulation panel and onto the material, where a mix property
 * belongs. The largest value across the concretes in use governs the bar spacing, which is
 * the conservative reading when a model mixes mixes.
 *
 * Split from `resolveAggregate` so "stated" and "assumed" stay distinguishable. Both callers
 * need the same number, but an export must additionally say WHICH it is: the assumed 20 mm is
 * not a regulatory default, and a document that presented it as one would be claiming a
 * provenance it does not have.
 */
export function statedAggregate(): number | null {
  let max = 0;
  for (const m of modelStore.model.materials.values()) {
    const d = (m as { maxAggregateSizeMm?: number | null }).maxAggregateSizeMm;
    if (typeof d === 'number' && d > max) max = d;
  }
  return max > 0 ? max : null;
}


export function resolveAggregate(): number {
  return statedAggregate() ?? DAGG_ASSUMED_MM;
}


/**
 * The project's additional bar-spacing margin, m.
 *
 * The LARGEST stated margin across the concretes in use governs, which is the conservative
 * reading when a model mixes mixes — the same rule the aggregate size follows. Zero when no
 * concrete states one, and zero introduces no allowance anywhere: it is not a small
 * default, it is the absence of one.
 */
export function resolveSpacingMargin(): number {
  let max = 0;
  for (const m of modelStore.model.materials.values()) {
    const v = (m as { spacingMarginMm?: number | null }).spacingMarginMm;
    if (typeof v === 'number' && v > max) max = v;
  }
  return max / 1000;
}


/**
 * Distributed wall bar diameter, mm.
 *
 * §11.6.1's relaxed ratios are available only to Ø16 and smaller, and Ø12 is what a
 * distributed curtain is normally drawn with. It is a starting size the design then checks,
 * not a result: `designWall` reports the ratios and spacings that follow from it.
 */
export const DEFAULT_WALL_BAR_DIA_MM = 12;


// The footing bottom-mat diameter used to live here, as
// `const DEFAULT_FOOTING_BAR_DIA_MM = 16`. It set the effective depth of every footing check
// in the project and no user could see it or change it, which made a private module constant
// indistinguishable — from outside — from a designed result. It is now a persisted project
// preference on the model (`footingMatPreferences`), visible and editable in the Foundations
// panel, and the design states which of the two directions each diameter belongs to. See
// `model/footing.ts`.

/**
 * The concrete regulation this project's RC work is resolved against.
 *
 * One constant, consumed by the family records AND by the DocumentModel's regulation list,
 * so a record and the document built from it cannot name different regulations. The EDITION
 * still comes from Project Regulations via `currentConcreteEdition()` — that is the
 * selector, and this is only the instrument's identity.
 */
export const CONCRETE_REGULATION_ID = 'cirsoc-201';


/**
 * Concrete and steel properties for the shell families.
 *
 * Resolved exactly the way `member-context.ts` resolves them for frames, so the two paths
 * cannot disagree about the same project: f'c is the concrete `Material.fy` field — the
 * app's established convention for a concrete material — and the reinforcement fy and the
 * cover are the shared defaults. The MINIMUM f'c across the concretes in use governs,
 * which is the conservative reading when a model mixes mixes.
 */
export function resolveConcreteProperties(): { fc: number; fy: number; cover: number } {
  let fc = Infinity;
  for (const m of modelStore.model.materials.values()) {
    const v = (m as { fy?: number }).fy;
    if (typeof v === 'number' && v > 0) fc = Math.min(fc, v);
  }
  return {
    fc: Number.isFinite(fc) ? fc : 0,
    fy: DEFAULT_REBAR_FY,
    cover: DEFAULT_COVER,
  };
}


/**
 * Members whose reinforcement the engineer pinned.
 *
 * Derived from the bars actually locked rather than kept as a second list: a locked bar's
 * `ownerElementIds` is what says whose steel it is, and any member owning one may not have
 * its reinforcement replaced by the repair loop.
 */
export function lockedMemberIds(): ReadonlySet<number> {
  const out = new Set<number>();
  for (const a of modelStore.model.detailing?.assemblies ?? []) {
    for (const b of a.bars) {
      if (!b.locked) continue;
      for (const id of b.ownerElementIds ?? []) out.add(id);
    }
  }
  return out;
}


export function maxPersistedRevision(): number {
  let r = 0;
  for (const a of modelStore.model.detailing?.assemblies ?? []) {
    r = Math.max(r, a.detailingRevision ?? 0);
  }
  return r;
}


/**
 * The project's bent-up bar policy.
 *
 * `unstated` until the seismic role says otherwise, and no bent-up bar is generated under
 * `unstated`. PR19 supplies the seismic verdict; until then the conservative reading holds.
 */
export function bentUpPolicy(): BentUpPolicy {
  const optOut = modelStore.model.detailingBentUpOptOut === true;
  const seismicBound = regulationsStore.bound('seismic');
  return {
    seismicDesign: seismicBound ? 'required' : 'unstated',
    optOut,
  };
}
