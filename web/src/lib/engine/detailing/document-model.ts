/**
 * The DocumentModel: one assembled, self-consistent description of what is being issued.
 *
 * ── Why a model rather than three exporters ────────────────────────
 *
 * A PDF, a DXF and an XLSX of the same floor are three renderings of ONE statement about
 * the structure. Built independently they drift: the schedule totals bars the drawing does
 * not show, the report quotes a revision the drawing predates, and nobody can tell which is
 * wrong. The failure is silent and it is discovered on site.
 *
 * So the document is assembled ONCE — regulations, revisions, certificates, physical
 * assemblies, layers, fusions, laps, transitions, conflicts, review state, maturity — and
 * the three outputs are projections of it. Anything absent from the model cannot appear in
 * an output, and anything in the model appears in all of them consistently.
 *
 * ── Readiness is part of the document, not a footnote ──────────────
 *
 * A conflicted floor can still be documented. Engineers need drawings to discuss a problem
 * long before it is solved, and refusing to produce them is not caution, it is
 * obstruction. What must never happen is a conflicted floor producing a document that
 * looks issued.
 *
 * So every document carries a `readiness`, and a document that is not CONSTRUCTIBLE is a
 * REVIEW DRAFT: it lists its unresolved conflicts on the face of the first sheet, it is
 * watermarked, and it makes no construction claim. That is a different artefact from an
 * issued drawing, and it says so.
 *
 * Pure: no store, no runes, no i18n, no file system.
 */

import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import type { ClauseRef, RegulationEdition } from '../../codes/regulation';
import { worstMaturity, type Maturity } from '../../codes/maturity';
import { msg, type EngineMessage } from '../../codes/message';
import type { DetailingAssembly, ReviewState } from './assembly';
import type { BarConflict } from './collision';
import type { LapInterval } from './lap-materialize';
import type { ConstructibilityAssessment } from './constructibility';
import type { DesignConvergence } from './design-convergence';
import type { DesignFamily } from '../design/design-families';
import type { SlabColumnJointVerdict, ModelSlabColumnJoint } from '../design/analysis-validity';
import {
  certificateFreshness, finalGeometryHashOf, reinforcementHashOf,
  type FamilyCertificate, type FloorFamily, type FloorFamilyDesignRecord,
} from './family-record';

/**
 * What this document may claim.
 *
 * Ordered by increasing authority. A renderer that does not understand a value must refuse
 * to render rather than fall back to the most permissive one.
 */
export type DocumentReadiness =
  /** Physical conflicts remain. Discussion material; makes no construction claim. */
  | 'REVIEW_DRAFT'
  /** Clean and reverified, but no engineer has signed it. */
  | 'FOR_REVIEW'
  /** An engineer has reviewed it. */
  | 'REVIEWED'
  /** Issued for construction. */
  | 'ISSUED'
  /** A later revision exists. Kept for the record and never to be built from. */
  | 'SUPERSEDED'
  /**
   * The model changed after the detailing was generated: the bars describe a structure that is
   * no longer the one in the project. Never to be built from; regenerate the detailing.
   */
  | 'OUTDATED';

export interface DocumentRevision {
  /** Monotonic per document series. */
  number: number;
  /** ISO timestamp supplied by the caller — this module never reads the clock. */
  at: string;
  /** Free text; the app does not authenticate it. */
  author: string;
  /** The detailing revision this document was built from. */
  detailingRevision: number;
  /** The demand revision the detailing was verified against. */
  demandRevision: number;
}

/** One member's certificate, and whether it still describes the steel in the model. */
export interface CertificateEntry {
  elementId: number;
  /** Hash of the reinforcement the certificate was issued against. */
  certifiedHash: string;
  /** Hash of the reinforcement actually in the model now. */
  currentHash: string;
  /** The only question that matters. */
  matches: boolean;
  verifierId: string;
  status: 'ok' | 'warn' | 'fail' | 'notRun';
  /**
   * True when this member's design is a PROPOSAL rather than a certified design.
   *
   * Carried because `matches` cannot be read as certification and used to be the only signal
   * on the row. It answers "does the verification on record still describe the steel in the
   * model" — a staleness question — so a member whose steel was verified and REFUSED can
   * legitimately show `matches: true`. On a table headed "verification certificates" that is
   * one glance away from being read as certified, and a provisional member is exactly the
   * case where the glance would be wrong.
   */
  provisional?: boolean;
  /**
   * Set when the member's floor joins its slab to a column at one node (`analysis-validity.ts`):
   * the split of the slab's load between beams and columns its forces come from is the mesh's,
   * not established, so the certificate does not present the steel as the structure's verified
   * steel, and holds the document at a draft whatever its status.
   */
  loadSplit?: 'notEstablished';
}

