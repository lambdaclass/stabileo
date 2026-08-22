/**
 * The persisted detailing assembly — what a coordinated floor actually IS.
 *
 * PR15 persisted reinforcement as counts and diameters on each element. That is a
 * per-member description and it cannot express the things coordination produces: a bar
 * that spans three members, a lap that belongs to a junction rather than to either
 * member, a conflict between two members' cages, or the fact that the user pinned one
 * span by hand.
 *
 * A `DetailingAssembly` is the unit of coordination: one continuous beam line or one
 * column stack, with its bars, joints, conflicts, provenance and revision. Assemblies
 * are persisted with the model and travel through .ded, tabs, URL sharing and autosave,
 * because a coordinated floor that has to be regenerated on every open is not a
 * deliverable.
 *
 * ── Invalidation ───────────────────────────────────────────────
 *
 * `detailingRevision` is bumped per assembly, not globally. Editing one beam line must
 * not mark an untouched line on the far side of the floor stale — that is the same class
 * of over-invalidation PR15 was written to repair, one level up.
 *
 * A locked bar path is a hard constraint that survives regeneration. Regeneration that
 * silently discards manual work is the single fastest way to lose a user's trust.
 *
 * Pure: no store, no runes.
 */

import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import type { ClauseRef, RegulationEdition } from '../../codes/regulation';
import type { Maturity } from '../../codes/maturity';
import type { BarConflict } from './collision';
import type { ConstructibilityAssessment } from './constructibility';
import { msg, type EngineMessage } from '../../codes/message';
import type { FamilyCertificate, FloorFamilyDesignRecord } from './family-record';

/**
 * Bumped to 2 when floor-family design records became part of the persisted assembly.
 *
 * A version-1 store is still readable and loses nothing it ever had: it simply carries no
 * family records, which is the truth about a project detailed before they existed. The
 * migration below does NOT synthesise them — a fabricated record would be evidence of a
 * design that was never performed, which is worse than an absent one.
 */
export const DETAILING_SCHEMA_VERSION = 2;

export type AssemblyKind = 'beamLine' | 'columnStack';

/**
 * Review states, in order. Each is a strictly stronger claim than the last.
 *
 * VERIFIED       every member passes its code checks in isolation
 * COORDINATED    the coordinator produced a consistent set across the assembly
 * CONSTRUCTIBLE  physical bars fit: no collisions, no cover breaches, laps resolve
 * REVIEWED       a named engineer recorded their review of a specific revision
 * ISSUED         released for construction by that engineer
 *
 * REVIEWED and ISSUED are records of a human decision. Nothing in the app may set them,
 * and no state implies the software performed a legal approval.
 */
