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
import { rebarHash } from '../engine/design/rebar-hash';
import { designRunStore } from './design-run.svelte';
import type { DesignFamily } from '../engine/design/design-families';
import { detailingReadiness, type DetailingReadiness } from '../engine/detailing/run-detailing';
import {
  rcRegenerationImpact, rcRetouchProvenance, type RcRegenerationImpact,
} from '../flow/rc-selection';
import type { RcDocumentableMember } from '../flow/rc-document-scope';
import {
  buildDocumentModel, type CertificateEntry, type DocumentModel,
} from '../engine/detailing/document-model';
import { narrowDocument } from '../engine/detailing/document-narrow';
import type { DetailingAssembly } from '../engine/detailing/assembly';
import type { LapInterval } from '../engine/detailing/lap-materialize';

export function designOutcomeMap(): ReadonlyMap<number, MemberDesignOutcome> {
  const out = new Map<number, MemberDesignOutcome>();
  for (const id of verificationStore.contexts.keys()) {
    const o = verificationStore.outcomeFor(id);
    if (o) out.set(id, o);
  }
  return out;
}


/** The concrete edition currently bound to the `concrete` role. */
/**
 * The document, from the persisted assemblies and the project's own state.
 *
 * ── Why it is here and not in the store ────────────────────────────
 *
 * Every argument it assembles is a project input — the concrete edition, the verifier, the
 * revision vector, the scope — and this file is where those are resolved. The store was at its
 * 800-line ceiling, and the choice this forced is the right one anyway: `buildDocument` was a
 * forty-line argument list inside a method, none of it store state.
 *
 * The caller supplies what only it knows: which assemblies are persisted, the laps the last run
 * produced, and the revision and authorship of this issue.
 */
export function buildProjectDocument(input: {
  assemblies: readonly DetailingAssembly[];
  laps: readonly LapInterval[];
  revisionNumber: number;
  author: string;
  at: string;
  /** The documentation narrowing, when there is one. Null or absent is the whole set. */
  scope?: RcDocumentationScope | null;
}): DocumentModel {
  const whole = buildDocumentModel({
    seriesId: 'detailing',
    revision: {
      number: input.revisionNumber,
      at: input.at,
      author: input.author,
      // The persisted source, by name rather than by argument.
      detailingRevision: maxPersistedRevision(),
      demandRevision: verificationStore.demandRevision,
    },
    regulations: [{ id: CONCRETE_REGULATION_ID, edition: currentConcreteEdition() }],
    assemblies: input.assemblies,
    laps: input.laps,
    certificates: collectCertificates(input.assemblies),
    // The vector as it stands NOW, so a family certificate stamped at an earlier analysis is
    // reported as STALE rather than compared against its own vector and found equal. Omitting
    // this would produce a document that structurally cannot detect staleness.
    currentRevisions: {
      analysis: regulationsStore.revisions.analysis,
      loads: regulationsStore.revisions.combination,
      regulation: regulationsStore.revisions.regulationConfig,
      // The per-entity revision is per RECORD, so there is no single project-wide value to
      // compare against. Each record's own entity revision is used, which makes this field a
      // no-op for the comparison and keeps a footing edit detectable through the geometry and
      // input hashes instead.
      entity: -1,
    },
    /*
     * The scope the document answers for, so every export can state it.
     *
     * From the SAME function the strip and the command read, at the moment the document is
     * built. A drawing is read on a site by someone who was not in the room when the scope was
     * chosen, and "issued for construction" without "beams and columns; the slabs are not in
     * this set" is a true claim that will be taken as a false one.
     */
    convergence: currentReadiness().convergence,
  });
  /*
   * Built over EVERYTHING, then narrowed. Never built over the subset.
   *
   * `buildDocumentModel` decides `readiness` from the assemblies it is handed, so filtering them
   * first would measure the claim over the selection — and narrowing a conflicted project down to
   * one clean beam would open `Issue for construction`. `document-narrow.ts` carries the whole
   * argument and the property it buys: a narrowed document never claims more than the set it came
   * from.
   */
  return input.scope
    ? narrowDocument(whole, input.scope.elements, input.scope.families)
    : whole;
}

/**
 * What a caller narrowing a document must state.
 *
 * The families travel with the elements because `narrowDocument` is pure and may not read a
 * `MemberContext` to work out whether element 12 is a beam. `resolveDocumentScope` produces both
 * against the design scope, so the pair cannot disagree.
 */
export interface RcDocumentationScope {
  elements: readonly number[];
  families: readonly DesignFamily[];
}

/**
 * Readiness and convergence as they stand right now.
 *
 * ── Why it lives here and not in the store ─────────────────────────
 *
 * Two call sites need the SAME answer: the `readiness` getter, which drives the command and the
 * strip, and the document builder, which stamps the scope onto every export. Two sites deriving
 * it separately is how a document comes to state a scope the command never ran — and the store
 * is at its 800-line ceiling, which is what made the choice between "one function" and "two
 * derivations" concrete rather than stylistic.
 *
 * The SCOPE enters here: `designRunStore.familySelection` is the same array the command bar
 * states its scope from and the boxes below the table tick. A second source for it is how a run
 * comes to report a coverage it did not have.
 *
 * Adding a family re-opens the claim and removing one closes it, with no bookkeeping: nothing is
 * stored, so the next call measures the selection in force.
 */
export function currentReadiness(): DetailingReadiness {
  return detailingReadiness({
    contexts: verificationStore.contexts,
    outcomes: designOutcomeMap(),
    scope: designRunStore.familySelection,
    presentFloorFamilies: presentFloorFamilies(),
  });
}