/** The slab-column joint verdict a document carries: how its members' floors were idealised. */
export interface DocumentSlabColumnJoint {
  verdict: SlabColumnJointVerdict;
  /** The document's members on a floor with a one-node slab-column joint, each with its reason. */
  pointJoints: Array<{ elementId: number; reasonKey: string; params: Record<string, number> }>;
}

export interface DocumentAssembly {
  id: string;
  label: EngineMessage;
  state: ReviewState;
  elementIds: number[];
  bars: BarPath[];
  /** Distinct layer identities present, in a stable order. */
  layers: string[];
  laps: LapInterval[];
  /** Bars fused through a joint: one bar where the generator produced two. */
  fusions: Array<{ jointId: string; barId: string; ownerElementIds: number[] }>;
  conflicts: BarConflict[];
  constructibility?: ConstructibilityAssessment;
  maturity: Maturity;
  assumptions: EngineMessage[];
  /**
   * The persisted assembly this was built from.
   *
   * Carried so the drawing builders — which need marks, joints and stirrup zones, not just
   * bars — still read from the document rather than from a second source that can drift
   * out of step with it.
   */
  source: DetailingAssembly;
  /**
   * The floor-family design records this assembly carries, PROJECTED not recomputed.
   *
   * The document exists so a report, a drawing set and a schedule cannot disagree. That rule
   * is what forbids the alternative here: recomputing a bearing pressure or a Wood-Armer
   * moment at document time would create a second answer, and the two would differ the first
   * time a clause changed. Every number a family section prints is read off the record that
   * was persisted when the design ran.
   *
   * Empty for a beam line or a column stack.
   */
  families: FloorFamilyDesignRecord[];
  /** Their certificates, and whether each still describes what is in the model. */
  familyCertificates: FamilyCertificateEntry[];
}

/**
 * One family certificate as the document reports it.
 *
 * The frame equivalent is `CertificateEntry`, keyed by `elementId`. A family certificate
 * cannot use that shape: a slab panel is not one member id, a footing's owner is an entity
 * rather than an element, and the question asked is not only "does the hash match" but
 * "which of the five ways this can stop applying happened". So it is its own type, and the
 * two are reported side by side rather than one impersonating the other.
 */
export interface FamilyCertificateEntry {
  family: FloorFamily;
  ownerId: string;
  ownerElementIds: number[];
  certificate: FamilyCertificate;
  /**
   * Whether the certificate still applies, and if not, why — `fresh`, `missing`,
   * `staleRevision`, `geometryMismatch`, `reinforcementMismatch`, `designFailed` or
   * `designUnsupported`. Carried as the string the freshness check produced rather than
   * reduced to a boolean, because the remedies differ.
   */
  freshness: string;
  /** The only question a readiness decision asks. */
  applies: boolean;
}