export const REVIEW_STATES = [
  'DRAFT', 'VERIFIED', 'COORDINATED', 'CONSTRUCTIBLE', 'REVIEWED', 'ISSUED',
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export function reviewRank(s: ReviewState): number {
  return REVIEW_STATES.indexOf(s);
}

/**
 * The revision a regeneration produces, from the one it supersedes.
 *
 * One line, and it is a shared function because it now has TWO callers. `buildFloorAssembly`
 * stamps the assembly with it, and the footing pass stamps each physical mat bar's provenance
 * with it before the assembly exists — so a bar can say which revision it belongs to. Two
 * copies of `previous + 1` in two modules is exactly how a bar comes to claim a revision one
 * off from the assembly holding it.
 */
export function nextDetailingRevision(previous?: number): number {
  return (previous ?? 0) + 1;
}

/** A human decision, recorded. Never produced by the app on its own. */
export interface ReviewRecord {
  /** Free text: the person who reviewed it. The app does not authenticate this. */
  engineer: string;
  /** ISO timestamp supplied by the caller — this module never reads the clock. */
  at: string;
  /** The assembly revision that was reviewed. A later revision invalidates the record. */
  revision: number;
  state: 'REVIEWED' | 'ISSUED';
  notes?: string;
  /**
   * True when the reviewer explicitly acknowledged the provisional calculations listed
   * in `acknowledgedProvisional`. Required before an assembly carrying provisional work
   * can reach REVIEWED.
   */
  provisionalAcknowledged: boolean;
  /** Which provisional calculations the reviewer accepted, by key. */
  acknowledgedProvisional: string[];
}

/** A bar mark: the schedule row a set of identical bars shares. */
export interface BarMark {
  /** Mark label, e.g. 'B12'. Deterministic — see `assignMarks`. */
  mark: string;
  diameterMm: number;
  /** Cutting length, m. */
  cuttingLength: number;
  quantity: number;
  /** Shape code describing the bend pattern, e.g. 'straight', 'L90', 'U', 'crank'. */
  shape: string;
  /** Total mass for this mark, kg. */
  massKg: number;
  /** Bar path ids sharing this mark. */
  barIds: string[];
  /**
   * What the marked item IS, and where it belongs — the columns a bender and a site engineer
   * read before the numbers.
   *
   * A mark groups identical fabricated items, so `role` is single-valued by construction: a
   * stirrup and a longitudinal bar never share a shape code. `ownerElementIds` and `zoneIds`
   * are unions, because one mark legitimately covers the same piece repeated across members
   * and zones — which is the whole point of a mark.
   *
   * Carried on the mark rather than re-derived in each exporter. A schedule that looks up its
   * own owners is a second reader of the same fact and the two drift.
   */
  role: BarPath['role'];
  /**
   * What the marked item is FOR — see `BarPath.purpose`. Absent means resistant reinforcement.
   *
   * Part of the grouping key, not a summary of it: a Ø10 hanger and a Ø10 hogging bar of the
   * same cut length ARE the same fabricated item, but they are not the same line on a schedule
   * an engineer signs. One is steel that resists a moment and one is steel that holds a stirrup,
   * and a bender reading a merged row cannot tell which of the two the drawing meant.
   */
  purpose?: BarPath['purpose'];
  ownerElementIds: number[];
  zoneIds: string[];
}

/** A junction between two members in the assembly, or between assemblies. */
export interface JointRecord {
  id: string;
  /** Node the joint sits at. */
  nodeId: number;
  /** Elements meeting here. */
  elementIds: number[];
  kind: 'interior' | 'exterior' | 'corner' | 'roof';
  /** How many beams frame in, in plan. */
  beamCount: number;
  /** Layer allocated to each incident beam, so perpendicular beams do not collide. */
  beamLayers: Array<{ elementId: number; layer: number }>;
  /** Joint-shear result key, when one was computed. */
  jointShearKey?: string;
  maturity: Maturity;
  /** Conflicts local to this joint that the resolver could not clear. */
  unresolved: BarConflict[];
}

export interface UnsupportedCondition {
  /** Stable key, matching a CapabilityKey where one applies. */
  key: string;
  /** Element or joint it applies to. */
  scope: { elementIds?: number[]; jointIds?: string[] };
  /** Shown verbatim to the user and printed on the drawing. */
  message: string;
  refs: ClauseRef[];
}

export interface AssemblyProvenance {
  /** Edition every rule in this assembly was resolved against. */
  edition: RegulationEdition;
  /** Verifier identity that produced the member verdicts. */
  verifierId: string;
  /** Coordination cost, for the explainability trail. */
  coordinationCost?: number;
  /** The coordinator's decision trace. */
  trace: string[];
  /**
   * Assumptions carried by any calculation in the assembly.
   *
   * Structured, not prose: these reach certificates, reports and exports, so they have to
   * be translatable. PR16's rule that pure engines never emit user-facing text applies
   * here as much as anywhere.
   */
  assumptions: EngineMessage[];
}

export interface DetailingAssembly {
  /**
   * The thirteen-condition gate as evaluated for this assembly, when it was run.
   *
   * Persisted with the assembly because the verdict has to survive a reload: an engineer
   * reopening a project must see WHY it is not constructible without re-running the whole
   * coordination to find out.
   */
  constructibility?: ConstructibilityAssessment;
  id: string;
  kind: AssemblyKind;
  /**
   * Human label.
   *
   * `labelKey` + `labelParams` is the current form and is what the UI renders; `label` is
   * kept as the fallback for projects stored before the split and for a caller that has
   * genuinely free text (a user-named assembly). An assembly must never render blank.
   */
  label: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  /** Members in order along the line or up the stack. */
  elementIds: number[];
  /** Physical bars. A bar spanning two members appears once, owned by both. */
  bars: BarPath[];
  marks: BarMark[];
  joints: JointRecord[];
  conflicts: BarConflict[];
  unsupported: UnsupportedCondition[];
  /**
   * Members in this assembly whose OWN design is a proposal, not a certified design.
   *
   * Distinct from "owns a provisional bar", which is a different and wider set: a bar
   * continuous over a support belongs to the beam it was designed for AND to the column it
   * passes through, so a fully verified column adjacent to a provisional beam owns a
   * provisional bar without itself being provisional. The bar is unbuildable either way — it
   * runs through a proposal — but the COLUMN's design is certified, and reporting otherwise
   * would understate what the app actually achieved.
   *
   * Recorded on the assembly so the document, and every projection of it, can state the
   * member-level fact without re-deriving it from bar ownership.
   */
  provisionalMembers?: number[];
  /**
   * Members in this assembly carrying torsion that no check in this application evaluates.
   *
   * A WARNING, not a state. These members keep their geometry, their reinforcement and their
   * proposal if they have one; what changes is that every projection of this assembly says the
   * torsion was not verified. See `torsion-notice.ts` for why that is the only honest option
   * and for why it is not a refusal.
   *
   * Recorded next to `provisionalMembers` and read the same way, so the report, the sheets, the
   * schedule and the 3-D view cannot form four opinions about which members they are.
   */
  torsionUnevaluatedMembers?: number[];
  /**
   * Bumped whenever this assembly is regenerated. Per-assembly, so editing one line does
   * not mark an untouched line stale.
   */
  detailingRevision: number;
  /** Demand revision the bars were generated against. Mismatch means stale. */
  demandRevision: number;
  state: ReviewState;
  /**
   * Why the assembly is not at the next state up.
   *
   * Computed by `evaluateState` and now CARRIED, not discarded. Without this the panel
   * showed "COORDINATED" beside a review that silently refused, and the user had no way
   * to learn what stood between them and a constructible cage.
   */
  stateBlockers?: string[];
  review?: ReviewRecord;
  /** Worst maturity across every calculation in the assembly. */
  maturity: Maturity;
  provenance: AssemblyProvenance;
  /**
   * The authoritative design evidence for the floor families in this assembly.
   *
   * ── Why it lives HERE ───────────────────────────────────────────
   *
   * Because this is the object the steel lives on, and the two must travel together. Before
   * this, slab/wall/footing results existed only in `$state` — `lastFloorRun`,
   * `lastFootingRun` — while the bars they sized were persisted with the model. Reopening a
   * project therefore produced a coordinated cage with no record of the demands,
   * combinations or ground profile behind it: steel that had outlived its own justification
   * and still read as a design.
   *
   * Persisting the records alongside the bars means .ded save/open, undo/redo, tab capture,
   * autosave and URL sharing carry the evidence for free — they all go through
   * `snapshot()`/`restore()` — and it means a record that drifts from its steel is
   * DETECTABLE, because the record carries the hash of the cage it produced.
   *
   * Absent on a beam-line or column-stack assembly, and on any floor detailed before the
   * records existed. Absent is not empty: an empty array asserts "designed, nothing found",
   * and `undefined` says the question was never asked.
   */
  families?: FloorFamilyDesignRecord[];
  /**
   * The family certificates, one per applicable family member.
   *
   * Carried separately from the records rather than only inside them, because the
   * constructibility gate reads certificates without needing the full design evidence, and
   * a certificate has a different lifetime: it is VOIDED by an edit that leaves the record
   * intact as the historical statement of what was designed.
   */
  familyCertificates?: FamilyCertificate[];
}

// ─── Marks ───────────────────────────────────────────────────────

/** Round a length to the nearest 10 mm — the granularity a schedule is cut to. */
function roundCut(m: number): number {
  return Math.round(m * 100) / 100;
}

/**
 * Describe a bar's bend pattern as a shape code.
 *
 * Two bars share a mark only when they are the same bar: same diameter, same cut length,
 * same shape. Marking two different shapes as one is how a bundle arrives on site with
 * the wrong bars in it.
 */
export function shapeCode(bar: BarPath): string {
  const arcs = bar.segments.filter((s) => s.kind === 'arc').length;
  const start = bar.startTreatment.kind === 'hook'
    ? `H${bar.startTreatment.hook.angle}` : '';
  const end = bar.endTreatment.kind === 'hook'
    ? `H${bar.endTreatment.hook.angle}` : '';
  if (arcs === 0) return 'straight';
  if (start && end) return `U${start}${end}`;
  if (start || end) return `L${start}${end}`;
  return `bent${arcs}`;
}

/**
 * Assign bar marks deterministically.
 *
 * Grouped by (diameter, rounded cut length, shape) and then sorted so the same input
 * always yields the same labels — a golden drawing test is worthless if the marks
 * shuffle between runs.
 */
export function assignMarks(bars: readonly BarPath[], prefix = 'B'): BarMark[] {
  const groups = new Map<string, BarPath[]>();
  for (const bar of bars) {
    // `purpose` joins the key so a hanger never shares a schedule row with hogging steel. It is
    // empty on every bar that carries no purpose, which is all of them until a beam has no
    // hogging demand, so no existing mark moves because this term exists.
    const key = `${bar.diameterMm}|${roundCut(bar.cuttingLength).toFixed(2)}`
      + `|${shapeCode(bar)}|${bar.purpose ?? ''}`;
    const g = groups.get(key);
    if (g) g.push(bar); else groups.set(key, [bar]);
  }

  const sorted = [...groups.entries()].sort(([a], [b]) => {
    const [da, la, sa, pa] = a.split('|');
    const [db, lb, sb, pb] = b.split('|');
    return Number(da) - Number(db)
      || Number(la) - Number(lb)
      || sa.localeCompare(sb)
      || pa.localeCompare(pb);
  });

  return sorted.map(([key, list], i) => {
    const [dia, len, shape] = key.split('|');
    const diameterMm = Number(dia);
    const cuttingLength = Number(len);
    const area = Math.PI * (diameterMm / 2000) ** 2;
    return {
      mark: `${prefix}${i + 1}`,
      diameterMm,
      cuttingLength,
      quantity: list.length,
      shape,
      massKg: area * cuttingLength * 7850 * list.length,
      barIds: list.map((b) => b.id).sort(),
      role: list[0].role,
      ...(list[0].purpose ? { purpose: list[0].purpose } : {}),
      ownerElementIds: [...new Set(list.flatMap((b) => b.ownerElementIds))]
        .sort((x, y) => x - y),
      zoneIds: [...new Set(list.map((b) => b.zoneId).filter((z): z is string => !!z))].sort(),
    };
  });
}

// ─── State transitions ───────────────────────────────────────────

export interface StateEvaluation {
  state: ReviewState;
  /** Why the assembly did not reach a higher state. Empty when it reached the top. */
  blockers: string[];
}

/**
 * Compute the state an assembly has EARNED from its contents.
 *
 * Deliberately cannot return REVIEWED or ISSUED: those are human records, and a function
 * that could award them would be the software signing off on itself. They are applied
 * separately by `applyReview`.
 */
export function evaluateState(a: {
  bars: readonly BarPath[];
  conflicts: readonly BarConflict[];
  unsupported: readonly UnsupportedCondition[];
  /** True when every member in the assembly passed its own code checks. */
  membersVerified: boolean;
  /** True when the coordinator returned a coordinated result. */
  coordinated: boolean;
  /**
   * The thirteen-condition gate, when it has been run.
   *
   * Optional only so that callers dealing with a partially built assembly can still ask
   * for a state. When it is ABSENT, CONSTRUCTIBLE is not available at all: the ladder's
   * top rung is a claim that requires evidence, and no evidence means no claim. The old
   * behaviour — award CONSTRUCTIBLE whenever the conflict list happened to be empty — is
   * how an assignment result came to be reported as buildable detailing.
   */
  constructibility?: ConstructibilityAssessment;
}): StateEvaluation {
  const blockers: string[] = [];

  if (!a.membersVerified) {
    blockers.push('Hay elementos que no superan su verificación individual.');
    return { state: 'DRAFT', blockers };
  }
  if (a.unsupported.length > 0) {
    blockers.push(
      `${a.unsupported.length} condición(es) no soportada(s): ` +
      a.unsupported.map((u) => u.key).join(', ') + '.');
  }
  if (!a.coordinated) {
    blockers.push('La coordinación no produjo un conjunto consistente.');
    return { state: 'VERIFIED', blockers };
  }
  if (a.bars.length === 0) {
    blockers.push('No se generaron barras físicas.');
    return { state: 'VERIFIED', blockers };
  }

  const blocking = a.conflicts.filter((c) => c.severity !== 'marginal');
  if (blocking.length > 0) {
    blockers.push(`${blocking.length} conflicto(s) físico(s) sin resolver.`);
    return { state: 'COORDINATED', blockers };
  }
  if (a.unsupported.length > 0) {
    // Unsupported conditions gate constructibility even when the bars fit: a cage that
    // fits but was never checked for something is not constructible, it is unchecked.
    return { state: 'COORDINATED', blockers };
  }

  // The thirteen conditions. An empty conflict list is one of them, not all of them —
  // re-verification at the final effective depth, certificate/geometry hash agreement and
  // placement robustness are each independently capable of withholding the claim.
  if (!a.constructibility) {
    blockers.push('constructibility.notAssessed');
    return { state: 'COORDINATED', blockers };
  }
  if (a.constructibility.verdict !== 'CONSTRUCTIBLE') {
    blockers.push(...a.constructibility.blocking.map((c) => `constructibility.${c}`));
    return { state: 'COORDINATED', blockers };
  }

  return { state: 'CONSTRUCTIBLE', blockers: [] };
}

export interface ReviewAttempt {
  ok: boolean;
  assembly?: DetailingAssembly;
  /**
   * Why the review was refused, as a KEY.
   *
   * These four sentences were Spanish string literals in a pure module, so an English-locale
   * user who tried to review a floor that had not reached CONSTRUCTIBLE was told why in
   * Spanish. Found by the bilingual acceptance journey. The store is the locale boundary and
   * translates it, exactly as it does for every other engine message.
   */
  reason?: EngineMessage;
}

/**
 * Record an engineer's review of a specific revision.
 *
 * Refuses when the assembly has not reached CONSTRUCTIBLE, and refuses when it carries
 * provisional calculations the reviewer has not explicitly acknowledged. The second
 * check is what keeps `IMPLEMENTED_PROVISIONAL` honest: a provisional result may be
 * accepted, but only deliberately.
 */
export function applyReview(
  assembly: DetailingAssembly,
  record: Omit<ReviewRecord, 'revision'>,
  provisionalKeys: readonly string[] = [],
): ReviewAttempt {
  if (reviewRank(assembly.state) < reviewRank('CONSTRUCTIBLE')) {
    return {
      ok: false,
      reason: msg('detailing.review.notConstructible', { state: assembly.state }),
    };
  }
  if (!record.engineer.trim()) {
    return { ok: false, reason: msg('detailing.review.engineerRequired') };
  }

  const outstanding = provisionalKeys.filter((k) => !record.acknowledgedProvisional.includes(k));
  if (outstanding.length > 0) {
    return {
      ok: false,
      reason: msg('detailing.review.provisionalOutstanding',
        { keys: outstanding.join(', '), count: outstanding.length }),
    };
  }
  if (provisionalKeys.length > 0 && !record.provisionalAcknowledged) {
    return { ok: false, reason: msg('detailing.review.provisionalNotAcknowledged') };
  }

  return {
    ok: true,
    assembly: {
      ...assembly,
      state: record.state,
      review: { ...record, revision: assembly.detailingRevision },
    },
  };
}

/**
 * True when a review no longer applies because the assembly moved on.
 *
 * A drawing in this state carries the SUPERSEDED watermark.
 */
export function isReviewStale(a: DetailingAssembly): boolean {
  return a.review !== undefined && a.review.revision !== a.detailingRevision;
}

/** True when the bars were generated against demands that have since changed. */
export function isDemandStale(a: DetailingAssembly, currentDemandRevision: number): boolean {
  return a.demandRevision !== currentDemandRevision;
}

// ─── Persistence ─────────────────────────────────────────────────

export interface DetailingStore {
  version: number;
  assemblies: DetailingAssembly[];
}

export function emptyDetailingStore(): DetailingStore {
  return { version: DETAILING_SCHEMA_VERSION, assemblies: [] };
}

export interface DetailingMigration {
  store: DetailingStore;
  notices: Array<{ key: string; params?: Record<string, string | number> }>;
}

/**
 * Load a persisted detailing store, migrating older shapes forward.
 *
 * Unknown or corrupt payloads degrade to an empty store rather than throwing: losing the
 * detailing is recoverable by regenerating, whereas failing to open the project is not.
 * The notice makes the loss visible instead of silent.
 */
export function migrateDetailingStore(raw: unknown): DetailingMigration {
  const notices: DetailingMigration['notices'] = [];

  if (raw === null || raw === undefined) {
    return { store: emptyDetailingStore(), notices };
  }
  if (typeof raw !== 'object') {
    return { store: emptyDetailingStore(), notices: [{ key: 'detailing.migration.corrupt' }] };
  }

  const src = raw as Partial<DetailingStore>;
  if (!Array.isArray(src.assemblies)) {
    return { store: emptyDetailingStore(), notices: [{ key: 'detailing.migration.corrupt' }] };
  }

  const assemblies: DetailingAssembly[] = [];
  let dropped = 0;
  for (const a of src.assemblies) {
    if (!a || typeof a !== 'object') { dropped++; continue; }
    const cand = a as Partial<DetailingAssembly>;
    if (typeof cand.id !== 'string' || !Array.isArray(cand.elementIds)) { dropped++; continue; }
    assemblies.push({
      id: cand.id,
      kind: cand.kind === 'columnStack' ? 'columnStack' : 'beamLine',
      label: typeof cand.label === 'string' ? cand.label : cand.id,
      elementIds: cand.elementIds.filter((x): x is number => typeof x === 'number'),
      bars: Array.isArray(cand.bars) ? cand.bars : [],
      marks: Array.isArray(cand.marks) ? cand.marks : [],
      joints: Array.isArray(cand.joints) ? cand.joints : [],
      conflicts: Array.isArray(cand.conflicts) ? cand.conflicts : [],
      unsupported: Array.isArray(cand.unsupported) ? cand.unsupported : [],
      detailingRevision: typeof cand.detailingRevision === 'number' ? cand.detailingRevision : 0,
      demandRevision: typeof cand.demandRevision === 'number' ? cand.demandRevision : -1,
      state: REVIEW_STATES.includes(cand.state as ReviewState) ? cand.state as ReviewState : 'DRAFT',
      review: cand.review,
      maturity: cand.maturity ?? 'UNSUPPORTED',
      provenance: cand.provenance ?? {
        edition: '2025', verifierId: 'unknown', trace: [], assumptions: [],
      },
      // Family records and certificates are carried through UNCHANGED when present and left
      // ABSENT when not. Nothing here fabricates one for a version-1 store: a synthesised
      // record would be evidence of a design that was never performed, and a synthesised
      // certificate would be a claim nobody made. A pre-record project regenerates its
      // families on the next run, which is the honest outcome.
      ...(Array.isArray(cand.families) ? { families: cand.families } : {}),
      ...(Array.isArray(cand.familyCertificates)
        ? { familyCertificates: cand.familyCertificates }
        : {}),
      /**
       * The two member-level statements, carried through for the same reason and by the same
       * rule — present or absent, never invented.
       *
       * They were missing from this list, and this function runs on EVERY restore: a `.ded`
       * open, an autosave restore, an undo, a tab switch. So a project that came back had
       * `bar.provisional = 'biaxial'` on its bars — `bars` is carried through whole — and no
       * `provisionalMembers` on the assembly that owns them. The bars stayed violet and the
       * assembly stopped saying "PROPUESTA PROVISIONAL — NO APTO PARA EMISIÓN CONSTRUCTIVA":
       * the workspace banner, the sheet note and the report section all read the member-level
       * field, and all three went quiet. The torsion warning went the same way.
       *
       * That is precisely the disagreement `run-detailing` records the field to prevent — "so
       * the report, the sheets, the schedule and the 3-D view cannot form four opinions about
       * which members they are" — reintroduced one layer down, where nothing was looking.
       *
       * Neither field is recomputed here. They are stamped at generation time from the design
       * outcomes, and the outcomes are not part of a snapshot; deriving them again from a
       * restored project would be inventing a verdict rather than remembering one.
       */
      ...(Array.isArray(cand.provisionalMembers)
        ? { provisionalMembers: cand.provisionalMembers }
        : {}),
      ...(Array.isArray(cand.torsionUnevaluatedMembers)
        ? { torsionUnevaluatedMembers: cand.torsionUnevaluatedMembers }
        : {}),
    });
  }

  if (dropped > 0) notices.push({ key: 'detailing.migration.dropped', params: { count: dropped } });
  if (typeof src.version === 'number' && src.version < DETAILING_SCHEMA_VERSION) {
    notices.push({
      key: 'detailing.migration.upgraded',
      params: { from: src.version, to: DETAILING_SCHEMA_VERSION },
    });
  }

  return { store: { version: DETAILING_SCHEMA_VERSION, assemblies }, notices };
}

/**
 * Invalidate only the assemblies touched by an element change.
 *
 * The whole reason `detailingRevision` is per-assembly. `changedElements` is typically
 * one member; every assembly that does NOT contain it keeps its revision, its review and
 * its CONSTRUCTIBLE status.
 */
export function invalidateAffected(
  store: DetailingStore, changedElements: Iterable<number>,
): { store: DetailingStore; invalidated: string[] } {
  const changed = new Set(changedElements);
  const invalidated: string[] = [];
  const assemblies = store.assemblies.map((a) => {
    if (!a.elementIds.some((id) => changed.has(id))) return a;
    invalidated.push(a.id);
    return {
      ...a,
      detailingRevision: a.detailingRevision + 1,
      // The earned state drops back; a human review record is KEPT but becomes stale,
      // so the drawing shows SUPERSEDED rather than losing the audit trail.
      state: reviewRank(a.state) > reviewRank('VERIFIED') ? 'VERIFIED' as ReviewState : a.state,
    };
  });
  return { store: { ...store, assemblies }, invalidated };
}

/** Bars the user pinned. Regeneration must treat these as hard constraints. */
export function lockedBars(a: DetailingAssembly): BarPath[] {
  return a.bars.filter((b) => b.locked);
}