/**
 * Every member the drawing contains, with the families its steel belongs to.
 *
 * ── Why the PERSISTED assemblies and not the readiness ─────────────
 *
 * `currentReadiness().detailable` is what the NEXT run would draw. This is what the document
 * actually contains, which is a different question the moment a model is edited after a run: a
 * member that stopped being detailable is still on the sheets until somebody regenerates, and a
 * scope offering it as "not documentable" would be describing a document nobody has built.
 *
 * ── Why the context is the authority, and the record the fallback ──
 *
 * `MemberContext.elementType` is `beam`, `column` or `wall` — the frame classification, and the
 * same one `detailingReadiness` builds its convergence member list from. Reading it first is what
 * keeps the two consistent. The family RECORDS are then added, never substituted: a footing's
 * record is owned by the column it carries, so element 10 legitimately carries both a column's
 * steel and a footing's, and `rc-document-scope.ts` documents why collapsing that to one family
 * breaks a real project in whichever direction it is collapsed.
 *
 * A member with neither is reported with NO family. That is not a hole to be filled with a guess:
 * see `RcDocumentScope.unclassified`, which keeps it in the set and says so.
 */
export function documentableMembers(): RcDocumentableMember[] {
  const persisted = modelStore.model.detailing?.assemblies ?? [];
  const families = new Map<number, Set<DesignFamily>>();
  const add = (id: number, f?: DesignFamily) => {
    const set = families.get(id) ?? new Set<DesignFamily>();
    if (f) set.add(f);
    families.set(id, set);
  };

  for (const a of persisted) {
    for (const id of a.elementIds) {
      const ctx = verificationStore.contexts.get(id);
      add(id, ctx?.elementType);
    }
    for (const r of a.families ?? []) {
      for (const id of r.ownerElementIds) add(id, r.family);
    }
  }

  return [...families]
    .sort(([a], [b]) => a - b)
    .map(([elementId, fs]) => ({ elementId, families: [...fs] }));
}

/**
 * The floor families the MODEL holds — slabs, walls, footings.
 *
 * ── Why this exists, and why it is families and not members ────────
 *
 * `detailingReadiness` sees `verificationStore.contexts`, which is the FRAME: beams and columns.
 * A slab is not a `MemberContext` — the floor pass owns it — so nothing inside that function can
 * tell a bare frame from a frame under twelve slab panels. Without this, the scope qualifier on
 * the convergence claim would be empty on exactly the building it exists for, and "design
 * converged" would read as "the building is ready".
 *
 * Slabs and walls are reported together whenever the model holds shell panels, for the reason
 * `DesignFamilyPanel` states about its own census: a shell becomes one or the other only when
 * the floor pass classifies it, and deciding here would be a second authority guessing. That the
 * qualifier may name a family the classification would later rule out is the conservative error
 * — it over-qualifies the claim rather than under-qualifying it.
 *
 * Read from the same places the panel reads, never re-derived.
 */
export function presentFloorFamilies(): DesignFamily[] {
  const out: DesignFamily[] = [];
  if (modelStore.model.quads.size > 0) out.push('slab', 'wall');
  if (modelStore.model.footings.size > 0) out.push('footing');
  return out;
}

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


/**
 * The per-member verification certificate every document carries.
 *
 * ── Why it is a reading and not a store method ─────────────────────
 *
 * It answers one question per element — what was certified, what is there now, and whether the
 * two are the same claim — out of `verificationStore`, and holds nothing. That is what this
 * file is for, and moving it here is what keeps `detailing.svelte.ts` inside the 800-line
 * ceiling `detailing-store-ceiling.test.ts` enforces.
 *
 * The `verifierId` comes from the ASSEMBLY that owns the member, not from the project: it is
 * the identity of the verifier that actually ran for that steel.
 */
export function collectCertificates(
  assemblies: readonly {
    elementIds: number[]; provenance: { verifierId: string };
  }[],
): CertificateEntry[] {
  const out: CertificateEntry[] = [];
  for (const a of assemblies) {
    for (const id of a.elementIds) {
      const reinf = verificationStore.reinforcementFor(id);
      const result = verificationStore.providedFor(id);
      const current = reinf ? rebarHash(reinf) : '';
      const certified = verificationStore.certifiedHashFor(id);
      out.push({
        elementId: id,
        certifiedHash: certified,
        currentHash: current,
        // Empty on either side means the question was never answered, which is not a match.
        // Silence is not agreement.
        matches: certified !== '' && current !== '' && certified === current,
        verifierId: a.provenance.verifierId,
        status: result?.overallStatus === 'ok' ? 'ok'
          : result?.overallStatus === 'warn' ? 'warn'
            : result?.overallStatus === 'fail' ? 'fail' : 'notRun',
        provisional: verificationStore.outcomeFor(id)?.outcome === 'PROVISIONAL_BIAXIAL',
      });
    }
  }
  return out;
}

/**
 * What a regeneration is about to do to this project's hand edits.
 *
 * A reading of two stores — which members were retouched, and which are locked — and it holds
 * nothing, so it lives here rather than on `detailing.svelte.ts`. Both are read from the
 * PERSISTED model for the reason `buildDocument` documents: this is read in the same gesture
 * that presses the command, and a `$derived` that has not recomputed would report a project
 * with no detailing and warn about nothing.
 */
export function regenerationImpact(): RcRegenerationImpact {
  const persisted = modelStore.model.detailing?.assemblies ?? [];
  return rcRegenerationImpact(
    rcRetouchProvenance(
      designRunStore.manualProvenanceKnown,
      persisted.length > 0,
      designRunStore.manualOverrides,
    ),
    lockedMemberIds(),
  );
}