export interface DocumentModel {
  /** Stable identity of the document SERIES, constant across revisions. */
  seriesId: string;
  revision: DocumentRevision;
  /**
   * Cross-sections placed on beam lines (`BeamLineCut`), each at its point in the model: the
   * sheets draw one section per cut on the assemblies holding those members, in place of the
   * section at the middle of the longest member.
   */
  sectionCuts?: Array<{ elementIds: number[]; label: string; at: { x: number; y: number; z: number } }>;
  readiness: DocumentReadiness;
  /** Set when this revision has been superseded, naming the one that replaced it. */
  supersededBy?: number;
  /** Regulations in force, with their editions, exactly as the verification used them. */
  regulations: Array<{ id: string; edition: RegulationEdition }>;
  /** Every clause the detailing relied on, deduplicated. */
  refs: ClauseRef[];
  assemblies: DocumentAssembly[];
  certificates: CertificateEntry[];
  /**
   * Unresolved conflicts across the whole document, as structured records.
   *
   * Present on a REVIEW_DRAFT and empty on anything above it. A renderer prints these on
   * the face of the first sheet; they are the reason the document is a draft.
   */
  openConflicts: OpenConflict[];
  /**
   * The conditions the detailing could not resolve, across the document: each assembly's
   * unsupported conditions, with the members they hold. A bar end anchored nowhere is one of
   * them (`detailing.anchorage.unresolved`), and while any is open the document is a draft.
   * Optional only for documents persisted before it existed.
   */
  openIssues?: OpenIssue[];
  /**
   * How the members' floors join the slab to the columns (`analysis-validity.ts`). With a one-node
   * joint the split of the slab's load between beams and columns is not established, and the
   * document is a draft that says so on its banner, whatever the buildability of its steel.
   * Absent on documents built before it existed.
   */
  slabColumnJoint?: DocumentSlabColumnJoint;
  /** Rolled up across assemblies. */
  maturity: Maturity;
  assumptions: EngineMessage[];
  /**
   * The families this document answers for, and the ones it does not.
   *
   * ── Why a document carries a scope at all ──────────────────────────
   *
   * Because `readiness` is a statement about the ASSEMBLIES in it, and a reader takes a
   * REVIEWED or ISSUED document to be a statement about the building. Those are the same
   * sentence exactly when the document covers everything the building has, and a run scoped to
   * beams and columns does not.
   *
   * So the scope travels with the document and out through every export. A sheet that says
   * "issued for construction" and does not say "beams and columns; the slabs are not in this
   * set" is a true claim that will be read as a false one, and a drawing is read on a site by
   * someone who was not in the room when the scope was chosen.
   *
   * `outOfScope` names families the MODEL HAS and this document does not cover. It is empty on
   * a building whose every family was designed, which is the only case where the unqualified
   * reading is the right one.
   */
  scope: DesignFamily[];
  outOfScope: DesignFamily[];
  /**
   * What this document was narrowed to, or null for the whole documentable set.
   *
   * Set by `narrowDocument` and by nothing else. `buildDocumentModel` never sets it, because a
   * document that was not narrowed has no selection to report and `{ elements: everything }`
   * would be a claim dressed as a fact — the reader could not tell a whole set from a selection
   * that happens to cover it.
   */
  selection?: DocumentSelection | null;
  /** One-line statement of what this document is. Translated at the boundary. */
  summary: EngineMessage;
}

/**
 * The narrowing a document carries, so every projection of it states the same subset.
 *
 * ── Why the document carries this and not the panel ────────────────
 *
 * Because the file is what leaves. A panel that knew the selection and a document that did not
 * would put the subset on screen and the whole set in the folder, which is the failure
 * `DocumentModel` exists to prevent, one level out.
 */
export interface DocumentSelection {
  /** The members this document contains, ascending. */
  elements: number[];
  /** How many the project could have documented. `elements.length` out of this. */
  ofBase: number;
  /** The families `elements` belongs to. A subset of `scope`, never more. */
  families: DesignFamily[];
  /**
   * Members NOT selected whose steel appears anyway, because a bar is one physical piece.
   *
   * A bar continuous over a support belongs to the beam it was designed for AND to the column it
   * passes through. Selecting the beam and not the column cannot cut that bar in half, so the
   * bar is drawn and the column is named here. Silence would leave a reader counting steel
   * against a member list that does not contain its owner.
   */
  sharedWith: number[];
}

/**
 * An unresolved conflict, with everything an engineer needs to act on it.
 *
 * A bare count is not actionable and a bare list of bar ids is barely better. The rule that
 * was applied, what was measured against it, and what was already tried are the difference
 * between a report someone can work from and a report someone has to re-derive.
 */
/** An unsupported condition of one assembly, as the document lists it. */
export interface OpenIssue {
  assemblyId: string;
  /** An i18n key when `params` is set; otherwise a stable condition key. */
  key: string;
  elementIds: number[];
  /** Language-neutral fallback. */
  message: string;
  params?: Record<string, string | number>;
}

/** Conditions that keep any document holding them a draft, whatever its assemblies' states. */
const DRAFT_ONLY_ISSUES = new Set(['detailing.anchorage.unresolved', 'detailing.cover.violated', 'detailing.clash.unresolved', 'detailing.finalVerification.failed']);
/** A lap the detailing could not check as built, or checked and found wanting (`splice-checks.ts`). */
export const isDraftOnlyIssue = (key: string) => DRAFT_ONLY_ISSUES.has(key) || key.startsWith('detailing.lapCheck.');

export interface OpenConflict {
  assemblyId: string;
  elementIds: number[];
  barIds: [string, string];
  /** Where, in model coordinates. */
  at: { x: number; y: number; z: number };
  /** Measured surface distance, m. Negative means interpenetration. */
  clearance: number;
  /** What the rule demanded, m. */
  required: number;
  /** How far short, m. Always positive for a reported conflict. */
  shortfall: number;
  /**
   * `overlap` — the bars physically interpenetrate; `clearance` — they are short of the
   * clear distance the rule demands.
   *
   * Carried rather than re-derived from the sign of `clearance`: the two are different
   * claims and the remedy differs, and a reader who has to compute the distinction from a
   * sign is a reader who will eventually get it wrong.
   */
  severity: 'overlap' | 'clearance' | 'marginal';
  /** The classification, e.g. `prohibitedOverlap`. */
  pairClass: string;
  /** The clause behind `required`. Empty for classes with no spacing rule. */
  refs: ClauseRef[];
  /** What the coordinator tried before giving up. */
  attempted: EngineMessage[];
  maturity: Maturity;
  /** What the engineer should do about it. */
  suggestedAction: EngineMessage;
}

/**
 * Decide what the document may claim, from evidence rather than from intent.
 *
 * Deliberately pessimistic at every step. A caller who wants ISSUED must have supplied an
 * assembly that reached ISSUED, a clean conflict list AND matching certificates; any gap
 * drops it to the highest rung the evidence supports.
 */
export function documentReadiness(input: {
  assemblies: readonly DocumentAssembly[];
  certificates: readonly CertificateEntry[];
  supersededBy?: number;
  /** The model changed after the detailing in it was generated (`store/design-fingerprint.ts`). */
  outdated?: boolean;
  /** A member's floor joins its slab to a column at one node (`analysis-validity.ts`). */
  loadSplitNotEstablished?: boolean;
}): DocumentReadiness {
  if (input.supersededBy !== undefined) return 'SUPERSEDED';
  if (input.outdated) return 'OUTDATED';
  // Buildable steel designed from a split of the slab's load the model does not establish is not a
  // document anyone may review as the structure: a draft, whatever the assemblies and the
  // certificates say.
  if (input.loadSplitNotEstablished || input.certificates.some((c) => c.loadSplit === 'notEstablished')) return 'REVIEW_DRAFT';

  const anyConflict = input.assemblies.some((a) =>
    a.conflicts.some((c) => c.severity !== 'marginal'));
  if (anyConflict) return 'REVIEW_DRAFT';
  // A bar the detailing could not anchor is not buildable, and the sheet that draws it must not
  // read better than a draft — checked here and not only through the assembly's state, so a state
  // set by any other path cannot lift it.
  if (input.assemblies.some((a) => (a.source?.unsupported ?? []).some((u) => isDraftOnlyIssue(u.key)))) return 'REVIEW_DRAFT';

  /**
   * A family certificate that does not apply is exactly as disqualifying as a frame one.
   *
   * Checked FIRST, and separately, because the frame test below reads `certificates`, which
   * for a floor assembly is a list of element ids with no reinforcement behind them — every
   * entry `notRun` with two empty hashes. A slab-only document would therefore have been a
   * REVIEW_DRAFT forever on the strength of a question that does not apply to it, while its
   * own certificates went unread.
   */
  const familyEntries = input.assemblies.flatMap((a) => a.familyCertificates);
  if (familyEntries.some((c) => !c.applies)) return 'REVIEW_DRAFT';

  /**
   * The frame certificate test, applied only where frame certificates are the evidence.
   *
   * An assembly whose members are floor families answers with its family certificates, which
   * were just checked. Demanding a frame certificate for a footing's column id as well would
   * be the same category error in the other direction.
   */
  const framePart = input.certificates.filter((c) =>
    !familyEntries.some((f) => f.ownerElementIds.includes(c.elementId)));
  const needsFrameEvidence = familyEntries.length === 0 || framePart.length > 0;
  if (needsFrameEvidence
    && (framePart.length === 0
      || framePart.some((c) => !c.matches || c.status === 'fail'))) {
    return 'REVIEW_DRAFT';
  }

  const rank = (s: ReviewState) =>
    ['DRAFT', 'VERIFIED', 'COORDINATED', 'CONSTRUCTIBLE', 'REVIEWED', 'ISSUED'].indexOf(s);
  const lowest = input.assemblies.reduce(
    (m, a) => Math.min(m, rank(a.state)), Number.POSITIVE_INFINITY);

  if (lowest >= rank('ISSUED')) return 'ISSUED';
  if (lowest >= rank('REVIEWED')) return 'REVIEWED';
  if (lowest >= rank('CONSTRUCTIBLE')) return 'FOR_REVIEW';
  return 'REVIEW_DRAFT';
}

/**
 * Turn an assembly's conflicts into records an engineer can act on.
 *
 * Takes only the four fields it reads. It used to demand a whole `DocumentAssembly`, which
 * meant every caller and every test had to supply a source assembly, family records and
 * certificates to ask a question about conflicts — and a function whose signature overstates
 * its needs is one whose callers eventually satisfy it with a cast.
 */
export function openConflictsOf(
  a: Pick<DocumentAssembly, 'id' | 'conflicts' | 'maturity'>,
  attempted: readonly EngineMessage[] = [],
): OpenConflict[] {
  return a.conflicts
    .filter((c) => c.severity !== 'marginal')
    .map((c) => ({
      assemblyId: a.id,
      elementIds: c.elementIds,
      barIds: [c.barA, c.barB] as [string, string],
      at: c.at,
      clearance: c.clearance,
      required: c.required,
      shortfall: c.shortfall,
      severity: c.severity,
      pairClass: c.pairClass ?? 'unknown',
      refs: [],
      attempted: [...attempted],
      maturity: a.maturity,
      suggestedAction: msg(
        c.pairClass === 'prohibitedOverlap'
          ? 'detailing.action.prohibitedOverlap'
          : 'detailing.action.increaseSpacing',
        {
          elements: c.elementIds.join(', '),
          shortfall: Math.round(c.shortfall * 1000),
        },
      ),
    }));
}

/**
 * Assemble the document.
 *
 * Everything it will ever say is decided here. The renderers below add no facts.
 */
export function buildDocumentModel(input: {
  seriesId: string;
  revision: DocumentRevision;
  regulations: Array<{ id: string; edition: RegulationEdition }>;
  assemblies: readonly DetailingAssembly[];
  laps: readonly LapInterval[];
  certificates: readonly CertificateEntry[];
  supersededBy?: number;
  /** Cross-sections placed on beam lines (`DocumentModel.sectionCuts`). */
  sectionCuts?: DocumentModel['sectionCuts'];
  /** The model changed after the detailing was generated: the document says so on its face. */
  outdated?: boolean;
  /** Alternatives the coordinator tried, for the conflict records. */
  attempted?: readonly EngineMessage[];
  /**
   * The revision vector as it stands NOW, for deciding family-certificate freshness.
   *
   * Supplied by the caller because this module is pure and cannot read a store. Absent, every
   * family certificate is reported against its OWN vector, which always compares equal — so a
   * caller that omits it gets a document that cannot detect a stale certificate. That is why
   * the production caller always passes it, and why omitting it is visible here rather than
   * silently benign.
   */
  currentRevisions?: FamilyCertificate['revisions'];
  /**
   * The convergence the run reported, for the scope this document states.
   *
   * Passed in rather than recomputed: the denominator a claim was measured against has to be the
   * one that produced it, and a document that re-derived its own scope from the assemblies in it
   * would always report "covers exactly what it covers" — a tautology in the shape of a
   * measurement.
   *
   * Absent means the caller has no scope information, and the document reports an EMPTY scope
   * with nothing out of it rather than inventing one. That is visible — an export with no
   * families named — instead of silently benign.
   */
  convergence?: Pick<DesignConvergence, 'scope' | 'outOfScope'>;
  /**
   * The design run's slab-column joint verdict (`analysis-validity.ts`), for the members this
   * document holds. Absent means the caller has none, and the document claims nothing about it.
   */
  slabColumnJoint?: ModelSlabColumnJoint;
}): DocumentModel {
  const docAssemblies: DocumentAssembly[] = input.assemblies.map((a) => {
    const layers = [...new Set(a.bars.map((b) => b.layerId).filter(Boolean) as string[])]
      .sort();
    const ownIds = new Set(a.bars.map((b) => b.id));

    // ── Family records and their certificates, projected ────────────────
    //
    // Freshness is decided HERE, against the model as it stands, rather than trusted from the
    // record. A record is a historical statement and remains true; whether its certificate
    // still describes the current steel is a question only the present can answer, and it is
    // the question a document must not get wrong.
    const families = [...(a.families ?? [])];
    const familyCertificates: FamilyCertificateEntry[] = families.map((r) => {
      /**
       * The record's own bars, found once.
       *
       * ── The 1,9 seconds this removes from the 3-D button ───────────────
       *
       * This used to be `a.bars.filter((b) => r.barIds.includes(b.id))`, written TWICE — once
       * per hash. `Array.includes` is a linear scan, so the pair cost 2·|a.bars|·|r.barIds|
       * string comparisons per record. For a beam line or a column stack that is nothing:
       * `families` is empty and the whole block is skipped.
       *
       * It stops being nothing the moment the FLOOR design runs. A slab family owns thousands
       * of bars inside an assembly that holds thousands more, and the product is tens of
       * millions of comparisons — measured at 1 695 ms across the two calls on the 7-storey
       * building, inside `buildDocument`, inside the click handler for "3-D". That is the
       * whole of "the button does not respond": the browser had no frame to give until it
       * finished, so the click looked lost and the app looked frozen.
       *
       * A Set makes the membership test O(1) and the single pass halves what is left. Nothing
       * about WHAT is hashed changes — same bars, same order, same hashes.
       */
      const ownedIds = new Set(r.barIds);
      const ownedBars = a.bars.filter((b) => ownedIds.has(b.id));
      const freshness = certificateFreshness({
        certificate: r.certificate,
        current: {
          // The three PROJECT-wide stages come from the caller's current vector, so a
          // certificate stamped before a re-solve is reported as stale.
          ...(input.currentRevisions ?? r.certificate.revisions),
          /**
           * The ENTITY revision is per record, and the document has no project-wide value to
           * compare it against — footing Z7's revision is not footing Z1's. So the record's
           * own is used, which makes this field a no-op for the comparison.
           *
           * That is not a hole: an entity edit that changes anything the design read also
           * changes the geometry and input hashes, and those ARE compared below against
           * freshly computed values. The entity revision exists for TARGETED invalidation
           * upstream, not as the document's staleness test.
           */
          entity: r.certificate.revisions.entity,
        },
        currentGeometryHash: r.geometryHash,
        currentInputHash: r.inputHash,
        // Hashed from the bars in the assembly RIGHT NOW, filtered to the ones this record
        // owns. This is what catches a bar added, removed or moved after certification.
        currentReinforcementHash: reinforcementHashOf(ownedBars),
        currentFinalGeometryHash: finalGeometryHashOf(ownedBars),
      });
      return {
        family: r.family,
        ownerId: r.ownerId,
        ownerElementIds: [...r.ownerElementIds],
        certificate: r.certificate,
        freshness,
        applies: freshness === 'fresh',
      };
    });

    return {
      families,
      familyCertificates,
      id: a.id,
      label: msg(a.labelKey ?? 'detailing.assembly.generic', a.labelParams ?? {}),
      state: a.state,
      elementIds: [...a.elementIds],
      bars: [...a.bars],
      layers,
      laps: input.laps.filter((l) => ownIds.has(l.fromBarId) || ownIds.has(l.toBarId)),
      // A bar owned by more than one member passed through a joint as one piece.
      fusions: a.bars
        .filter((b) => b.ownerElementIds.length > 1)
        .map((b) => ({
          jointId: b.id, barId: b.id, ownerElementIds: [...b.ownerElementIds],
        })),
      conflicts: [...a.conflicts],
      constructibility: a.constructibility,
      maturity: a.maturity,
      assumptions: [...(a.provenance?.assumptions ?? [])],
      source: a,
    };
  });

  // The joint verdict over the members this document holds (a span's representative is one). A
  // point joint on none of them leaves the document's members represented, or not applicable.
  const held = new Map<number, string>();
  for (const a of docAssemblies) for (const id of a.elementIds) if (!held.has(id)) held.set(id, a.id);
  const pointJoints = (input.slabColumnJoint?.pointJoints ?? []).filter((m) => held.has(m.elementId));
  const joint: DocumentSlabColumnJoint | undefined = input.slabColumnJoint ? {
    verdict: input.slabColumnJoint.verdict === 'pointJoint' && pointJoints.length === 0 ? 'notApplicable' : input.slabColumnJoint.verdict,
    pointJoints: pointJoints.map((m) => ({ elementId: m.elementId, reasonKey: m.reasonKey ?? 'slabColumnJoint.point', params: { ...(m.params ?? {}) } })),
  } : undefined;

  const readiness = documentReadiness({
    assemblies: docAssemblies,
    certificates: input.certificates,
    supersededBy: input.supersededBy,
    ...(input.outdated ? { outdated: true } : {}),
    ...(joint?.verdict === 'pointJoint' ? { loadSplitNotEstablished: true } : {}),
  });

  const openConflicts = docAssemblies
    .flatMap((a) => openConflictsOf(a, input.attempted));
  const openIssues: OpenIssue[] = docAssemblies.flatMap((a) => (a.source.unsupported ?? []).map((u) => ({
    assemblyId: a.id, key: u.key, elementIds: [...(u.scope.elementIds ?? [])], message: u.message,
    ...(u.params ? { params: { ...u.params } } : {}),
  })));
  for (const m of joint?.pointJoints ?? []) {
    openIssues.push({ assemblyId: held.get(m.elementId)!, key: m.reasonKey, elementIds: [m.elementId], message: 'slab joined to the columns at one node: the split of its load between beams and columns is not established', params: { ...m.params } });
  }

  // Clause provenance travels on the bars themselves, so the document cites exactly the
  // rules the steel it contains was built under — not a list maintained alongside it that
  // can drift out of step.
  const refs = new Map<string, ClauseRef>();
  for (const a of input.assemblies) {
    for (const bar of a.bars) {
      for (const r of bar.refs ?? []) {
        refs.set(`${r.regulation}|${r.edition}|${r.clause}`, r);
      }
    }
  }

  return {
    seriesId: input.seriesId,
    ...(input.sectionCuts?.length ? { sectionCuts: input.sectionCuts.map((c) => ({ ...c, elementIds: [...c.elementIds], at: { ...c.at } })) } : {}),
    revision: input.revision,
    readiness,
    supersededBy: input.supersededBy,
    regulations: [...input.regulations],
    refs: [...refs.values()],
    assemblies: docAssemblies,
    certificates: [...input.certificates],
    openConflicts,
    openIssues,
    ...(joint ? { slabColumnJoint: joint } : {}),
    // The family records' maturities count too. A footing whose punching is UNSUPPORTED must
    // not be able to raise the document's maturity above its own by being reported in a
    // section the roll-up does not read.
    maturity: worstMaturity([
      ...docAssemblies.map((a) => a.maturity),
      ...docAssemblies.flatMap((a) => a.families.map((r) => r.maturity)),
    ]),
    assumptions: [
      ...docAssemblies.flatMap((a) => a.assumptions),
      ...docAssemblies.flatMap((a) => a.families.flatMap((r) => r.assumptions)),
    ],
    scope: [...(input.convergence?.scope ?? [])],
    outOfScope: [...(input.convergence?.outOfScope ?? [])],
    summary: msg(
      readiness === 'REVIEW_DRAFT' && joint?.verdict === 'pointJoint'
        ? 'detailing.document.slabColumnPointJoint'
        : readiness === 'REVIEW_DRAFT'
        ? 'detailing.document.reviewDraft'
        : readiness === 'SUPERSEDED'
          ? 'detailing.document.superseded'
          : readiness === 'OUTDATED'
            ? 'detailing.document.outdated'
            : 'detailing.document.current',
      {
        revision: input.revision.number,
        assemblies: docAssemblies.length,
        conflicts: openConflicts.length,
        superseded: input.supersededBy ?? 0,
        pointJoints: joint?.pointJoints.length ?? 0,
      },
    ),
  };
}

/**
 * Mark a document superseded by a later revision.
 *
 * A superseded document is never mutated in place and never deleted. It is the record of
 * what was issued, and a project that cannot show what it previously issued cannot answer
 * the only question that matters after something goes wrong.
 */
export function supersede(doc: DocumentModel, byRevision: number): DocumentModel {
  return {
    ...doc,
    readiness: 'SUPERSEDED',
    supersededBy: byRevision,
    summary: msg('detailing.document.superseded', {
      revision: doc.revision.number,
      assemblies: doc.assemblies.length,
      conflicts: doc.openConflicts.length,
      superseded: byRevision,
    }),
  };
}

/** True when this document may be used to build. Nothing else may claim it. */
export function isConstructionReady(doc: DocumentModel): boolean {
  return doc.readiness === 'ISSUED';
}
