/**
 * The production path from verified design to coordinated detailing assemblies.
 *
 * ── The gap this closes ────────────────────────────────────────────
 *
 * PR17 shipped `generateBeamBars`, `generateColumnStack`, `coordinateJoint`,
 * `detectCollisions` and `coordinateFloor`, all unit-tested, and `detailingStore` with a
 * `setAssemblies` method. The forensic audit found that `setAssemblies` had ZERO callers
 * and `coordinateFloor` had none outside its own tests: the only thing that ever wrote
 * `model.detailing` was a Playwright hook. Every green test described machinery nothing
 * reached.
 *
 * This module is the missing adapter. It takes what the RC design run already produces —
 * member contexts and verified outcomes — and drives the real chain:
 *
 *   verified members
 *     → beam bar paths (curtailment, laps, bent-up policy, stirrup zones)
 *     → column stacks (transitions, splices, ties)
 *     → perpendicular joint coordination
 *     → collision detection and bounded repair
 *     → coordinateFloor
 *     → DetailingAssembly[]
 *
 * The store then persists it and the revision graph invalidates it. Nothing here touches
 * the solver, and nothing here is a hook.
 *
 * ── Honesty rules ──────────────────────────────────────────────────
 *
 * A member that is not VERIFIED never contributes bars. Detailing an unverified member
 * would produce a drawing of reinforcement that has not been shown to work, which is worse
 * than producing no drawing. Such members are reported as prerequisites, by id and count,
 * so the UI can say exactly what is missing rather than "run design first".
 *
 * Pure: no store, no runes. The store command supplies the data and consumes the result.
 */

import { shapedHoops, shapedPlanBars, shapedSpiral } from './shaped-ties';
import { columnStirrupClearanceInset } from './column-stirrup-clearance';
import { computeLocalAxes3D } from '../local-axes-3d';
import { memberReferenceLine, referenceLineNote, type MemberReferenceLine, type OffsetCarrier } from '../member-offsets';
import { clause, formatClause, type RegulationEdition } from '../../codes/regulation';
import { anchorageFunctions } from '../../codes/cirsoc201/anchorage';
import {
  standardHook, type BarPath, type Point3,
} from '../../codes/cirsoc201/bar-geometry';
import {
  bottomHookInboard, faceDevelopment, planSupportEnd, supportRowInto, supportRows, topLayout, topRowInboard, topRowsOf, type SupportCage, type SupportRow,
} from './support-anchorage';
import { jointBandOf, supportFacesAt as supportFacesOf, type BandBeam, type FaceColumn } from '../physical/support-faces';
import { beamCornerRecord, columnCageDia, crossingSeatsOf, endSupportPlan, isSimpleSupport, supportCageFrom } from '../design/end-support-anchorage';
import { developsAtFace } from '../../model/lateral-system';
import type { MemberContext } from '../design/member-context';
import { detailableReinforcement, isProvisionalOutcome, type MemberDesignOutcome } from '../design/outcome';
import {
  generateBeamBars, type BentUpPolicy, type SupportKind,
} from './generate-beam';
import {
  generateColumnStack, tieSpacing, type ColumnLift, type IncidentBeamAtJoint,
} from './generate-column';
import { candidateClears, generateLayoutCandidates, type KeepOut } from './candidates';
import { beamGroups, envelopeStations, hoggingAtSupports, resolveTopSteelFor } from './beam-groups';
import { beamLayoutDomain, beamRow, beamSeat as sharedBeamSeat, bendCrossing, columnBarsOf, columnTailPosts, crossingTailPosts, yieldsTo, type TailRow } from './joint-threading';
import {
  cageKeepOuts, generateColumnCandidates, type ColumnLayoutCandidate,
} from './column-candidates';
import {
  coordinate, type CoordinationResult, type JointConstraint, type MemberVariable,
} from './coordination-search';
import { DEFAULT_TOLERANCES, minSurfaceClearance } from './collision';
import { ColumnBarIndex } from './column-bar-index';
import { planSplice, transitionExists } from './splice';
import { classifyPair } from './classify';
import {
  torsionUnevaluatedMembers, type TorsionNotice,
} from './torsion-notice';
import { detectCollisions } from './collision';
import { assessConstructibility } from './constructibility';
import {
  assessDesignConvergence, undetailedScopeCount,
  type DesignConvergence, type ScopedMember,
} from './design-convergence';
import { DEFAULT_DESIGN_FAMILIES, type DesignFamily } from '../design/design-families';
import { noFloorFamilies } from './family-record';
import { envelopeIsComplete } from './coordination-search';
import { materialiseLaps, lapIndex, lapBetween, type PlannedTransition, type LapInterval } from './lap-materialize';
import type { LineBarPiece, LineLap, LineStirrupPiece } from './line-bars';
import type { EngineMessage } from '../../codes/message';
import {
  allocateLayers, depthAfterRaise,
  type LayerAllocation, type LineCrossing, type LineForLayering,
} from './joint-layers';
import { prescribedTolerances } from '../../codes/cirsoc201/placement';
import {
  barFace, checkColumnLapSection, checkIntegritySplice, checkLapPair, isPerimeterBeam, lineLapDevelopment,
  type LapMember, type PlanBeam, type SectionBar,
} from './splice-checks';
import { minClearSpacingColumn, minClearSpacingInLayer } from '../../codes/cirsoc201/spacing';
import {
  buildColumnTieSet, seatedLongitudinalHalfExtents, setSpread, stirrupStationCount, stirrupStations, StirrupClosureCache,
  unbracedBarReport,
} from '../../codes/cirsoc201/transverse-cage';
import { coordinateFloor, type FloorCoordinationResult, type JointInput, type MemberBars } from './coordinate-floor';
import { buildRepairEnvelope, type EnvelopeMember } from './repair-envelope';
import { evaluateState, reviewRank, type DetailingAssembly, type UnsupportedCondition } from './assembly';
import { collapseSpans, expandSpans, spansIn } from './span-detailing';
import { computeBeamCriticalSections } from '../station-design-forces';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import { deriveMaturity } from '../../codes/maturity';

// ─── Inputs ──────────────────────────────────────────────────────

export interface DetailingModelNode {
  id: number;
  x: number;
  y: number;
  z?: number;
}

export interface DetailingModelElement {
  id: number;
  nodeI: number;
  nodeJ: number;
  /**
   * The member's declared insertion (`Element.offset`) and the axes it is resolved on. The
   * analysis puts the member's axis at node + offset (`member-offsets.ts`), and the bars are laid
   * round that axis (`memberLine`). Absent, the model declares none and the axis is taken through
   * the nodes — said as an assumption in each member's trace.
   */
  offset?: OffsetCarrier['offset'];
  sectionId?: number;
  rollAngle?: number;
  localYx?: number; localYy?: number; localYz?: number;
}

export interface RunDetailingInput {
  contexts: ReadonlyMap<number, MemberContext>;
  /** Design outcomes keyed by element id. Only VERIFIED members are detailed. */
  outcomes: ReadonlyMap<number, MemberDesignOutcome>;
  nodes: ReadonlyMap<number, DetailingModelNode>;
  elements: ReadonlyMap<number, DetailingModelElement>;
  /** Section rotations, for a `local` insertion offset on a rotated section. Absent: none. */
  sections?: ReadonlyMap<number, { rotation?: number }>;
  edition: RegulationEdition;
  /** Who is accountable for the result. */
  verifierId: string;
  demandRevision: number;
  /**
   * The families the user asked this run to cover.
   *
   * Optional, defaulting to the frame pair — which is exactly what this function has always
   * detailed, so every existing caller keeps its behaviour. It is what `convergence` is measured
   * against, and therefore what the resulting assemblies may CLAIM: see `design-convergence.ts`.
   */
  scope?: readonly DesignFamily[];
  /**
   * Floor families the model holds. None of them is a `MemberContext`, so this function cannot
   * see them, and the scope qualifier on the claim would be empty without them.
   */
  presentFloorFamilies?: readonly DesignFamily[];
  /** Revision of the previous assemblies, so regeneration increments. */
  previousRevision?: number;
  maxAggregateSizeMm: number;
  /**
   * Project's additional bar-spacing margin above the regulatory minimum, m.
   *
   * Zero by default. CIRSOC's minimum IS the construction requirement; this is a project
   * decision and is never presented as a code one.
   */
  spacingMargin?: number;
  /**
   * Authoritative re-verification of one member at its FINAL geometry.
   *
   * Moving steel changes the effective depth, and a certificate issued against the
   * pre-coordination arrangement describes geometry that no longer exists. `depthLoss` is
   * how much lever arm the member lost: the joint-layer raise plus the unfavourable
   * §26.6.2.1 tolerance. The caller supplies the verifier so this module stays free of the
   * design layer; when it is absent NOTHING is reverified and the constructibility gate
   * says so rather than assuming a pass.
   */
  reverify?: (
    elementId: number,
    depthLoss: { bottomRaise: number; topLower: number; depthTolerance: number },
  ) => 'ok' | 'warn' | 'fail';
  /**
   * Whether a member fails its serviceability check (deflection, §24.2.2), as the verifier holds
   * it (`verificationStore.serviceabilityFails`). `reverify` is strength at the final geometry,
   * which is what the design–detailing loop repairs against; the constructibility gate's
   * `allMembersReverified` and `certificatesMatchGeometry` claim the member conforms, so they
   * read this as well. Absent, nothing fails it.
   */
  serviceabilityFails?: (elementId: number) => boolean;
  /**
   * Whether the member's floor joins its slab to a column at one node (`design/analysis-validity.ts`):
   * its steel was checked against forces whose split between beams and columns the model does not
   * establish, so it does not conform either, for the same two conditions. Absent, nothing is.
   */
  loadSplitNotEstablished?: (elementId: number) => boolean;
  /** Bars the user pinned; they survive regeneration untouched. */
  lockedBars?: BarPath[];
  /**
   * Project bent-up (cranked) bar policy.
   *
   * Passed through to the generator unchanged. Defaults to the most conservative reading:
   * seismic design unstated and no opt-out recorded, under which no bent-up bar is
   * generated. The app must not adopt a fabrication decision on the user's behalf.
   */
  bentUp?: BentUpPolicy;
  /** Cut points a person set in the frame editor, per beam, in its own sense (`generate-beam` `cuts`). */
  memberCuts?: ReadonlyMap<number, { bottomFrom?: number; bottomTo?: number; bottomShort?: number; topI?: number; topJ?: number }>;
  /**
   * A saved beam line's bars and stirrups per member, exactly as drawn (`line-bars.ts`). Given
   * for a member, they are laid as drawn and its cut points are not read.
   */
  linePieces?: ReadonlyMap<number, { bars: readonly LineBarPiece[]; stirrups: readonly LineStirrupPiece[] }>;
  /** The laps saved lines draw, each with the member that holds its middle (`lineLaps`). */
  lineLaps?: ReadonlyArray<{ owner: number; lap: LineLap }>;
  /** Lap length of column bars a person set, m, by column element id (`StoredDecisions.columnLaps`). */
  columnLaps?: ReadonlyMap<number, number>;
  /** Web openings by member, along it from its i node, m (`generate-beam` `webOpenings`). */
  webOpenings?: ReadonlyMap<number, ReadonlyArray<{ from: number; to: number }>>;
  /** Members whose bars belong to the lateral-force-resisting system. */
  lateralSystem?: ReadonlySet<number>;
  /**
   * Whether the code adapter that ran actually verifies torsion on beams.
   *
   * Supplied by the caller, which reads it off the adapter, so this module stays free of the
   * design layer — the same arrangement `reverify` uses and for the same reason.
   *
   * Absent means FALSE, deliberately. A run whose caller did not state a torsion capability is
   * a run in which nothing here can show that torsion was checked, and the safe reading of
   * silence about a verification is that it did not happen. The cost of the conservative
   * default is a warning on a member that was in fact checked; the cost of the other default is
   * a member with unverified torsion presented as complete.
   */
  checksTorsion?: boolean;
}

// ─── Prerequisites ───────────────────────────────────────────────

export type PrerequisiteKind =
  | 'noMembers'
  | 'unverifiedMembers'
  | 'noReinforcement'
  | 'noStations'
  | 'orientationSuspect';

export interface Prerequisite {
  kind: PrerequisiteKind;
  /** i18n key for the message. */
  key: string;
  /** Members responsible. Empty for `noMembers`. */
  elementIds: number[];
  count: number;
}

export interface DetailingReadiness {
  ready: boolean;
  /** Element ids that WILL be detailed. */
  detailable: number[];
  /** Exactly what is missing, with counts, so the UI never says "run design first". */
  prerequisites: Prerequisite[];
  /**
   * What the resulting detailing may be CALLED, measured against the whole model.
   *
   * `ready` and this answer two different questions and both are needed. `ready` gates the
   * command — may it run at all — and this gates the claim. Detailing a frame with refused
   * columns is an ordinary operation and stays enabled; calling the result construction
   * documentation is not, and `selectedScopeDetailed` is what refuses it.
   *
   * Measured against the SELECTED families, not the whole model: designing beams and columns on
   * a building that also has slabs is a complete piece of work, and a global denominator would
   * declare it permanently unconverged for slabs nobody asked to design. See
   * `design-convergence.ts`.
   *
   * Carried here rather than computed by each caller so the two cannot disagree about which
   * members are in the drawing: `detailable` decides, and this is measured against it.
   */
  convergence: DesignConvergence;
}

/**
 * Can detailing run, and if not, precisely why?
 *
 * Computed separately from the run so a disabled button can explain itself without doing
 * the work. The empty state this replaces said "coordinate a floor to see assemblies here",
 * which was an instruction the user had no control to follow.
 */
export function detailingReadiness(input: {
  contexts: ReadonlyMap<number, MemberContext>;
  outcomes: ReadonlyMap<number, MemberDesignOutcome>;
  /**
   * The families the user asked for. Defaults to the frame pair, which is what this function
   * has always detailed.
   *
   * Optional so the many callers that only want `ready` and `prerequisites` are unchanged —
   * neither of those reads it. `convergence` does, and a caller that cares about the claim
   * passes `designRunStore.familySelection`. A default of `DEFAULT_DESIGN_FAMILIES` rather than
   * "everything" is the conservative one here: it is the scope the frame pass actually covers.
   */
  scope?: readonly DesignFamily[];
  /**
   * Floor families the MODEL holds — slabs, walls, footings.
   *
   * None of them is a `MemberContext`, so this function cannot see them, and without them the
   * qualifier on the claim would be empty on exactly the building it exists for: a frame that
   * converged, sitting under slabs nobody designed. Supplied by the caller from the same
   * authority `DesignFamilyPanel` reads.
   */
  presentFloorFamilies?: readonly DesignFamily[];
}): DetailingReadiness {
  const prerequisites: Prerequisite[] = [];
  const detailable: number[] = [];
  const unverified: number[] = [];
  const noReinforcement: number[] = [];
  const noStations: number[] = [];
  const suspect: number[] = [];
  /**
   * Every member of the model, with the family it belongs to.
   *
   * Collected in the same loop and by the same rule as `detailable`, so the two cannot come to
   * disagree about the population. Convergence is the difference between these two lists
   * restricted to the scope, and lists built by different rules would measure the rules.
   *
   * The family comes from `elementType`, which for a frame context is `beam` or `column` — the
   * two family names those types carry. Walls are skipped above and slabs and footings never
   * reach this map; the floor pass owns them, and `assessDesignConvergence` reports whichever of
   * them the model has as out of scope through its own member list.
   */
  const members: ScopedMember[] = [];

  for (const [id, ctx] of input.contexts) {
    if (ctx.elementType === 'wall') continue;   // PR18 owns walls.
    members.push({ elementId: id, family: ctx.elementType });
    const outcome = input.outcomes.get(id);
    /**
     * A PROVISIONAL_BIAXIAL member is detailed, and is not thereby verified.
     *
     * The gate used to be `outcome === 'VERIFIED'`, which is why 117 of the 119 beams in the
     * flagship example had no bars in the document, no steel in the 3-D view and no rows on
     * any schedule: their design was refused at the biaxial capability gate, so nothing
     * downstream ever saw them. Bare orange concrete is not an honest report of "we designed
     * the axis we can and cannot check the other one" — it is indistinguishable from steel
     * that went missing.
     *
     * Detailing them changes nothing about what may be CLAIMED. They carry no certificate, so
     * `allMembersReverified` and `certificatesMatchGeometry` still fail and CONSTRUCTIBLE
     * remains unreachable; their bars are stamped `provisional` below; and every projection
     * gives them the PROVISIONAL state rather than MODELLED.
     */
    const offered = detailableReinforcement(outcome);
    if (!outcome || (outcome.outcome !== 'VERIFIED' && outcome.outcome !== 'PROVISIONAL_BIAXIAL')) {
      unverified.push(id); continue;
    }
    if (!offered) { noReinforcement.push(id); continue; }
    if (ctx.elementType === 'beam' && !ctx.stations) { noStations.push(id); continue; }
    if (ctx.orientationSuspect) { suspect.push(id); continue; }
    detailable.push(id);
  }

  const add = (kind: PrerequisiteKind, key: string, ids: number[]) => {
    if (ids.length === 0) return;
    prerequisites.push({ kind, key, elementIds: ids.sort((a, b) => a - b), count: ids.length });
  };

  if (input.contexts.size === 0) {
    prerequisites.push({
      kind: 'noMembers', key: 'detailing.prereq.noMembers', elementIds: [], count: 0,
    });
  }
  add('unverifiedMembers', 'detailing.prereq.unverified', unverified);
  add('noReinforcement', 'detailing.prereq.noReinforcement', noReinforcement);
  add('noStations', 'detailing.prereq.noStations', noStations);
  add('orientationSuspect', 'detailing.prereq.orientationSuspect', suspect);

  return {
    ready: detailable.length > 0,
    detailable: detailable.sort((a, b) => a - b),
    prerequisites,
    convergence: assessDesignConvergence({
      members,
      scope: input.scope ?? DEFAULT_DESIGN_FAMILIES,
      alsoPresent: input.presentFloorFamilies,
      detailedIds: detailable,
      outcomes: input.outcomes,
    }),
  };
}

// ─── Geometry helpers ────────────────────────────────────────────

const Z = (n: DetailingModelNode) => n.z ?? 0;

function unit(a: Point3, b: Point3): Point3 {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const L = Math.hypot(d.x, d.y, d.z) || 1;
  return { x: d.x / L, y: d.y / L, z: d.z / L };
}

function nodePoint(n: DetailingModelNode): Point3 {
  return { x: n.x, y: n.y, z: Z(n) };
}

/** The lift whose elevation range contains a bar's start, for un-owned splice bars. */
function nearestLiftTo(bar: BarPath, lifts: readonly ColumnLift[]): number {
  const z = bar.segments[0]?.start.z ?? 0;
  let best = lifts[0];
  let bestGap = Infinity;
  for (const l of lifts) {
    const gap = z < l.baseZ ? l.baseZ - z : z > l.topZ ? z - l.topZ : 0;
    if (gap < bestGap) { bestGap = gap; best = l; }
  }
  return best.elementId;
}

/** True for a member close enough to vertical to be a column lift. */
function isColumnLike(i: DetailingModelNode, j: DetailingModelNode): boolean {
  const dz = Math.abs(Z(j) - Z(i));
  const L = Math.hypot(j.x - i.x, j.y - i.y, dz) || 1;
  return dz / L > 0.7;
}

/** How many frame members meet at a node — 1 means a simple support, more is continuity. */
function supportKindAt(
  nodeId: number, self: number, elements: ReadonlyMap<number, DetailingModelElement>,
): SupportKind {
  let others = 0;
  for (const el of elements.values()) {
    if (el.id === self) continue;
    if (el.nodeI === nodeId || el.nodeJ === nodeId) others++;
  }
  if (others === 0) return 'free';
  return others >= 2 ? 'continuous' : 'simple';
}

/** A designed column's bars (`joint-threading.ts`): one reading for the design and the detailing. */
const columnBars = (accepted: NonNullable<MemberDesignOutcome['accepted']>) => columnBarsOf(accepted as never);

// ─── The run ─────────────────────────────────────────────────────

export interface RunDetailingResult {
  assemblies: DetailingAssembly[];
  readiness: DetailingReadiness;
  /** Per-assembly coordination detail, for the inspection panels. */
  coordination: FloorCoordinationResult[];
  /** Members skipped, with the reason, so nothing disappears silently. */
  skipped: Array<{ elementId: number; key: string }>;
  /**
   * Members whose bars are a PROPOSAL rather than certified reinforcement, ascending.
   *
   * Reported on the run — not only stamped on the bars — so a panel can say "8 of 119 beams
   * carry a provisional proposal" without walking every bar of every assembly, and so a
   * caller that never looks at a bar still cannot miss the fact.
   */
  provisionalMembers: number[];
  /**
   * Members carrying torsion this application does not evaluate, with the numbers.
   *
   * Reported on the run for the same reason `provisionalMembers` is: a caller that never looks
   * at a bar must not be able to miss it. It changes no outcome and no state — see
   * `torsion-notice.ts`.
   */
  torsionUnevaluated: TorsionNotice[];
  /**
   * The global layout search: outcome, statistics and infeasible joints.
   *
   * Reported rather than folded into a pass/fail, because "no assignment exists"
   * (DETAILING_INADEQUATE) and "we ran out of budget" (SEARCH_EXHAUSTED) demand different
   * responses from the engineer and must never be conflated.
   */
  layoutSearch: CoordinationResult;
  /**
   * What the splice schedules actually BUILT.
   *
   * Separate from `layoutSearch` on purpose. The search reports whether a legal assignment
   * exists; this reports whether the steel was placed. A run with an ASSIGNMENT_FOUND outcome
   * and zero laps and zero fusions has coordinated nothing, and that combination has to be
   * visible rather than inferable.
   */
  /**
   * The crossing graph and the layer allocation it produced. Present once beams have been
   * coordinated; the inspection surfaces and the conflict diagnosis both read it.
   */
  layering?: {
    lineOfMember: Map<number, string>;
    crossings: LineCrossing[];
    lineMax: Map<string, number>;
    relations: Array<{ a: number; b: number; jointId: string; relation: string;
      lineA?: string; lineB?: string }>;
    byLine: Map<string, { rank: number; bottomRaise: number; topLower: number }>;
    unresolved: Array<{ jointId: string; a: string; b: string }>;
    ranks: number;
  };
  lapping: {
    /** Physical laps built, each with its interval, class and clause provenance. */
    laps: LapInterval[];
    /** Pairs that were the same bar all along and are now one BarPath. */
    fused: number;
    /** Transitions the search closed but the geometry could not build, with the reason. */
    unmaterialised: Array<{ jointId: string; reason: EngineMessage }>;
  };
  /**
   * What the authoritative re-verification actually saw, per applicable member.
   *
   * These records were computed and then collapsed into two counters inside the
   * constructibility assessment. That was enough to fail the gate and not enough to do
   * anything about it: a design-side repair needs to know WHICH member failed and at
   * exactly what geometry, and neither survived. They are reported now.
   *
   * One entry per applicable member, always — `noVerifier` and `noBars` are recorded
   * rather than omitted, because a missing entry reads as a pass.
   */
  reverification: FinalGeometryRecord[];
}

/** Status of one member's re-verification at its final geometry. */
export type ReverificationStatus = 'ok' | 'warn' | 'fail' | 'noBars' | 'noVerifier';

/** The geometry a member's steel actually ended up at, and what the verifier made of it. */
export interface FinalGeometryRecord {
  elementId: number;
  status: ReverificationStatus;
  /**
   * Lever arm the member lost, in metres.
   *
   * `bottomRaise` / `topLower` are the joint-layer allocation's movement of each face.
   * `depthTolerance` is Table 26.6.2.1(a)'s unfavourable tolerance on d, which applies
   * whether or not anything moved.
   */
  finalGeometry: { bottomRaise: number; topLower: number; depthTolerance: number };
  /**
   * Measured elevation of each distinct bar layer of this member, metres, MODEL DATUM,
   * descending. Taken from the finished BarPaths rather than recomputed, so it is the
   * geometry that exists rather than the geometry that was intended.
   */
  layerCentroids: number[];
}

/** Plan distance from a node to a segment, m: does a bar reach the support at the node. */
function distanceToSegmentPlan(n: { x: number; y: number }, a: Point3, b: Point3): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((n.x - a.x) * dx + (n.y - a.y) * dy) / L2));
  return Math.hypot(a.x + t * dx - n.x, a.y + t * dy - n.y);
}

/** A member's part in a lap (`splice-checks.ts`): depth, concrete, steel, cover and stirrup. */
const lapMemberOf = (c: MemberContext): LapMember => ({
  h: c.section.h, fc: c.material.fc, fy: c.material.fy, cover: c.material.cover, stirrupDiaMm: c.material.stirrupDia,
});

/**
 * Generate and coordinate detailing for every verified member, grouped into one assembly
 * per storey level.
 *
 * Grouping by level is what "coordinate the floor" means physically: bars clash with the
 * bars they share a pour with, and a column stack spans levels but is coordinated at each
 * joint it passes through.
 *
 * A beam the analysis cut into pieces is detailed once, as its span, and its pieces are given
 * back afterwards (`span-detailing.ts`); the readiness is the pieces' own.
 */
export function runDetailing(input: RunDetailingInput): RunDetailingResult {
  const spans = spansIn(input.contexts);
  if (spans.spans.size === 0) return detailMembers(input);
  return expandSpans(detailMembers(collapseSpans(input, spans)), input, spans, detailingReadiness(input));
}

/**
 * Every beam's context with the stirrup diameter its design verified.
 *
 * `material.stirrupDia` is the project's default and is what the whole beam pipeline seats bars
 * against: the coordination's corner seats, the free width, the top-steel resolver, the
 * generator's cage. The design chooses its own stirrups (Ø6 c/12,5 on the span fixture's beams),
 * and a cage laid at the default (Ø8) is not the one verified; seating the bars for Ø8 inside Ø6
 * stirrups also leaves the bends without their bars (§25.7.1.2). So the detailing reads the
 * designed diameter wherever it reads the stirrup's.
 */
function withDesignedStirrups(input: RunDetailingInput): RunDetailingInput {
  let contexts: Map<number, MemberContext> | null = null;
  for (const [id, ctx] of input.contexts) {
    if (ctx.elementType !== 'beam') continue;
    const r = detailableReinforcement(input.outcomes.get(id))?.rebar;
    const d = Math.max(r?.regions?.stirrupsSupport?.diameter ?? 0, r?.regions?.stirrupsSpan?.diameter ?? 0, r?.stirrups?.diameter ?? 0);
    if (!(d > 0) || d === ctx.material.stirrupDia) continue;
    contexts ??= new Map(input.contexts);
    contexts.set(id, { ...ctx, material: { ...ctx.material, stirrupDia: d } });
  }
  return contexts ? { ...input, contexts } : input;
}

function detailMembers(raw: RunDetailingInput): RunDetailingResult {
  const input = withDesignedStirrups(raw);
  const closureCache = new StirrupClosureCache();
  const readiness = detailingReadiness(input);
  const skipped: Array<{ elementId: number; key: string }> = [];
  if (!readiness.ready) {
    return {
      assemblies: [], readiness, coordination: [], skipped, provisionalMembers: [],
      torsionUnevaluated: [],
      lapping: { laps: [], fused: 0, unmaterialised: [] },
      reverification: [],
      layoutSearch: {
        outcome: 'ASSIGNMENT_FOUND', envelope: 'beamsAndColumns',
        evidence: {
          completeBeamEnvelope: true, completeColumnEnvelope: true,
          allJointArrangementsIncluded: true, noUnsupportedRule: true,
          exhaustive: true, limitingConstraints: [], recommendations: [],
        },
        assignment: new Map(), infeasibleJoints: [],
        emptiedDomains: [],
        stats: {
          candidatesGenerated: 0, domainsRemovedByPropagation: 0, dpStates: 0,
          dpTransitions: 0, branchNodes: 0, compatibilityChecks: 0,
          compatibilityCacheHits: 0, truncated: false,
        },
      },
    };
  }

  const detailable = new Set(readiness.detailable);
  const beams: number[] = [];
  const columns: number[] = [];
  for (const id of detailable) {
    const ctx = input.contexts.get(id)!;
    (ctx.elementType === 'column' ? columns : beams).push(id);
  }

  /**
   * A member's reference line: its nodes plus its declared insertion offset, as the analysis
   * took it (`memberReferenceLine`). Every position this pass derives from a member — a beam's
   * bar elevations, a column's cage centre, the joint band the beams make, the faces a beam's
   * bars end against — is read off this, not off the nodes: a top-flush beam's axis sits half its
   * depth under the node, and bars laid round the node were half a depth above the concrete the
   * forces were computed on. Where the model declares nothing the line runs through the nodes,
   * and the member's trace says that this was assumed (`referenceLineNote`).
   */
  const lineCache = new Map<number, MemberReferenceLine | null>();
  const memberLine = (id: number): MemberReferenceLine | null => {
    if (lineCache.has(id)) return lineCache.get(id)!;
    const el = input.elements.get(id);
    const a = el && input.nodes.get(el.nodeI), b = el && input.nodes.get(el.nodeJ);
    const line = el && a && b ? memberReferenceLine(el, a, b, input.sections) : null;
    lineCache.set(id, line);
    return line;
  };
  /** Node to axis of a member at one of its nodes, m (zero where it declares no insertion). */
  const axisOffsetAt = (id: number, nodeId: number): Point3 => {
    const el = input.elements.get(id), line = memberLine(id);
    if (!el || !line) return { x: 0, y: 0, z: 0 };
    return nodeId === el.nodeI ? line.offsetI : line.offsetJ;
  };
  /**
   * Keep-outs measured across beam `id` from the NODE line (`(p − node)·t`), re-measured from
   * the beam's axis at that node, which is what its slots are measured from. The identity where
   * the beam declares no insertion across its plan.
   */
  const onAxis = (id: number, nodeId: number, t: { x: number; y: number }, keeps: KeepOut[]): KeepOut[] => {
    const o = axisOffsetAt(id, nodeId);
    const shift = o.x * t.x + o.y * t.y;
    return Math.abs(shift) < 1e-12 ? keeps : keeps.map((k) => ({ ...k, at: k.at - shift }));
  };
  /** The inverse: slot positions across beam `id`, from its axis, re-measured from the node line. */
  const nodeLine = (id: number, nodeId: number, t: { x: number; y: number }, across: number[]): number[] => {
    const o = axisOffsetAt(id, nodeId);
    const shift = o.x * t.x + o.y * t.y;
    return Math.abs(shift) < 1e-12 ? across : across.map((a) => a + shift);
  };

  // ── Column stacks: columns sharing a plan position, ordered bottom to top ──
  const stacks = new Map<string, ColumnLift[]>();
  for (const id of columns) {
    const ctx = input.contexts.get(id)!;
    const el = input.elements.get(id);
    const accepted = detailableReinforcement(input.outcomes.get(id))?.rebar;
    const bars = accepted ? columnBars(accepted) : null;
    if (!el || !bars) { skipped.push({ elementId: id, key: 'detailing.skip.noColumnBars' }); continue; }
    const nI = input.nodes.get(el.nodeI);
    const nJ = input.nodes.get(el.nodeJ);
    if (!nI || !nJ || !isColumnLike(nI, nJ)) {
      skipped.push({ elementId: id, key: 'detailing.skip.notVertical' });
      continue;
    }
    const [lo, hi] = Z(nI) <= Z(nJ) ? [nI, nJ] : [nJ, nI];
    // Plan position to the millimetre: a column that shifts less than that is the same stack.
    // The stack is the NODE line, the column line the joints are made on; a lift whose
    // insertion moves its axis off it is the same stack with an offset (§10.7.4), not another.
    const key = `${Math.round(lo.x * 1000)}:${Math.round(lo.y * 1000)}`;
    const list = stacks.get(key) ?? [];
    // The cage stands on the column's axis: the node plus its declared insertion (a column
    // placed by a face or a corner has its axis half a side off the node). Its elevations stay
    // the nodes': the floors the joints are made at.
    const off = axisOffsetAt(id, lo.id);
    list.push({
      elementId: id, baseZ: Z(lo), topZ: Z(hi),
      b: ctx.section.b, h: ctx.section.h,
      centre: { x: lo.x + off.x, y: lo.y + off.y },
      nodePlan: { x: lo.x, y: lo.y },
      // A shaped column draws the ties its design chose; a rectangular one keeps the project's
      // stirrup, which its joint cages and the threading search are coordinated against.
      ...(accepted?.tieZones ? { endZone: { length: accepted.tieZones.endLength, spacing: accepted.tieZones.endSpacing } } : {}),
      bars, tieDia: ctx.shape ? (accepted?.stirrups?.diameter ?? accepted?.shaped?.spiral?.diameter ?? ctx.material.stirrupDia) : ctx.material.stirrupDia, cover: ctx.material.cover,
    });
    stacks.set(key, list);
  }
  /** Laps a saved line draws inside a member, as each member's generator laid them. */
  const drawnLaps: Array<{ elementId: number; fromBarId: string; toBarId: string; from: Point3; to: Point3; offset: number }> = [];

  const memberBarsById = new Map<number, MemberBars>();
  /** A column's horizontal local axes, which carry its section's x and y into plan. */
  const columnFrame = (id: number) => {
    const el = input.elements.get(id)!, a = input.nodes.get(el.nodeI)!, b = input.nodes.get(el.nodeJ)!;
    const ax = computeLocalAxes3D({ id: a.id, x: a.x, y: a.y, z: Z(a) }, { id: b.id, x: b.x, y: b.y, z: Z(b) }, undefined, (el as { rollAngle?: number }).rollAngle);
    return { ey: ax.ey, ez: ax.ez };
  };

  /**
   * Lap lookup for the classifier, installed once `materialiseLaps` has run.
   *
   * Undefined before materialisation, deliberately: a splice schedule that has not been
   * built is a claim about what could be done, and treating it as a lap would excuse
   * clashes between bars that are still two separate, unconnected pieces of steel.
   */
  let lapLookup: ((aId: string, bId: string) => 'contact' | 'nonContact' | undefined)
    | undefined;

  /** Joint-layer allocation, filled in by `coordinateBeamLayouts`. */
  let layerAllocation: LayerAllocation | undefined;
  /**
   * What the layer allocator saw, kept for diagnosis.
   *
   * Two failure modes are indistinguishable from the outcome alone: a crossing the graph
   * never received, and a crossing it received and could not colour. Reporting the graph
   * itself is what separates them.
   */
  let layerDiagnostics: {
    lineOfMember: Map<number, string>;
    crossings: LineCrossing[];
    lineMax: Map<string, number>;
    relations: Array<{ a: number; b: number; jointId: string; relation: string;
      lineA?: string; lineB?: string }>;
  } | undefined;
  /** Vertical raise per member, m, from that allocation. Zero for rank 0. */
  const layerRaiseOf = new Map<number, number>();
  /** Drop per member for the TOP face, m. Sized separately from the bottom. */
  const layerDropOf = new Map<number, number>();

  /**
   * Conditions the run could not represent, as structured messages.
   *
   * Reaches the constructibility gate's `unsupportedRules`, so an unrepresentable condition
   * withholds the claim instead of being absent from it.
   */
  const unsupportedRun: Array<{ key: string; params: Record<string, unknown> }> = [];

  /**
   * The open §25.5 conditions of the column stacks' laps (`splice-checks.ts`), scoped to the
   * upper lift, where the lap stands. Filed with that lift's assembly once it is built: the two
   * lifts of a lap are in different storeys' assemblies, so no collision check sees the pair.
   */
  const columnLapOpen: UnsupportedCondition[] = [];
  /** The project binds seismic design, so INPRES-CIRSOC 103-II's lap locations apply. */
  const lapContext = { edition: input.edition, seismic: input.bentUp?.seismicDesign === 'required' };
  /**
   * One open condition per clause, joint and member, counting the pairs it holds and carrying
   * the worst pair's numbers: a column floor of 8 coincident pairs is one condition with
   * `pairs: 8`, not eight.
   */
  const collapseLapConditions = (list: readonly UnsupportedCondition[]): UnsupportedCondition[] => {
    const worse = (c: UnsupportedCondition) => {
      const p = c.params ?? {};
      const k = c.key.split('.').pop();
      return k === 'short' ? -Number(p.overlap) : k === 'pitch' ? Number(p.offset)
        : k === 'spacing' ? -Number(p.clear) : k === 'unarranged' ? -Number(p.offset) : 0;
    };
    const by = new Map<string, UnsupportedCondition>();
    for (const c of list) {
      const k = `${c.key}|${c.params?.joint ?? ''}|${(c.scope.elementIds ?? []).join(',')}`;
      const seen = by.get(k);
      if (!seen) { by.set(k, { ...c, params: { ...c.params, pairs: 1 } }); continue; }
      const pairs = Number(seen.params?.pairs ?? 1) + 1;
      by.set(k, worse(c) > worse(seen) ? { ...c, params: { ...c.params, pairs } } : { ...seen, params: { ...seen.params, pairs } });
    }
    return [...by.values()];
  };

  /**
   * Does a column's top lift need tension development at the roof?
   *
   * §25.4.1.2 forbids anchoring a compression bar with a hook, so this decides whether one
   * may be used at all.
   *
   * Tension arises two ways and both are checked. A combination may put the whole section
   * in net tension — the demand set names that case explicitly. Or the axial force may be
   * compressive while the moment is large enough to open tension on one face: the
   * uncracked-section extreme fibre, σ = N/A − M·c/I, going negative. The second is the
   * common case in a frame column and is invisible if only the axial category is read.
   */
  function topLiftNeedsTension(lifts: readonly ColumnLift[]): boolean {
    const top = lifts[lifts.length - 1];
    if (!top) return false;
    const ctx = input.contexts.get(top.elementId);
    const demands = (ctx as { demands?: { demands?: Array<{
      category: string; absValue: number; forces?: { n?: number; my?: number; mz?: number };
    }> } } | undefined)?.demands?.demands;
    if (!demands || demands.length === 0) {
      // No demand data is not evidence of compression. Anchor for tension, which is the
      // safe direction when the question cannot be answered.
      return true;
    }
    if (demands.some((d) => d.category === 'N_tension' && d.absValue > 1e-6)) return true;

    const b = top.b;
    const h = top.h;
    const area = b * h;
    if (area <= 0) return true;
    for (const d of demands) {
      const f = d.forces;
      if (!f) continue;
      // Compression is negative in the solver's convention, so N/A is negative for a
      // compressed column and the moment term has to overcome it.
      const n = f.n ?? 0;
      const my = Math.abs(f.my ?? 0);
      const mz = Math.abs(f.mz ?? 0);
      const sigma = n / area
        - mz / (b * h * h / 6)
        - my / (h * b * b / 6);
      if (sigma > 1e-6) return true;
    }
    return false;
  }

  /** The project's additional bar-spacing margin, m. Zero unless the project stated one. */
  const spacingMargin = Math.max(0, input.spacingMargin ?? 0);

  /** The same classification the authoritative pass uses, for the robustness re-check. */
  const classifyForRun = (
    a: BarPath, b: BarPath, surface: number, ta?: Point3, tb?: Point3,
  ) => classifyPair(a, b, {
    edition: input.edition,
    maxAggregateSizeMm: input.maxAggregateSizeMm,
    memberKindOf: (id) => input.contexts.get(id)?.elementType,
    layerOf: layerOfBar,
    isLapPair: (x, y) => lapLookup?.(x, y),
  }, surface, ta, tb);
  /** Layer index per bar, reported by the generators, for the §25.2.2 classification. */
  const barLayers = new Map<string, number>();
  /**
   * A bar's layer, the generator's. A bar the line fused through a joint (`a+b`,
   * `lap-materialize.ts`) is the first bar's: it lies in that bar's layer. It used to have none,
   * and two layers of one member 25 mm apart (§25.2.2) were held to the in-layer 26,7 mm.
   */
  function layerOfBar(barId: string): number | undefined {
    return barLayers.get(barId) ?? barLayers.get(barId.split('+')[0]!);
  }

  /**
   * One reading of each beam's support hogging, shared by every site that resolves its groups.
   *
   * Memoised rather than recomputed at the four call sites: `beamGroups` is asked the same
   * question by the cage scorer, the layout coordinator, the generator and the joint builder,
   * and four independent envelope walks are four chances to disagree about whether a support
   * hogs — which is exactly the question that decides whether its top bars are hangers.
   */
  const hoggingCache = new Map<number, { start: number; end: number }>();
  const hoggingOf = (id: number): { start: number; end: number } => {
    let h = hoggingCache.get(id);
    if (!h) {
      const ctx = input.contexts.get(id);
      h = ctx ? hoggingAtSupports(ctx) : { start: 0, end: 0 };
      hoggingCache.set(id, h);
    }
    return h;
  };
  /** `beamGroups` options for a member, or undefined when it has no context. */
  const groupOptsFor = (id: number) => {
    const ctx = input.contexts.get(id);
    return ctx
      ? {
        ctx, edition: input.edition,
        maxAggregateSizeMm: input.maxAggregateSizeMm,
        hogging: hoggingOf(id),
      }
      : undefined;
  };
  // ── Where each beam's bars end in its supports (`support-anchorage.ts`) ──
  //
  // The plan the design verified each end against, built here from the same inputs the design
  // adapter reads: the column's face (half its smaller side), whether the line continues, the
  // project's cover and tie diameter, the default cage, and the design's own bars in its own
  // rows (`supportRows`). The generator lays the bars by it, and the coordination keeps the
  // crossing beams' bars off the hooks it places.

  /**
   * The widest column at a node, and where its faces stand along beam `id`, m from the beam's
   * axis end: half its smaller side either way of the column's axis (`columnFacesAlong`), the
   * axis being the node plus the column's declared insertion, read against the beam's own. A
   * column centred on the node gives `face` = half its smaller side and no `far`, as always.
   */
  function supportFacesAt(nodeId: number, id: number): { face: number; far?: number } {
    const at: FaceColumn[] = [];
    for (const cid of columns) {
      const cEl = input.elements.get(cid);
      if (!cEl || (cEl.nodeI !== nodeId && cEl.nodeJ !== nodeId)) continue;
      const cCtx = input.contexts.get(cid);
      if (!cCtx) continue;
      at.push({ b: cCtx.section.b, h: cCtx.section.h, offset: axisOffsetAt(cid, nodeId) });
    }
    const el = input.elements.get(id), line = memberLine(id);
    if (!el || !line) return { face: at.reduce((m, c) => Math.max(m, Math.min(c.b, c.h) / 2), 0) };
    const u = unit(line.i, line.j);
    const w = nodeId === el.nodeI ? u : { x: -u.x, y: -u.y, z: -u.z };
    return supportFacesOf(at, axisOffsetAt(id, nodeId), w);
  }
  /** Node to the near face of the widest column at a node, along beam `id`, m. */
  function supportFaceAt(nodeId: number, id: number): number {
    return supportFacesAt(nodeId, id).face;
  }

  /**
   * Whether the line continues past `nodeId`: another detailed beam frames in there along the
   * same axis (the coordination's `collinear` test, |cos| > 0,7). Its bars end in the line's
   * laps; elsewhere they end, anchored, in the column.
   */
  function lineContinuesAt(id: number, nodeId: number): boolean {
    const el = input.elements.get(id);
    const a = el && input.nodes.get(el.nodeI), b = el && input.nodes.get(el.nodeJ);
    if (!el || !a || !b) return false;
    const u = unit(nodePoint(a), nodePoint(b));
    return beams.some((other) => {
      if (other === id) return false;
      const o = input.elements.get(other);
      if (!o || (o.nodeI !== nodeId && o.nodeJ !== nodeId)) return false;
      const p = input.nodes.get(o.nodeI), q = input.nodes.get(o.nodeJ);
      if (!p || !q) return false;
      const v = unit(nodePoint(p), nodePoint(q));
      return Math.abs(u.x * v.x + u.y * v.y + u.z * v.z) > 0.7;
    });
  }

  /**
   * The beams crossing `id` at a node: every beam framing in there off its axis, detailed or not.
   * One without a design is read at every seat it could take (`crossingSeatsOf`), as the design
   * read it: a beam is a beam of the joint whether or not its bars are designed yet.
   */
  function crossingBeamsAt(id: number, nodeId: number): number[] {
    const el = input.elements.get(id);
    const a = el && input.nodes.get(el.nodeI), b = el && input.nodes.get(el.nodeJ);
    if (!el || !a || !b) return [];
    const u = unit(nodePoint(a), nodePoint(b));
    const allBeams = [...raw.contexts.values()].filter((c) => c.elementType === 'beam').map((c) => c.elementId);
    return allBeams.filter((other) => {
      if (other === id) return false;
      const o = input.elements.get(other);
      if (!o || (o.nodeI !== nodeId && o.nodeJ !== nodeId)) return false;
      const p = input.nodes.get(o.nodeI), q = input.nodes.get(o.nodeJ);
      if (!p || !q) return false;
      const v = unit(nodePoint(p), nodePoint(q));
      return Math.abs(u.x * v.x + u.y * v.y + u.z * v.z) <= 0.7;
    });
  }

  /**
   * Whether a member's positive steel develops fy at the face (§9.7.3.8.2), as the detailing was
   * told or the design read it: declared part of the lateral system, or not declared
   * (`developsAtFace`, the verifier's own reading in `supportInputOf`).
   */
  function lateralOf(id: number): boolean {
    return (input.lateralSystem?.has(id) ?? false) || developsAtFace(raw.contexts.get(id)?.lateral);
  }

  /** A beam's two supports, its design rows at each and the plan of every bar end there. */
  function supportPlanOf(id: number) {
    const el = input.elements.get(id);
    // The design's own context (`raw`): the stirrup diameter the design verified ld with, not the
    // one `withDesignedStirrups` seats the cage on.
    const ctx = raw.contexts.get(id);
    const rebar = detailableReinforcement(input.outcomes.get(id))?.rebar;
    if (!el || !ctx || !rebar) return null;
    const cageAt = (nodeId: number): SupportCage => {
      // The columns' designed cages, as the design read them (`MemberContext.columnCages`); the
      // default where a column at the node has none.
      // Every column at the node, designed or not: one without a design leaves the default.
      const dias = [...raw.contexts.values()].filter((c) => c.elementType === 'column').map((c) => c.elementId)
        .filter((cid) => { const c = input.elements.get(cid); return !!c && (c.nodeI === nodeId || c.nodeJ === nodeId); })
        .map((cid) => columnCageDia(detailableReinforcement(input.outcomes.get(cid))?.rebar));
      // The crossing beams' corner seats at the joint, from their designs (`crossingSeatsOf`).
      const crossing = crossingBeamsAt(id, nodeId).flatMap((other) => {
        const oc = raw.contexts.get(other);
        if (!oc) return [];
        const rec = beamCornerRecord(detailableReinforcement(input.outcomes.get(other))?.rebar, oc.material.stirrupDia);
        // A crossing beam that ends here hooks its top bars down here too, as the design reads
        // it (`beamSupportCage`): their tails are parallel to this beam's.
        // Where both end here, the one that gives way clears the other's corner by the parallel
        // clear (`yieldsTo`), as the design reads it.
        const oe = input.elements.get(other)!;
        const dirOf = (e: DetailingModelElement) => { const p = input.nodes.get(e.nodeI)!, q = input.nodes.get(e.nodeJ)!; return { x: q.x - p.x, y: q.y - p.y }; };
        const hooks = lineContinuesAt(other, nodeId) || lineContinuesAt(id, nodeId) || !yieldsTo(dirOf(el), dirOf(oe)) ? undefined
          : { clear: minClearSpacingInLayer(input.edition, { barDiameterMm: 0, maxAggregateSizeMm: input.maxAggregateSizeMm }).minClear };
        return crossingSeatsOf(other, { b: oc.section.b, h: oc.section.h }, {
          cover: ctx.material.cover, tieDiaMm: ctx.material.stirrupDia,
          ...(ctx.material.longDiametersMm ? { admissibleDiametersMm: ctx.material.longDiametersMm } : {}),
          ...(rec ? { beamCorners: new Map([[other, rec]]) } : {}),
        }, hooks);
      });
      return supportCageFrom({
        ...supportFacesAt(nodeId, id), continues: lineContinuesAt(id, nodeId), cover: ctx.material.cover, tieDiaMm: ctx.material.stirrupDia,
        designedBarDiaMm: dias.length && dias.every((d) => d > 0) ? Math.max(...dias) : 0,
        ...(ctx.material.longDiametersMm ? { admissibleDiametersMm: ctx.material.longDiametersMm } : {}),
        crossing,
      });
    };
    const cages = { I: cageAt(el.nodeI), J: cageAt(el.nodeJ) };
    const simple = isSimpleSupport(cages.I) || isSimpleSupport(cages.J);
    const groupsB = rebar.regions?.bottomGroups ?? [];
    // The seat the cage is laid on: `input` carries the design's stirrups (`withDesignedStirrups`).
    const seatCtx = input.contexts.get(id) ?? ctx;
    const lateral = lateralOf(id);
    const section = { b: ctx.section.b, h: ctx.section.h, cover: ctx.material.cover, stirrupDia: ctx.material.stirrupDia, fc: ctx.material.fc, fy: ctx.material.fy };
    // The top layers the coordination may lay, decided as the design decided them
    // (`endSupportPlan`): the extra layer only where every bar anchors in it.
    const seat = { stirrupDiaMm: seatCtx.material.stirrupDia, maxAggregateSizeMm: input.maxAggregateSizeMm };
    const { maxTopLayers } = endSupportPlan({ rebar, section, cages: { start: cages.I, end: cages.J }, edition: input.edition, lateralSystem: lateral, seat });
    const { slots } = topLayout(rebar, { b: section.b, cover: section.cover, stirrupDiaMm: seat.stirrupDiaMm, edition: input.edition, maxAggregateSizeMm: seat.maxAggregateSizeMm });
    const rows = {
      I: supportRows(rebar, 'start', { simple, slots, layers: maxTopLayers, lateralSystem: lateral, bottomHookRequested: groupsB.some((g) => g.anchorageStart === 'hook'), pitch: { edition: input.edition, maxAggregateSizeMm: seat.maxAggregateSizeMm } }),
      J: supportRows(rebar, 'end', { simple, slots, layers: maxTopLayers, lateralSystem: lateral, bottomHookRequested: groupsB.some((g) => g.anchorageEnd === 'hook'), pitch: { edition: input.edition, maxAggregateSizeMm: seat.maxAggregateSizeMm } }),
    };
    // Nested tails stand side by side: §25.2.1's clear (`end-support-anchorage` `verdictsIn`).
    const nestClear = (d: number) => minClearSpacingInLayer(input.edition, { barDiameterMm: d, maxAggregateSizeMm: input.maxAggregateSizeMm }).minClear;
    const topRowsAt = (side: 'I' | 'J') => topRowsOf(rows[side]);
    const plan = (side: 'I' | 'J', bar: { position: 'top' | 'bottom'; diameterMm: number; need: 'develop' | 'embed' | 'none'; hook: 'allowed' | 'requested'; inboard: number; rowStep?: number; endsHere?: boolean }) => {
      const dev = faceDevelopment(rebar, section, bar.position === 'bottom' ? 'bottom' : side === 'I' ? 'topStart' : 'topEnd', bar.diameterMm, input.edition);
      const outerAcross = seatedLongitudinalHalfExtents(section.b, section.h, section.cover, seat.stirrupDiaMm, bar.diameterMm).corner.halfAcross;
      // A bar drawn to end at this support ends here, anchored in the column, whether or not the
      // line continues past it: no lap of the line takes it (`lineBars`).
      const cage = bar.endsHere ? { ...cages[side], continues: false } : cages[side];
      return planSupportEnd(cage, { ...bar, outerAcross, ld: dev.ld, ldh: dev.ldh, ldc: dev.ldc, stress: 'tension' });
    };

    /**
     * The hooks this beam turns down (or up) in a support, as the generator will place them:
     * their tails' distance past the node, m, and diameter.
     */
    const hookTails = (side: 'I' | 'J'): TailRow[] => {
      const out: TailRow[] = [];
      const tops = rows[side].filter((r) => r.position === 'top');
      const topDia = Math.max(0, ...tops.map((r) => r.diameterMm));
      // Every row's hooks, as its plan nests them (`rowStep`). The outer row's alone left the
      // tails of the rows inside it out of the crossing beams' way, and the crossing bars ran
      // through them (the 408-member frame: 709 top-to-top crossing clashes, 221 with them).
      for (const r of rows[side]) {
        const inboard = r.position === 'top' ? topRowInboard(r.row, r.diameterMm, nestClear(r.diameterMm))
          : r.hook === 'requested' ? bottomHookInboard(topRowsAt(side), topDia, nestClear(Math.max(topDia, r.diameterMm))) : 0;
        const p = plan(side, { position: r.position, diameterMm: r.diameterMm, need: r.need, hook: r.hook === 'requested' ? 'requested' : 'allowed', inboard, ...(r.position === 'top' ? { rowStep: r.diameterMm / 1000 + nestClear(r.diameterMm) } : {}) });
        if (!p?.hook) continue;
        const rr = standardHook(r.diameterMm, 90, 'longitudinal').centrelineRadius;
        out.push({ at: p.along + rr, diameterMm: r.diameterMm, row: r.row, position: r.position, count: r.count });
      }
      return out;
    };
    return { cages, rows, simple, plan, topRowsAt: { I: topRowsAt('I'), J: topRowsAt('J') }, hookTails, maxTopLayers };
  }
  /**
   * The hooks other beams turn into a support, as keep-outs across `id`: each crossing beam's
   * hook tails stand at a known distance past the node (`supportPlanOf`), on a line across that
   * beam, so along `id` they are posts its bars must thread past, as past the column's bars.
   */
  function crossingHookTails(id: number, nodeId: number, t: { x: number; y: number }, placement: number, clearedAtMm: number): KeepOut[] {
    const el = input.elements.get(id);
    const a = el && input.nodes.get(el.nodeI), b = el && input.nodes.get(el.nodeJ);
    if (!el || !a || !b) return [];
    const u = unit(nodePoint(a), nodePoint(b));
    const out: KeepOut[] = [];
    for (const other of beams) {
      if (other === id) continue;
      const o = input.elements.get(other);
      if (!o || (o.nodeI !== nodeId && o.nodeJ !== nodeId)) continue;
      const p = input.nodes.get(o.nodeI), q = input.nodes.get(o.nodeJ);
      if (!p || !q) continue;
      const v = unit(nodePoint(p), nodePoint(q));
      if (Math.abs(u.x * v.x + u.y * v.y + u.z * v.z) > 0.7) continue;
      const plan = supportPlanOf(other);
      if (!plan) continue;
      const side = o.nodeI === nodeId ? 'I' : 'J';
      // The other beam's outward direction at this node, onto `id`'s transverse axis.
      const k = (side === 'I' ? -1 : 1) * (v.x * t.x + v.y * t.y);
      const theirs = plan.hookTails(side);
      if (theirs.length === 0) continue;
      // Where this beam ends here too, its own tails stand beside those, as the design reads
      // them (`crossingTailPosts`, `jointThreading`).
      const ownSide = el.nodeI === nodeId ? 'I' : 'J';
      const ours = lineContinuesAt(id, nodeId) ? undefined : supportPlanOf(id)?.hookTails(ownSide);
      const oc = input.contexts.get(other)!;
      const theirSeat = Math.max(0, ...theirs.filter((x) => x.position === 'top').map((x) =>
        seatedLongitudinalHalfExtents(oc.section.b, oc.section.h, oc.material.cover, oc.material.stirrupDia, x.diameterMm).corner.halfAcross));
      const own = input.contexts.get(id)!;
      const ourDia = Math.max(0, ...(ours ?? []).filter((x) => x.position === 'top').map((x) => x.diameterMm));
      const ourSeat = ourDia > 0 ? seatedLongitudinalHalfExtents(own.section.b, own.section.h, own.material.cover, own.material.stirrupDia, ourDia).corner.halfAcross : 0;
      out.push(...crossingTailPosts({
        theirs, k, theirSeat, ...(ours ? { ours } : {}), ourSeat, gives: yieldsTo({ x: u.x, y: u.y }, { x: v.x, y: v.y }), placement, clearedAtMm,
        ourTopMm: ourTopOf(id) || clearedAtMm,
        clear: minClearSpacingInLayer(input.edition, { barDiameterMm: 0, maxAggregateSizeMm: input.maxAggregateSizeMm }).minClear,
      }));
    }
    return out;
  }



  /** A beam's top bar, mm (its larger top group's). */
  function ourTopOf(id: number): number {
    const accepted = detailableReinforcement(input.outcomes.get(id))?.rebar;
    const o = groupOptsFor(id);
    const g = accepted && o ? beamGroups(accepted, o) : null;
    return g ? Math.max(g.topStart.diameterMm, g.topEnd.diameterMm) : 0;
  }

  /** This beam's own tails beside the column's bars where it ends at the node (`columnTailPosts`). */
  function ownTailsByColumn(id: number, nodeId: number, t: { x: number; y: number }, placement: number, clearedAtMm: number): KeepOut[] {
    const el = input.elements.get(id), n = input.nodes.get(nodeId);
    if (!el || !n || lineContinuesAt(id, nodeId)) return [];
    const ours = supportPlanOf(id)?.hookTails(el.nodeI === nodeId ? 'I' : 'J');
    if (!ours?.length) return [];
    const a = input.nodes.get(el.nodeI)!, b = input.nodes.get(el.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const out = el.nodeI === nodeId ? { x: -(b.x - a.x) / L, y: -(b.y - a.y) / L } : { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const near = columnBarsNear(n, Z(n) + axisOffsetAt(id, nodeId).z);
    return columnTailPosts({
      bars: near.map((c) => ({ along: (c.x - n.x) * out.x + (c.y - n.y) * out.y, across: (c.x - n.x) * t.x + (c.y - n.y) * t.y, diameterMm: c.diameterMm })),
      plan: near.map((c) => ({ x: c.x - n.x, y: c.y - n.y, diameterMm: c.diameterMm })),
      u: { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, t,
      // The joint's ties are the column's (`run-detailing` joint pass: the column's tie bar).
      ours, placement, clearedAtMm, tieDiaMm: Math.max(0, ...columns.filter((cid) => { const c = input.elements.get(cid); return !!c && (c.nodeI === nodeId || c.nodeJ === nodeId); })
        .map((cid) => input.contexts.get(cid)?.material.stirrupDia ?? 0)) || 8,
      clear: (d) => minClearSpacingColumn(input.edition, { barDiameterMm: d, maxAggregateSizeMm: input.maxAggregateSizeMm }).minClear,
    });
  }

  /**
   * Column bars whose line passes through a node's plan position and elevation.
   *
   * Read from the bars the column generator actually produced, not recomputed: threading
   * must dodge the real cage, and a second derivation of "where the column bars are" is a
   * second thing that can disagree with the drawing.
   */
  let columnIndex: ColumnBarIndex | null = null;
  const columnBarsIndex = () => columnIndex ??= new ColumnBarIndex(
    [...memberBarsById.values()].filter((mb) => input.contexts.get(mb.elementId)?.elementType === 'column'),
  );

  /**
   * `level`: the elevation the beam's bars cross the column at — its axis there, the node plus
   * its declared insertion. At the node it was, which for a top-flush beam is its top face: a
   * roof column's bars stop a cover below it, so none was found, the threading saw an empty
   * cage and laid the beam's top bars through the column's.
   */
  function columnBarsNear(n: DetailingModelNode, level: number = Z(n)) {
    // The column's LONGITUDINAL bars only. A tie is a horizontal ring: its first point is a
    // hook tail, not a vertical bar standing there, and a tie whose plane lies within 2 cm of
    // the node passed the level filter and was read as a bar the beams had to thread past.
    // That phantom (at ±37 and 62 mm across on the fixture's 30 cm columns) emptied every
    // layout of the beams framing in, the floor's search came back exhausted, and with no
    // assignment no collinear joint got its splice: the top bars of two spans stopped at the
    // column, neither fused nor lapped.
    const found = columnBarsIndex().query(n, level, 1.0).filter((b) => b.role === 'longitudinal');

    // ── Deduplicate by PHYSICAL POSITION, not by owning member ──
    //
    // Every node between two lifts is spanned by the lift below (whose bars run up into the
    // lap) and the lift above. Counting both gives two obstacles where the steel is one
    // continuous bar passing through the joint, or two bars lapping side by side that
    // occupy one corridor between them.
    //
    // A beam threading the cage cares about occupied SPACE, so bars sharing a plan position
    // to the millimetre are one obstacle, taking the larger diameter. Where a transition
    // genuinely moves a bar, the two positions differ and both are kept — which is correct,
    // because at a transition there really are two bars to miss.
    const byPosition = new Map<string, { diameterMm: number; x: number; y: number }>();
    for (const b of found) {
      const key = `${Math.round(b.x * 1000)}:${Math.round(b.y * 1000)}`;
      const seen = byPosition.get(key);
      if (!seen || b.diameterMm > seen.diameterMm) {
        byPosition.set(key, { diameterMm: b.diameterMm, x: b.x, y: b.y });
      }
    }
    return [...byPosition.values()].sort((a, b) => a.x - b.x || a.y - b.y);
  }


  /**
   * Cage arrangement chosen per stack, and the resulting bar plan offsets.
   *
   * Chosen before the column bars are generated, because the arrangement IS the bar
   * positions. Holding the cage fixed and asking the beams to cope was measured and does
   * not work: with evenly spread face bars the free channels on the flagship are ~29 mm and
   * a Ø32 beam bar cannot pass, so the search declared 244 beam domains empty for a reason
   * that was the column's to fix.
   *
   * The widest-channel arrangement is preferred, which is what a detailer does when the
   * beam steel is large, and it is legal because it packs the face bars at the §25.2.3
   * minimum rather than at an invented offset.
   */

  /**
   * The §25.7.1.2 seat a beam's outermost bars must occupy, and how close is close enough.
   *
   * Read from `seatedLongitudinalHalfExtents` — the one authority on where a bar sits against
   * its cage — rather than derived again here. The tolerance mirrors `barAtCorner`'s reach in
   * `transverse-cage`: a bend of centreline radius `r` contains a bar whose centre lies within
   * about `r + d_b/2` of the seat, so the two layers agree on what "contained" means.
   */
  const beamSeat = (ctx: {
    section: { b: number; h: number }; material: { cover: number; stirrupDia: number };
  }, barDiaMm: number) => sharedBeamSeat(ctx.section, ctx.material.cover, ctx.material.stirrupDia, barDiaMm);

  const cageFor = new Map<string, ColumnLayoutCandidate>();
  /** The ordinary drawing — what is actually built, until an alternative earns its place. */
  const conventionalCage = new Map<string, ColumnLayoutCandidate>();
  /** Which arrangement the scoring WOULD choose, reported as evidence. */
  const cageChoiceRationale = new Map<string, string>();
  for (const [stackId, liftsRaw] of stacks) {
    const first = liftsRaw[0];
    const cands = generateColumnCandidates({
      count: first.bars.count, diameterMm: first.bars.diameterMm,
      b: first.b, h: first.h, cover: first.cover, tieDiaMm: first.tieDia,
      edition: input.edition, maxAggregateSizeMm: input.maxAggregateSizeMm,
      placementTolerance: DEFAULT_TOLERANCES.placement,
    });
    if (cands.length === 0) continue;

    // Score each cage against the beams that actually frame into this stack, rather than
    // taking the widest channel and hoping. Widest-channel-first was measured: it opened
    // beam domains (244 emptied → 125) and RAISED total conflicts 2,579 → 3,090, because
    // packing the face bars tight to the corners buys plan width for the beams and spends
    // it on column-to-column and column-to-beam clearance elsewhere. A cage is only better
    // if the beams meeting it end up better off.
    const incident = beams.filter((bid) => {
      const bel = input.elements.get(bid);
      if (!bel) return false;
      return liftsRaw.some((lift) => [bel.nodeI, bel.nodeJ].some((nid) => {
        const n = input.nodes.get(nid);
        return n !== undefined
          && Math.hypot(n.x - (lift.nodePlan ?? lift.centre).x, n.y - (lift.nodePlan ?? lift.centre).y) < 0.6
          && (Math.abs(Z(n) - lift.topZ) < 0.05 || Math.abs(Z(n) - lift.baseZ) < 0.05);
      }));
    });

    // Prefer the CONVENTIONAL cage, and depart from it only where the departure is
    // necessary. Measured: choosing the widest channel everywhere unblocks beam threading
    // (244 emptied domains → 125) and still ends up WORSE overall, 2,579 → 3,090 conflicts,
    // because packing the face bars to the corners spends in column-to-column and
    // column-to-beam clearance what it buys in plan width. So the criterion is not "which
    // cage helps most" but "does the ordinary cage leave a beam with NO legal layout at
    // all" — an unusual detail is worth its cost only where it is the difference between
    // possible and impossible.
    let best = cands.find((c) => c.arrangement === 'even') ?? cands[0];
    let bestScore = -Infinity;
    for (const cage of cands) {
      let stranded = 0;
      for (const bid of incident) {
        const bctx = input.contexts.get(bid);
        const bel = input.elements.get(bid);
        const accepted = detailableReinforcement(input.outcomes.get(bid))?.rebar;
        const bOpts = groupOptsFor(bid);
        const groups = accepted && bOpts ? beamGroups(accepted, bOpts) : null;
        if (!bctx || !bel || !groups) continue;
        const nI = input.nodes.get(bel.nodeI);
        const nJ = input.nodes.get(bel.nodeJ);
        if (!nI || !nJ) continue;
        const dx = nJ.x - nI.x, dy = nJ.y - nI.y;
        const L = Math.hypot(dx, dy) || 1;
        const t = { x: dy / L, y: -dx / L };
        const dia = Math.max(groups.bottom.diameterMm, groups.topStart.diameterMm);
        const count = Math.max(groups.bottom.count, groups.topStart.count, groups.topEnd.count);
        const clearWidth = Math.max(0.02,
          bctx.section.b - 2 * (bctx.material.cover + bctx.material.stirrupDia / 1000));
        const keep = cageKeepOuts(cage, dia, t, DEFAULT_TOLERANCES.placement);
        const domain = generateLayoutCandidates({
          count, diameterMm: dia, clearWidth, edition: input.edition,
          maxAggregateSizeMm: input.maxAggregateSizeMm, memberKind: 'beam',
          placementTolerance: DEFAULT_TOLERANCES.placement,
          ...beamSeat(bctx, dia),
        });
        if (!domain.some((c) => candidateClears(c, dia, keep).ok)) stranded++;
      }
      // Fewest stranded beams wins. Ties go to the conventional arrangement, then to fewer
      // crossties — a cage needing extra restraint steel is a worse drawing at equal
      // benefit — then to the stable id so the choice cannot depend on iteration order.
      const conventional = cage.arrangement === 'even' ? 1 : 0;
      const score = -stranded * 1000 + conventional * 100 - cage.crossties.length;
      if (score > bestScore || (score === bestScore && cage.id < best.id)) {
        bestScore = score;
        best = cage;
      }
    }
    // NOT SHIPPED YET, and the measurements say why.
    //
    // The scoring below is real and its answer is recorded, but no arrangement from this
    // module is applied to the drawing, because every variant measured WORSE than the
    // generator's existing cage while the beam search still fails:
    //
    //   existing cage, beams unresolved            2,579 conflicts
    //   clustered everywhere                       3,090   (+20%)
    //   clustered only where beams are stranded    3,090   (chosen everywhere anyway)
    //   this module's 'even', extras on 4 faces    2,921   (+13%)
    //
    // The cause is not that the cages are bad. It is that with the search unresolved NO
    // beam layout is applied at all, so a cage is only ever measured against default
    // centred beams — and a tighter cage then simply scores worse. Clustering unblocks
    // beam threading properly (244 stranded domains → 125); it cannot show its benefit
    // until the assignment it enables is actually used.
    //
    // So the arrangement is chosen, scored and reported as evidence, and adoption waits on
    // the search closing. Shipping a measured regression because the reasoning behind it
    // is sound would be the same mistake as the two threading heuristics before it.
    cageChoiceRationale.set(stackId, best.arrangement);
    conventionalCage.set(stackId, cands.find((c) => c.arrangement === 'even') ?? cands[0]);
  }

  for (const [stackId, liftsRaw] of stacks) {
    const first = liftsRaw[0];
    const ctx = input.contexts.get(first.elementId);
    if (!ctx) continue;
    const cands = generateColumnCandidates({
      count: first.bars.count, diameterMm: first.bars.diameterMm,
      b: first.b, h: first.h, cover: first.cover, tieDiaMm: first.tieDia,
      edition: input.edition, maxAggregateSizeMm: input.maxAggregateSizeMm,
      placementTolerance: DEFAULT_TOLERANCES.placement,
    });
    if (cands.length > 0) cageFor.set(stackId, cands[0]);
  }

  for (const [stackId, liftsRaw] of stacks) {
    const lifts = [...liftsRaw].sort((a, b) => a.baseZ - b.baseZ);
    const first = input.contexts.get(lifts[0].elementId)!;
    const anchor = anchorageFunctions({
      fy: first.material.fy, fc: first.material.fc,
      // Column bars are vertical, so the top-bar factor does not apply; spacing in a tied
      // column with the code's own tie requirements satisfies the favourable row.
      favourableSpacing: true, psiT: 1.0,
      maxAggregateSizeMm: input.maxAggregateSizeMm as never,
      edition: input.edition,
    } as never);

    // The joint above each lift (and below the first): the band the beams framing in make, each
    // on its own axis — the node plus its declared insertion (`memberLine`). A top-flush beam's
    // axis is h/2 under the node and its band [node − h, node]; centred, node ± h/2 (`jointBand`).
    // The band is handed over only where an insertion moves it, so a model that declares none
    // gets the joint it always had, to the bit.
    const jointAt = (z: number, at: { x: number; y: number }) => {
      const framing: BandBeam[] = [];
      for (const bId of beams) {
        const bEl = input.elements.get(bId);
        const bCtx = input.contexts.get(bId);
        if (!bEl || !bCtx) continue;
        for (const nid of [bEl.nodeI, bEl.nodeJ]) {
          const n = input.nodes.get(nid);
          if (!n) continue;
          if (Math.abs(Z(n) - z) < 0.05
            && Math.hypot(n.x - at.x, n.y - at.y) < 0.6) {
            framing.push({ nodeZ: Z(n), dz: axisOffsetAt(bId, nid).z, h: bCtx.section.h });
          }
        }
      }
      const band = jointBandOf(framing);
      return { depth: band?.depth ?? 0, band: band?.moved ? { lo: band.lo, hi: band.hi } : undefined };
    };
    const beamDepthAtTop = new Map<number, number>();
    const jointAtTop = new Map<number, { lo: number; hi: number }>();
    lifts.forEach((lift, i) => {
      const j = jointAt(lift.topZ, lift.nodePlan ?? lift.centre);
      if (j.depth > 0) beamDepthAtTop.set(i, j.band ? j.band.hi - j.band.lo : j.depth);
      if (j.band) jointAtTop.set(i, j.band);
    });
    const atBase = jointAt(lifts[0].baseZ, lifts[0].nodePlan ?? lifts[0].centre);
    const beamDepthAtBase = (atBase.band ? atBase.band.hi - atBase.band.lo : atBase.depth) || undefined;
    const jointAtBase = atBase.band;
    /**
     * How far inside the clear height a column tie stops short of a joint at `z`. A beam's
     * outer bars lie at least its cover and stirrup inside its face, and a tie beside them keeps
     * the column-bar clear distance (§25.2.3) plus its own radius: measured on qa-8, the lift's
     * top tie at the soffit of the 550 mm beams came 32,8 mm from their bottom bars, of 40.
     */
    const matGap = (z: number, centre: { x: number; y: number }, tieDiaMm: number) => {
      const longDia = Math.max(...lifts.map((l) => l.bars.diameterMm));
      const clear = minClearSpacingColumn(input.edition, { barDiameterMm: longDia, maxAggregateSizeMm: input.maxAggregateSizeMm }).minClear;
      let gap = 0;
      for (const bId of beams) {
        const bEl = input.elements.get(bId), bCtx = input.contexts.get(bId);
        if (!bEl || !bCtx) continue;
        const at = [bEl.nodeI, bEl.nodeJ].some((nid) => {
          const n = input.nodes.get(nid);
          return !!n && Math.abs(Z(n) - z) < 0.05 && Math.hypot(n.x - centre.x, n.y - centre.y) < 0.6;
        });
        if (at) gap = Math.max(gap, clear + tieDiaMm / 2000 - bCtx.material.cover - bCtx.material.stirrupDia / 1000);
      }
      // The set's crossties stand a bar apart along the column about the station (`setNudge`): one
      // per interior line, two lines per four bars beyond the corners.
      const pieces = 1 + Math.max(0, Math.round((Math.max(...lifts.map((l) => l.bars.count)) - 4) / 2));
      return gap > 0 ? gap + setSpread(pieces, tieDiaMm) / 2 : 0;
    };

    const gen = generateColumnStack({
      stackId, lifts,
      fc: first.material.fc, fy: first.material.fy,
      maxAggregateSizeMm: input.maxAggregateSizeMm,
      edition: input.edition,
      // A lap a person set for the stack replaces the code's; the splice check below measures it.
      lapSplice: ((set) => (set !== undefined ? () => set : anchor.lapSplice))(lifts.map((l) => input.columnLaps?.get(l.elementId)).find((v) => v !== undefined)),
      // The cage from `column-candidates`, which distributes the non-corner bars around
      // ALL FOUR faces and validates §25.2.3 before returning.
      //
      // The generator's own fallback crams every extra bar onto the two ±y faces. For the
      // flagship's 24Ø12 and 28Ø12 columns that is 20-plus bars on two faces at roughly
      // 8 mm clear, against the 40 mm the article requires — an illegal cage, drawn without
      // complaint, which then blocked every beam framing into that joint. It is the reason
      // 120 beams were reported impossible to thread.
      // A circular, T or L column keeps its bars on its own outline.
      barPositions: first.shape
        ? shapedPlanBars(first.shape, lifts[0].bars.count, lifts[0].bars.diameterMm, lifts[0].cover, lifts[0].tieDia, columnFrame(lifts[0].elementId))
        : conventionalCage.get(stackId)?.slots.map((sl) => ({ x: sl.dx, y: sl.dy })),
      beamDepthAtTop, beamDepthAtBase,
      ...(jointAtTop.size ? { jointAtTop } : {}), ...(jointAtBase ? { jointAtBase } : {}),
      // ── §25.4.1.2: a hook anchors tension, never compression ──
      //
      // This was hardcoded `true`, so every roof column bar got a 90° hook whatever it
      // carried. On a compression-only column the clause does not merely make the hook
      // unnecessary, it FORBIDS using one for anchorage — and the 12db horizontal
      // extension it produced ran straight through the beam's top mat at every roof joint.
      //
      // The question the clause asks is whether the bar needs TENSION development. Two
      // ways it can: net axial tension in some combination, or an eccentricity large
      // enough to open tension on a face. Both are checked; either one calls for a hook.
      roofTermination: topLiftNeedsTension(lifts),
    });

    // ── The stack's laps, as built (§25.5, `splice-checks.ts`) ──
    //
    // At each floor the upper lift's bars start where the lower lift's run on a lap length past
    // it. Both sets are read off `gen.bars` as one plan section: each upper bar paired with the
    // nearest bar from below, the pair checked (contact or not, its length, its bar size, its
    // steel) and every other bar of the section measured against it (§25.2.3). The certified cage
    // puts both lifts' bars on the same plan points, so a pair shares a centreline: neither the
    // crank of §10.7.4.1 nor a side-by-side arrangement is modelled, and that is reported.
    {
      const sectionBars: Array<SectionBar & { bar: BarPath }> = [];
      for (const bar of gen.bars) {
        if (bar.role !== 'longitudinal' || bar.segments.length === 0) continue;
        const zs = bar.segments.flatMap((sg) => [sg.start.z, sg.end.z]);
        const s0 = bar.segments[0]!.start;
        const owner = bar.ownerElementIds[bar.ownerElementIds.length - 1] ?? nearestLiftTo(bar, lifts);
        sectionBars.push({ id: bar.id, x: s0.x, y: s0.y, diameterMm: bar.diameterMm, zMin: Math.min(...zs), zMax: Math.max(...zs), elementId: owner, bar });
      }
      for (let li = 1; li < lifts.length; li++) {
        const ups = sectionBars.filter((b) => b.elementId === lifts[li]!.elementId && b.bar.ownerElementIds.length === 1);
        if (ups.length === 0) continue;
        const floorZ = Math.min(...ups.map((b) => b.zMin));
        const lo = input.contexts.get(lifts[li - 1]!.elementId), up = input.contexts.get(lifts[li]!.elementId);
        if (!lo || !up) continue;
        const r = checkColumnLapSection({ floorZ, bars: sectionBars, maxAggregateSizeMm: input.maxAggregateSizeMm, ctx: lapContext });
        const found = [...r.conditions];
        for (const p of r.pairs) {
          const a = sectionBars.find((b) => b.id === p.lower.id)!.bar, b = sectionBars.find((x) => x.id === p.upper.id)!.bar;
          found.push(...checkLapPair({
            kind: 'column', joint: `z${floorZ.toFixed(2)}`, a, b, elementIds: [lifts[li]!.elementId],
            members: [lapMemberOf(lo), lapMemberOf(up)], ctx: lapContext,
          }));
        }
        columnLapOpen.push(...collapseLapConditions(found));
      }
    }

    // ── Attribute each bar to the lift that owns it ──
    //
    // The stack is generated as a unit because splices, transitions and the splice-free
    // zone through each joint only make sense across lifts. But an ASSEMBLY is per member:
    // filing the whole stack under its lowest lift left every other lift owned by nothing,
    // which is how 140 verified columns vanished from the UI, the schedule and the
    // drawings while the run still reported success.
    const byOwner = new Map<number, BarPath[]>();
    for (const bar of gen.bars) {
      // A bar with no owner (a splice bar spanning a transition) is filed with the lift it
      // starts in, so it is drawn and scheduled exactly once.
      const owners = bar.ownerElementIds.length > 0
        ? bar.ownerElementIds
        : [nearestLiftTo(bar, lifts)];
      const owner = owners[0];
      byOwner.set(owner, [...(byOwner.get(owner) ?? []), bar]);
    }

    const stackRefs = [...gen.refs, ...anchor.refs];
    const stackMaturity = deriveMaturity({
      implemented: true, refs: stackRefs, benchmarks: [],
    }).maturity;

    for (const lift of lifts) {
      const bars = byOwner.get(lift.elementId) ?? [];
      const liftUnsupported: string[] = [];

      /**
       * ── The column's own ties, which were described and never built ──
       *
       * `generateColumnStack` returns `ties` as a ZONE SCHEDULE — lift, extent, spacing,
       * diameter — decided by `tieSpacing` under §10.7.6.2 and §25.7.2. It returns no
       * geometry. The beam path a few hundred lines below appends `gen.transverse`, which
       * IS geometry; the column path appended `gen.bars` alone, because there was nothing
       * else to append.
       *
       * The consequence, measured on the 7-storey building: 1 060 column longitudinals and
       * 39 transverse pieces, every one of the 39 a JOINT tie from a different producer.
       * Eighty-four columns with no ties, in the model, in the drawings, in the schedule and
       * in the collision check. The same defect the beam comment below describes, unfixed on
       * the other member type.
       *
       * Nothing is invented here. The spacing, the extent and the diameter are the design's;
       * the bar positions are the ones already generated for this lift; and the piece
       * geometry comes from `buildColumnTieSet`, the same builder that already serves the
       * joint cages above and the footing starter cages in `floor-transverse`.
       */
      const liftIndex = lifts.indexOf(lift);
      for (const zone of gen.ties.filter((t) => t.liftIndex === liftIndex)) {
        /**
         * The ties stop below the beams, because the joint pass fills that band.
         *
         * A column's ties run its CLEAR height; the depth occupied by the beams framing in
         * at the top is the joint, and the joint has its own cage at its own spacing —
         * §15.3.1.4 caps it at 200 mm where §10.7.6.2 would allow more. Running the lift
         * ties to `topZ` would put two independently generated cages in the same band, and
         * the collision checker would be right to report every one of those pairs.
         */
        // The zones run the clear height already (`generateColumnStack`): soffit to floor. The
        // tie at either end stands beside the joint's outer beam mat, so it keeps the clear
        // distance the joint's own ties keep from it (`keepClearOf` below).
        const from = zone.from + (zone.from > lift.baseZ + 1e-6 ? matGap(lift.baseZ, lift.nodePlan ?? lift.centre, lift.tieDia) : 0);
        const clearTop = zone.to - (zone.to < lift.topZ - 1e-6 ? matGap(lift.topZ, lift.nodePlan ?? lift.centre, lift.tieDia) : 0);
        const height = clearTop - from;
        if (!(height > 0)) continue;

        const ctx = input.contexts.get(lift.elementId);
        if (!ctx) continue;

        // A shaped column: hoops on its own outline, or its spiral (`shaped-ties.ts`).
        if (ctx.shape) {
          const spiral = detailableReinforcement(input.outcomes.get(lift.elementId))?.rebar?.shaped?.spiral;
          const frame = columnFrame(lift.elementId);
          if (spiral && ctx.shape.kind === 'circle') {
            bars.push(shapedSpiral({ D: ctx.shape.D, cover: lift.cover, diaMm: spiral.diameter, pitch: spiral.pitch, frame, centre: lift.centre, from: from, to: clearTop, elementId: lift.elementId, id: `col-${lift.elementId}-spiral` }));
          } else {
            const st = stirrupStations({ from: 0, to: height, spacing: zone.spacing, nextZoneStartsAtEnd: false });
            bars.push(...shapedHoops({ shape: ctx.shape, cover: lift.cover, tieDiaMm: zone.diameterMm, frame, centre: lift.centre, zs: st.map((z) => from + z), elementId: lift.elementId, idPrefix: `col-${lift.elementId}` }));
          }
          continue;
        }

        /**
         * The bars this tie can grip, in the tie's own frame.
         *
         * Read from the bars ACTUALLY generated for this lift rather than re-derived from a
         * layout: the cage that was placed is the cage the tie has to hold, and a second
         * derivation is a second opinion about where the steel is. `up` is global x and
         * `across` global y — the same arbitrary-but-stated choice the joint cage makes, for
         * the same reason.
         */
        const cageAt = (z: number) => bars
          .filter((b) => b.role === 'longitudinal')
          .filter((b) => {
            const zs = b.segments.flatMap((sg) => [sg.start.z, sg.end.z]);
            return Math.min(...zs) <= z + 0.002 && Math.max(...zs) >= z - 0.002;
          })
          .map((b) => ({
            id: b.id,
            across: b.segments[0].start.y - lift.centre.y,
            up: b.segments[0].start.x - lift.centre.x,
            diameterMm: b.diameterMm,
          }));

        const stations = stirrupStations({
          from: 0, to: height, spacing: zone.spacing, nextZoneStartsAtEnd: false,
        });
        for (let si = 0; si < stations.length; si++) {
          const set = buildColumnTieSet({
            closureCache,
            elementId: lift.elementId,
            cageId: `col-${lift.elementId}:cage`,
            zoneId: `col-${lift.elementId}:ties`,
            station: stations[si],
            // Longitudinal plan coordinates use b along X and h along Y. This tie's
            // across is Y and up is X, so its section dimensions must follow that frame.
            b: lift.h, h: lift.b,
            cover: lift.cover, stirrupDiaMm: zone.diameterMm,
            // As at the joint: `legs` does not decide a column cage. The builder reads the
            // bars that are there and braces every interior line that carries one.
            legs: 2,
            longitudinalBars: cageAt(from + stations[si]),
            origin: { x: lift.centre.x, y: lift.centre.y, z: from },
            axis: { x: 0, y: 0, z: 1 },
            up: { x: 1, y: 0, z: 0 },
            across: { x: 0, y: 1, z: 0 },
            hookOrientation: si % 2 === 0 ? 'a' : 'b',
            maxAggregateSizeMm: input.maxAggregateSizeMm,
          });
          if (set.unsupported.length > 0) {
            // Said once per lift, not once per station: a cage that cannot be built fails
            // identically at every station, and 40 copies of one sentence is not a report.
            if (si === 0) liftUnsupported.push(...set.unsupported.map((r) => formatClause(r)));
            continue;
          }
          bars.push(...set.pieces.map((p) => p.path));
        }
      }

      memberBarsById.set(lift.elementId, {
        elementId: lift.elementId,
        bars,
        // Stack-level conditions are reported once, on the lowest lift, so a single
        // unsupported condition does not multiply by the number of storeys.
        unsupported: lift.elementId === lifts[0].elementId
          ? [...gen.unsupported, ...liftUnsupported]
          : liftUnsupported,
        maturity: stackMaturity,
        refs: stackRefs,
        trace: [
          ...(lift.elementId === lifts[0].elementId ? gen.trace : []),
          ...(memberLine(lift.elementId) ? [referenceLineNote(memberLine(lift.elementId)!)] : []),
        ],
      });
      if (bars.length === 0) {
        skipped.push({ elementId: lift.elementId, key: 'detailing.skip.liftProducedNoBars' });
      }
    }
  }

  /**
   * Choose every beam's transverse arrangement GLOBALLY, before any bar is generated.
   *
   * Two per-joint heuristics were built and measured before this and both made the
   * flagship worse, for the same structural reason: a beam spans two joints, so its
   * transverse position is one decision that has to hold at both ends, and fixing one end
   * at a time makes each fix undo the last.
   *
   * So the decision is taken once, for every beam at once, by the coordination search:
   * each beam gets a domain of complete legal layouts, each joint contributes the column
   * cage its beams must thread past, and the search finds an assignment satisfying all of
   * them together — or reports which of the four honest outcomes applies.
   */
  function coordinateBeamLayouts(): {
    slots: Map<number, number[]>;
    /** Layer index per slot, parallel to `slots`. */
    slotLayers: Map<number, number[]>;
    result: CoordinationResult;
    /** The joints the assignment closed, ready for `materialiseLaps`. */
    transitions: PlannedTransition[];
  } {
    const placement = DEFAULT_TOLERANCES.placement;
    const members: MemberVariable[] = [];
    const domainArgsOf = new Map<number, Parameters<typeof beamLayoutDomain>[0]>();
    const perBeam = new Map<number, {
      dia: number; count: number; t: { x: number; y: number };
      botDia: number; topDia: number; topMinDia: number;
    }>();

    for (const id of beams) {
      const ctx = input.contexts.get(id);
      const el = input.elements.get(id);
      const accepted = detailableReinforcement(input.outcomes.get(id))?.rebar;
      const bOpts = groupOptsFor(id);
      const groups = accepted && bOpts ? beamGroups(accepted, bOpts) : null;
      if (!ctx || !el || !groups) continue;
      const nI = input.nodes.get(el.nodeI);
      const nJ = input.nodes.get(el.nodeJ);
      if (!nI || !nJ) continue;

      const dx = nJ.x - nI.x, dy = nJ.y - nI.y;
      const L = Math.hypot(dx, dy) || 1;
      // Must match `transverseAxis(axis, up)` in the generator, which is axis × up.
      const t = { x: dy / L, y: -dx / L };

      // The widest group governs: one arrangement serves the whole member. Its rows are laid at
      // the WIDEST group's own bar (`rowDia`), and its clearances against the joints read the
      // member's largest (`dia`). Laid at the largest bar of any group, a row of 7Ø10 top bars in
      // a beam whose bottom is Ø12 did not fit one row and split into two the design never had;
      // the hooks of the second row then nested inside the first's and lost the length the
      // design verified (`support-anchorage.ts`).
      const row = beamRow(groups);
      const { count, dia } = row;

      // Slots are measured from the beam's AXIS (`generateBeamBars` lays them round `origin`),
      // and the axis is the node plus the declared insertion: a beam placed by its face in plan
      // has its axis off the node, so a column bar on the node line is off its centreline.
      const axisI = memberLine(id)?.i ?? nodePoint(nI);
      const lockedAcross = (input.lockedBars ?? [])
        .filter((b) => b.ownerElementIds.includes(id))
        .map((b) => {
          const p = b.segments[0]?.start;
          if (!p) return null;
          return (p.x - axisI.x) * t.x + (p.y - axisI.y) * t.y;
        })
        .filter((x): x is number => x !== null);

      // The UNION of both ends' cages. A straight bar holds one transverse position along
      // its whole length, so the arrangement has to clear every joint it passes through —
      // and the generator needs to see them all to offer a channel-aware alternative.
      const endObstacles: KeepOut[] = [];
      for (const n of [nI, nJ]) {
        const here: KeepOut[] = [];
        for (const c of columnBarsNear(n, Z(n) + axisOffsetAt(id, n.id).z)) {
          here.push({
            at: (c.x - n.x) * t.x + (c.y - n.y) * t.y,
            halfWidth: c.diameterMm / 2000 + placement,
          });
        }
        here.push(...crossingHookTails(id, n.id, t, placement, dia), ...ownTailsByColumn(id, n.id, t, placement, dia));
        endObstacles.push(...onAxis(id, n.id, t, here));
      }

      // The layouts the design's threading check reads too (`joint-threading.ts`), with the
      // extra layer only where the design found every bar anchoring in it (`endSupportPlan`).
      const domainArgs = {
        row, section: ctx.section, cover: ctx.material.cover, stirrupDiaMm: ctx.material.stirrupDia,
        edition: input.edition, maxAggregateSizeMm: input.maxAggregateSizeMm, placement,
        obstacles: endObstacles, lockedAcross, maxTopLayers: supportPlanOf(id)?.maxTopLayers,
      };
      const domain = beamLayoutDomain(domainArgs);
      if (domain.length === 0) continue;
      domainArgsOf.set(id, domainArgs);

      perBeam.set(id, {
        dia, count, t,
        botDia: groups.bottom.diameterMm,
        topDia: Math.max(groups.topStart.diameterMm, groups.topEnd.diameterMm),
        topMinDia: [groups.topStart.diameterMm, groups.topEnd.diameterMm].filter((d) => d > 0).reduce((a, d) => Math.min(a, d), groups.topStart.diameterMm || groups.topEnd.diameterMm),
      });
      members.push({ elementId: id, domain, diameterMm: dia, neighbours: [] });
    }

    // Joints: one per node where beams meet, carrying the column cage as keep-outs.
    const byNode = new Map<number, number[]>();
    for (const id of perBeam.keys()) {
      const el = input.elements.get(id)!;
      for (const nid of [el.nodeI, el.nodeJ]) {
        byNode.set(nid, [...(byNode.get(nid) ?? []), id]);
      }
    }

    const joints: JointConstraint[] = [];
    for (const [nodeId, ids] of [...byNode.entries()].sort((a, b) => a[0] - b[0])) {
      const n = input.nodes.get(nodeId);
      if (!n) continue;
      // Each beam reads the cage at its own bars' elevation (`columnBarsNear` `level`).
      const cageOf = new Map(ids.map((id) => [id, columnBarsNear(n, Z(n) + axisOffsetAt(id, nodeId).z)]));
      if ([...cageOf.values()].every((c) => c.length === 0) && ids.length < 2) continue;

      const keepOutsFor = new Map<number, KeepOut[]>();
      for (const id of ids) {
        const info = perBeam.get(id)!;
        // A beam bar CROSSES a column bar; it does not run alongside it. §25.2.3 governs
        // the spacing between a column's own longitudinals, and the classifier that judges
        // the finished cage requires zero clear distance for a crossing — crossing bars are
        // tied in contact. Demanding 40 mm here made the search stricter than the check it
        // feeds, and declared infeasible what the checker would have passed.
        //
        // What a crossing genuinely needs is not to INTERPENETRATE, with the placement
        // tolerance as the guard.
        keepOutsFor.set(id, onAxis(id, nodeId, info.t, [...cageOf.get(id)!.map((c) => ({
          at: (c.x - n.x) * info.t.x + (c.y - n.y) * info.t.y,
          halfWidth: c.diameterMm / 2000 + placement,
        })), ...crossingHookTails(id, nodeId, info.t, placement, info.dia), ...ownTailsByColumn(id, nodeId, info.t, placement, info.dia)]));
      }
      joints.push({
        jointId: `n${nodeId}`,
        elementIds: [...ids].sort((a, b) => a - b),
        keepOutsFor,
        // Is a code-legal splice available between two collinear layouts? §25.5.1.2's
        // contact lap is the ordinary answer and needs no plan separation at all.
        transitionExists: (aId, aLayout, bId, bLayout) => {
          const ia = perBeam.get(aId);
          const ib = perBeam.get(bId);
          if (!ia || !ib) return false;
          const ctxA = input.contexts.get(aId);
          if (!ctxA) return false;
          // ψt = 1,3 as for every beam bar the detailing develops (§25.4.2.5): the lap a joint
          // plans carries its top mat, where the bars have more than 300 mm of concrete below.
          // Read from BOTH members, f'c and fy too (`lineLapDevelopment`): the lap lies in the
          // outgoing one, which the incoming member's depth and materials do not describe.
          const ctxB = input.contexts.get(bId);
          const dev = lineLapDevelopment(lapMemberOf(ctxA), ctxB && lapMemberOf(ctxB), Math.max(ia.dia, ib.dia), input.edition);
          // Each layout's slots are measured from its own beam's axis; two beams on one line
          // placed off the node by different amounts across it lap from the node line.
          return transitionExists(
            nodeLine(aId, nodeId, ia.t, aLayout.slots.map((sl) => sl.across)),
            nodeLine(bId, nodeId, ib.t, bLayout.slots.map((sl) => sl.across)),
            Math.max(ia.dia, ib.dia), dev,
            {
              // Provided/required at a support is routinely ≥ 2 for the continuing steel,
              // but the conservative default is Class B and it is what is assumed here.
              areaRatio: 1.0,
              // A lap at a support reaches into BOTH adjacent spans, so the room available
              // is half of each, not half of one. Counting only the near span refused a
              // legal lap on any member whose own half-length was shorter than the lap —
              // which on the flagship was the single remaining stranded beam.
              availableLength: (ctxA.L + (input.contexts.get(bId)?.L ?? ctxA.L)) / 2,
              edition: input.edition,
              maxAggregateSizeMm: input.maxAggregateSizeMm,
            });
        },
        relation: (a, b) => {
          const ta = perBeam.get(a)?.t;
          const tb = perBeam.get(b)?.t;
          if (!ta || !tb) return 'independent';
          // Same plan axis: the two beams continue through this support as one run, so
          // their bars must line up. Different axis: the layer allocation stacks them.
          return Math.abs(ta.x * tb.x + ta.y * tb.y) > 0.7 ? 'collinear' : 'crossing';
        },
      });
    }

    // ── Identify beam LINES so the exact chain DP can run ──
    //
    // The DP was dead code: `dpStates` read 0 on every flagship run because no member
    // ever carried a lineId, so every collinear constraint fell through to propagation and
    // backtracking. Propagation can only remove a candidate that has no compatible partner;
    // it cannot search for the combination that works. Fifty of the fifty-nine remaining
    // stranded members survive their own joints and are removed by a NEIGHBOUR — which is
    // precisely the case a chain DP solves exactly and arc consistency cannot.
    //
    // A line is a maximal run of beams that meet end to end on the same plan axis. Members
    // are unioned across shared nodes when their axes agree, then ordered along the line.
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      const p = parent.get(x);
      if (p === undefined || p === x) return x;
      const r = find(p);
      parent.set(x, r);
      return r;
    };
    const union = (a: number, b: number) => { parent.set(find(a), find(b)); };
    for (const m of members) parent.set(m.elementId, m.elementId);

    for (const j of joints) {
      for (const a of j.elementIds) {
        for (const b of j.elementIds) {
          if (a >= b) continue;
          if (j.relation(a, b) === 'collinear') union(a, b);
        }
      }
    }

    const lineMembers = new Map<number, number[]>();
    for (const m of members) {
      const root = find(m.elementId);
      lineMembers.set(root, [...(lineMembers.get(root) ?? []), m.elementId]);
    }

    /**
     * Every member's plan axis, for the line-identity invariant below.
     */
    const axisOf = (id: number): { x: number; y: number } | undefined => {
      const t = perBeam.get(id)?.t;
      // perBeam.t is the TRANSVERSE axis; the line runs perpendicular to it.
      return t ? { x: -t.y, y: t.x } : undefined;
    };

    /**
     * Canonical name for a line: its lowest member id, zero-padded.
     *
     * NOT the union-find root, which is whichever member happened to win the last union
     * and therefore depends on the order the members arrived in. That was fine while the
     * id was only a DP grouping key, and became a determinism bug the moment the joint
     * layer allocator started sorting by it — the same floor supplied in a different
     * order got a different rank assignment and therefore different physical geometry.
     */
    const lineName = (ids: readonly number[]): string =>
      `line-${String(Math.min(...ids)).padStart(6, '0')}`;
    for (const [root, ids] of lineMembers) {
      if (ids.length < 2) continue;   // a lone beam is not a chain; leave it to the search
      // Order along the line by the midpoint's projection on the line's own axis, so
      // consecutive DP states really are adjacent members.
      const dir = perBeam.get(ids[0])!.t;
      const along = { x: -dir.y, y: dir.x };
      const keyed = ids.map((id) => {
        const el = input.elements.get(id)!;
        const a = input.nodes.get(el.nodeI)!;
        const b = input.nodes.get(el.nodeJ)!;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        return { id, s: mx * along.x + my * along.y };
      }).sort((p, q) => p.s - q.s || p.id - q.id);

      keyed.forEach((k, i) => {
        const m = members.find((x) => x.elementId === k.id);
        if (m) { m.lineId = lineName(ids); m.lineIndex = i; }
      });
    }

    // ── Orthogonal layer allocation, before the search ──
    //
    // Two beams meeting a column from different directions put their bottom steel at the
    // same distance from the soffit, so the bars occupy the same points in space. That was
    // 6,136 of the flagship's 7,246 prohibited overlaps — not a spacing shortfall (§25.2
    // governs PARALLEL bars and says nothing about crossings) but centrelines passing
    // through one another, which nothing makes buildable.
    //
    // The rank is a property of the LINE, decided once for the floor. A bar that changes
    // elevation between joints is not a detail, it is a bar that moves in mid-air.
    /**
     * A line id is a claim: these members are one continuous, collinear physical run.
     *
     * It is checked rather than trusted. Union-find will happily merge two perpendicular
     * members if any single relation call mislabels them, and the id would then be used to
     * decide bar elevations for both — silently, because a wrong grouping looks exactly
     * like a right one from the outside. Everything downstream of the crossing graph rests
     * on this claim, so it is verified where it is made.
     */
    const lineViolations: Array<{ lineId: string; a: number; b: number; dot: number }> = [];
    for (const [root, ids] of lineMembers) {
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const da = axisOf(ids[i]);
          const db = axisOf(ids[j]);
          if (!da || !db) continue;
          const dot = Math.abs(da.x * db.x + da.y * db.y);
          // The same 0.7 the relation test uses. Below it the two are not collinear and
          // must not be sharing a line.
          if (dot <= 0.7) {
            lineViolations.push({ lineId: lineName(ids), a: ids[i], b: ids[j], dot });
          }
        }
      }
    }
    for (const v of lineViolations) {
      unsupportedRun.push({
        key: 'detailing.line.notCollinear',
        params: { line: v.lineId, a: v.a, b: v.b, dot: Math.round(v.dot * 100) / 100 },
      });
    }

    /**
     * Where a line's members seat their bars, from the node line: each member's top and bottom
     * bars in its own stirrup's bends (`seatedLongitudinalHalfExtents`, as the generator lays
     * them) about its own axis — the node plus its declared insertion, so a top-flush beam seats
     * h/2 lower than a centred one —, highest and lowest over the line.
     */
    const seatsOf = (ids: readonly number[]): Pick<LineForLayering, 'topZ' | 'bottomZ'> => {
      const tops: number[] = [], bots: number[] = [];
      for (const id of ids) {
        const c = input.contexts.get(id), pb = perBeam.get(id);
        if (!c || !pb) continue;
        const ln = memberLine(id);
        const dzs = ln ? [...new Set([ln.offsetI.z, ln.offsetJ.z])] : [0];
        const seat = (d: number) => seatedLongitudinalHalfExtents(c.section.b, c.section.h, c.material.cover, c.material.stirrupDia, d).corner.halfUp;
        for (const dz of dzs) {
          for (const d of new Set([pb.topDia, pb.topMinDia].filter((x) => x > 0))) tops.push(dz + seat(d));
          if (pb.botDia > 0) bots.push(dz - seat(pb.botDia));
        }
      }
      return tops.length && bots.length
        ? { topZ: { hi: Math.max(...tops), lo: Math.min(...tops) }, bottomZ: { hi: Math.max(...bots), lo: Math.min(...bots) } }
        : {};
    };
    const linesForLayering: LineForLayering[] = [];
    for (const [root, ids] of lineMembers) {
      const dir = perBeam.get(ids[0])?.t;
      if (!dir) continue;
      linesForLayering.push({
        lineId: lineName(ids),
        elementIds: ids,
        // perBeam.t is the transverse axis; the line runs perpendicular to it.
        direction: { x: -dir.y, y: dir.x },
        maxBarMm: Math.max(...ids.map((id) => perBeam.get(id)?.dia ?? 0), 0),
        maxBottomMm: Math.max(...ids.map((id) => perBeam.get(id)?.botDia ?? 0), 0),
        maxTopMm: Math.max(...ids.map((id) => perBeam.get(id)?.topDia ?? 0), 0),
        ...seatsOf(ids),
      });
    }
    const lineOfMember = new Map<number, string>();
    for (const l of linesForLayering) for (const id of l.elementIds) lineOfMember.set(id, l.lineId);

    const crossings: LineCrossing[] = [];
    const seenCrossing = new Set<string>();
    for (const j of joints) {
      for (const a of j.elementIds) {
        for (const b of j.elementIds) {
          if (a >= b || j.relation(a, b) !== 'crossing') continue;
          const la = lineOfMember.get(a);
          const lb = lineOfMember.get(b);
          if (!la || !lb || la === lb) continue;
          const key = `${j.jointId}|${la < lb ? la : lb}|${la < lb ? lb : la}`;
          if (seenCrossing.has(key)) continue;
          seenCrossing.add(key);
          crossings.push({ a: la, b: lb, jointId: j.jointId });
        }
      }
    }
    layerDiagnostics = {
      lineOfMember: new Map(lineOfMember),
      crossings: [...crossings],
      lineMax: new Map(linesForLayering.map((l) => [l.lineId, l.maxBarMm])),
      // Every pair the joint graph SAW and how it judged it, so a missing crossing edge
      // can be told apart from one that was seen and skipped.
      relations: (() => {
        const out: Array<{ a: number; b: number; jointId: string; relation: string;
          lineA?: string; lineB?: string }> = [];
        for (const j of joints) {
          for (const a of j.elementIds) {
            for (const b of j.elementIds) {
              if (a >= b) continue;
              out.push({
                a, b, jointId: j.jointId, relation: j.relation(a, b),
                lineA: lineOfMember.get(a), lineB: lineOfMember.get(b),
              });
            }
          }
        }
        return out;
      })(),
    };
    /**
     * How far a line must pass under (top) or over (bottom) the hook bends of a crossing line at
     * the joints where that one ends, beyond contact (`allocateLayers` `bendClearance`).
     *
     * A hooked bar turns down (top) or up (bottom) past the node on a bend of centreline radius
     * `r` ending at its tail plane `at`. The crossing line's corner bar, `a` along it from the
     * node, crosses that bend where `a` lies on the arc: to clear it by the two radii it must lie
     * `r − √((r − ρ)² − (a − at + r)²)` from the run, more than the contact the ranks give. Where
     * the corner reaches the tail itself no depth clears it, and the joint's posts read it. Read
     * from the corner seat because the corner cannot move; a slot inside it threads the bend's
     * keep-out (`bendCrossing`). Measured on the span fixture at 40×40, undeclared: the lower
     * mat's top corner bar 13 mm below the upper's run passed through its Ø16 bend by 2,9 mm.
     */
    const bendExtra = new Map<string, { drop: number; raise: number }>();
    // The layers inside each line's first, at the joints it shares with each crossing line: a
    // line moved off a bend must not land on them (`allocateLayers` `innerLayers`).
    const innerOf = new Map<string, { top: Array<{ depth: number; diaMm: number }>; bottom: Array<{ depth: number; diaMm: number }> }>();
    for (const j of joints) {
      const nodeId = Number(j.jointId.slice(1));
      for (const x of j.elementIds) for (const y of j.elementIds) {
        if (x === y || j.relation(x, y) !== 'crossing') continue;
        const lx = lineOfMember.get(x), ly = lineOfMember.get(y);
        const xc = input.contexts.get(x), info = perBeam.get(x), yEl = input.elements.get(y);
        if (!lx || !ly || !xc || !info || !yEl) continue;
        const yPlan = supportPlanOf(y);
        {
          // The generator steps layer k inside the one above it by the clear owed to the larger
          // bar of the two (`supportRowInto`, `stackedLayerDepth`).
          const inner = innerOf.get(`${lx}|${ly}`) ?? { top: [], bottom: [] };
          const yRows = yPlan?.rows[yEl.nodeI === nodeId ? 'I' : 'J'] ?? [];
          const yc = input.contexts.get(y);
          const ySeat = (dMm: number) => yc
            ? -seatedLongitudinalHalfExtents(yc.section.b, yc.section.h, yc.material.cover, yc.material.stirrupDia, dMm).corner.halfUp
            : dMm / 2000;
          for (const r of yRows) {
            if (r.row > 0) inner[r.position].push({ depth: supportRowInto(yRows, r.position, r.row, r.diameterMm, ySeat, input.edition), diaMm: r.diameterMm });
          }
          innerOf.set(`${lx}|${ly}`, inner);
        }
        for (const t of yPlan?.hookTails(yEl.nodeI === nodeId ? 'I' : 'J') ?? []) {
          if (t.row !== 0) continue;
          const xDia = t.position === 'top' ? info.topDia : info.botDia;
          if (!(xDia > 0)) continue;
          const a = seatedLongitudinalHalfExtents(xc.section.b, xc.section.h, xc.material.cover, xc.material.stirrupDia, xDia).corner.halfAcross;
          const r = standardHook(t.diameterMm, 90, 'longitudinal').centrelineRadius;
          const rho = (t.diameterMm + xDia) / 2000;
          const w = a - (t.at - r);
          if (w <= 0 || w >= r - rho) continue;
          const extra = Math.max(0, r - Math.sqrt((r - rho) ** 2 - w * w) - rho);
          if (!(extra > 0)) continue;
          const key = `${lx}|${ly}`;
          const e = bendExtra.get(key) ?? { drop: 0, raise: 0 };
          if (t.position === 'top') e.drop = Math.max(e.drop, extra); else e.raise = Math.max(e.raise, extra);
          bendExtra.set(key, e);
        }
      }
    }
    layerAllocation = allocateLayers({
      lines: linesForLayering, crossings,
      edition: input.edition,
      extraMargin: input.spacingMargin ?? 0,
      bendClearance: (line, other) => bendExtra.get(`${line}|${other}`),
      innerLayers: (line, other) => innerOf.get(`${line}|${other}`),
    });
    for (const [id, lineId] of lineOfMember) {
      const la = layerAllocation.byLine.get(lineId);
      if (la) {
        layerRaiseOf.set(id, la.bottomRaise);
        layerDropOf.set(id, la.topLower);
      }
    }

    // ── The hook bends of the mats above, now that the ranks are known ──
    //
    // A crossing beam that ends here turns its top bars down past the node: each row's bend
    // sweeps from its run down to its tail, between `at − r` and `at` past the node, across this
    // beam. A layer of this beam's top steel lying below that row's run passes under the bend and
    // through it; one above passes over. So a layer below keeps off the bend, and only one below:
    // the ranks (`layerDropOf`) and the rows' own depths decide which. Measured on qa-8: the lower
    // mat's bar ran through the upper beam's corner bend by 2,6 mm. Read before the ranks, as a
    // keep-out of every layer, it would bar both beams from the band each other's bends sweep.
    {
      // From the node line, each beam's rows on its own axis (the node plus its declared
      // insertion): a top-flush beam's rows stand h/2 lower than a centred one's. Its rows at
      // that support stepped as the generator lays them (`supportRowInto`).
      const rowsAt = new Map<string, readonly SupportRow[]>();
      const zTop = (id: number, dMm: number, layer: number, nodeId: number) => {
        const c = input.contexts.get(id)!;
        const halfUp = (d: number) => seatedLongitudinalHalfExtents(c.section.b, c.section.h, c.material.cover, c.material.stirrupDia, d).corner.halfUp;
        const key = `${id}|${nodeId}`;
        let rows = rowsAt.get(key);
        if (!rows) {
          const el = input.elements.get(id);
          rows = (el ? supportPlanOf(id)?.rows[el.nodeI === nodeId ? 'I' : 'J'] : undefined) ?? [];
          rowsAt.set(key, rows);
        }
        return axisOffsetAt(id, nodeId).z + halfUp(dMm)
          - (layerDropOf.get(id) ?? 0) - supportRowInto(rows, 'top', layer, dMm, (d) => -halfUp(d), input.edition);
      };
      const extra = new Map<number, KeepOut[]>();
      for (const j of joints) {
        const nodeId = Number(j.jointId.slice(1));
        for (const id of j.elementIds) {
          const info = perBeam.get(id);
          const el = input.elements.get(id);
          if (!info || !el || info.topDia <= 0) continue;
          const posts: KeepOut[] = [];
          for (const other of j.elementIds) {
            if (other === id || j.relation(id, other) !== 'crossing') continue;
            const o = input.elements.get(other)!;
            const v = unit(nodePoint(input.nodes.get(o.nodeI)!), nodePoint(input.nodes.get(o.nodeJ)!));
            const side = o.nodeI === nodeId ? 'I' : 'J';
            const k = (side === 'I' ? -1 : 1) * (v.x * info.t.x + v.y * info.t.y);
            for (const t of supportPlanOf(other)?.hookTails(side) ?? []) {
              if (t.position !== 'top') continue;
              const r = standardHook(t.diameterMm, 90, 'longitudinal').centrelineRadius;
              const zRow = zTop(other, t.diameterMm, t.row, nodeId);
              const contact = (t.diameterMm + info.topDia) / 2000;
              for (const layer of [0, 1, 2]) {
                const delta = zRow - zTop(id, info.topDia, layer, nodeId);
                if (delta < contact - 1e-9) continue;
                const band = bendCrossing(t.at, r, contact, delta);
                if (band) posts.push({ at: ((band.lo + band.hi) / 2) * k, halfWidth: (band.hi - band.lo) / 2 - info.dia / 2000 + placement, layers: [layer] });
              }
            }
          }
          if (posts.length === 0) continue;
          const onOurs = onAxis(id, nodeId, info.t, posts);
          j.keepOutsFor.set(id, [...(j.keepOutsFor.get(id) ?? []), ...onOurs]);
          extra.set(id, [...(extra.get(id) ?? []), ...onOurs]);
        }
      }
      // The layouts are laid again with them, so the threaded rows step over the bends too.
      for (const m of members) {
        const more = extra.get(m.elementId);
        const args = domainArgsOf.get(m.elementId);
        if (!more || !args) continue;
        const again = beamLayoutDomain({ ...args, obstacles: [...args.obstacles, ...more] });
        if (again.length > 0) m.domain = again;
      }
    }
    const result = coordinate({ members, joints });
    const slots = new Map<number, number[]>();
    // The layer travels with the position. A candidate arranged in two layers repeats its
    // `across` values by design, and a bare list of them is ambiguous.
    const slotLayers = new Map<number, number[]>();
    for (const [id, layout] of result.assignment) {
      slots.set(id, layout.slots.map((sl) => sl.across));
      slotLayers.set(id, layout.slots.map((sl) => sl.layer ?? 0));
    }

    // ── Plan the physical transition at every joint the assignment closed ──
    //
    // The search only ever asked whether a legal splice EXISTS. That is the right question
    // for arc consistency and the wrong one to stop at: an existence proof does not extend
    // a bar. Here the same clause path is walked again for the assignment that actually
    // won, and this time the schedule is kept — lap length, class, stagger and the
    // longitudinal interval each pair occupies — so `materialiseLaps` can build the steel.
    const transitions: PlannedTransition[] = [];
    for (const [, ids] of lineMembers) {
      if (ids.length < 2) continue;
      const ordered = [...ids].sort((a, b) => {
        const ma = members.find((x) => x.elementId === a);
        const mb = members.find((x) => x.elementId === b);
        return (ma?.lineIndex ?? 0) - (mb?.lineIndex ?? 0);
      });
      for (let i = 0; i + 1 < ordered.length; i++) {
        const aId = ordered[i];
        const bId = ordered[i + 1];
        // The layouts the transition is planned against: the assignment's, or, where the floor's
        // search closed no assignment, each member's own first layout — the one its generator
        // lays without one. A support's splice does not depend on whether the bars thread the
        // column: that clash is the collision check's to report, and a line left with no lap
        // because a joint elsewhere had no layout is a bar with nothing to develop in.
        const unassigned = (id: number) => members.find((x) => x.elementId === id)?.domain[0];
        const la = result.assignment.get(aId) ?? unassigned(aId);
        const lb = result.assignment.get(bId) ?? unassigned(bId);
        const ia = perBeam.get(aId);
        const ib = perBeam.get(bId);
        const ctxA = input.contexts.get(aId);
        const ctxB = input.contexts.get(bId);
        if (!la || !lb || !ia || !ib || !ctxA || !ctxB) continue;

        // The shared node IS the joint. Two members on a line that do not share one are
        // not adjacent, whatever their ordering says.
        const ea = input.elements.get(aId);
        const eb = input.elements.get(bId);
        if (!ea || !eb) continue;
        const shared = [ea.nodeI, ea.nodeJ].find((n) => n === eb.nodeI || n === eb.nodeJ);
        if (shared === undefined) continue;
        const jn = input.nodes.get(shared);
        if (!jn) continue;

        // The lap runs from the joint into the OUTGOING member: its ψt, f'c and fy are read from
        // both (`lineLapDevelopment`). From the incoming one alone, a 30 cm beam lapping into a
        // 50 cm one planned its top bars at ψt = 1,0.
        const dev = lineLapDevelopment(lapMemberOf(ctxA), lapMemberOf(ctxB), Math.max(ia.dia, ib.dia), input.edition);
        const attempt = planSplice({
          from: nodeLine(aId, shared, ia.t, la.slots.map((sl) => sl.across)),
          to: nodeLine(bId, shared, ib.t, lb.slots.map((sl) => sl.across)),
          diameterMm: Math.max(ia.dia, ib.dia),
          development: dev,
          areaRatio: 1.0,
          groups: 1,
          availableLength: (ctxA.L + ctxB.L) / 2,
          edition: input.edition,
          maxAggregateSizeMm: input.maxAggregateSizeMm,
        });
        if (!attempt.ok || !attempt.schedule) continue;

        // Axis points from the `from` member toward the `to` member, which is the
        // direction the continuing bar travels.
        const bMid = (() => {
          const p = input.nodes.get(eb.nodeI);
          const q = input.nodes.get(eb.nodeJ);
          return p && q ? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } : { x: jn.x, y: jn.y };
        })();
        const raw = { x: bMid.x - jn.x, y: bMid.y - jn.y };
        const rl = Math.hypot(raw.x, raw.y) || 1;
        transitions.push({
          jointId: `n${shared}`,
          fromElementId: aId,
          toElementId: bId,
          // On the `from` member's axis at the joint, where its bars are (`memberLine`).
          jointPoint: (() => { const o = axisOffsetAt(aId, shared); return { x: jn.x + o.x, y: jn.y + o.y, z: Z(jn) + o.z }; })(),
          axis: { x: raw.x / rl, y: raw.y / rl, z: 0 },
          across: { x: ia.t.x, y: ia.t.y, z: 0 },
          schedule: attempt.schedule,
          sameSteel: ctxA.material.fy === ctxB.material.fy,
        });
      }
    }

    return { slots, slotLayers, result, transitions };
  }

  const layoutChoice = coordinateBeamLayouts();

  /**
   * Distance from a node to the face of the column supporting it, m.
   *
   * A beam's `L` is node to node and a node is the column CENTRELINE, so a cage generated
   * over `[0, L]` runs through the joint. This is what the beam generator subtracts to stop
   * its stirrups at the support face.
   *
   * ── The plan orientation of a column is not modelled ───────────────
   *
   * A column section carries `b` and `h`, and nothing says which of them lies along which
   * global axis, so the extent along a given beam's axis is somewhere between the two. The
   * SMALLER half-dimension is used, and that choice is deliberate rather than arbitrary: the
   * two errors are not symmetric. Overstating the face leaves beam length with no shear
   * reinforcement, which is a strength deficiency; understating it leaves a stirrup slightly
   * inside the joint, which is a clash the conflict list will report by name. A safety
   * shortfall that nothing measures is worse than a clash that something does.
   *
   * `coordinate-floor` faces the same gap and answers it the same way, with a circumscribed
   * radius rather than an assumed axis. Neither is a substitute for modelling the
   * orientation; both are honest about not having it.
   */
  const supportFaceOffset = (nodeId: number, id: number): number => supportFaceAt(nodeId, id);
  /**
   * How far inside the support face a beam's first stirrup stands (`stirrupInsetI`): its legs
   * clear of the column's face bars by the column's clear distance, those bars a cover, a tie
   * and half a bar inside the face. At a zero-width support on a continuous beam, each
   * automatic cage also needs room for its own closing tails: placing both end stirrups
   * exactly on the shared node fabricates two intersecting pieces.
   */
  const stirrupInsetAt = (nodeId: number, id: number, stirrupDiaMm: number, closingDiaMm: number): number => {
    // A construction choice, not a new code minimum. One diameter covers the half-diameter
    // closing offset plus the bar radius. Each neighbouring cage stays on its own side.
    // Explicit line cages retain their prescribed stations. Positive-width supports already
    // separate the beam cages at their faces.
    let inset = supportFaceOffset(nodeId, id) === 0 && lineContinuesAt(id, nodeId)
      && !input.linePieces?.get(id)?.stirrups.length ? closingDiaMm / 1000 : 0;
    for (const cid of columns) {
      const c = input.elements.get(cid);
      if (!c || (c.nodeI !== nodeId && c.nodeJ !== nodeId)) continue;
      const cctx = input.contexts.get(cid);
      const bars = columnBars(detailableReinforcement(input.outcomes.get(cid))?.rebar as never);
      if (!cctx || !bars) continue;
      const clear = minClearSpacingColumn(input.edition, { barDiameterMm: bars.diameterMm, maxAggregateSizeMm: input.maxAggregateSizeMm }).minClear;
      // Half the stirrup, and half again for its closing tails, which stand that far out of its
      // plane (`buildClosedStirrup`'s `gap`).
      inset = Math.max(inset, stirrupDiaMm / 1000 + clear - cctx.material.cover - cctx.material.stirrupDia / 1000);
      const beam = input.elements.get(id), line = memberLine(id);
      if (beam && line) {
        const origin = nodeId === beam.nodeI ? line.i : line.j;
        const toward = nodeId === beam.nodeI ? line.j : line.i;
        inset = Math.max(inset, columnStirrupClearanceInset({
          bars: memberBarsById.get(cid)?.bars ?? [], origin, axis: unit(origin, toward),
          beamHeight: input.contexts.get(id)?.section.h ?? 0,
          supportFace: supportFaceOffset(nodeId, id), clear, stirrupDiaMm,
        }));
      }
    }
    return inset;
  };

  /**
   * Whether the line continues past `nodeId`: another detailed beam frames in there along the
   * same axis (the coordination's `collinear` test, |cos| > 0,7). Its bars end in the line's
   * laps; elsewhere they end, anchored, in the column.
   */
  /**
   * Longitudinal beam bars whose run lies outside the section: across or up from the member's
   * axis farther than a bar of that diameter seated in the stirrup can be (b/2 or h/2, less the
   * cover, the stirrup and half the bar; 2 mm of placement allowance). Read at the run's middle,
   * the straight that is the bar — a hook's tail belongs to the support it turns into.
   */
  const coverViolations = (bars: readonly BarPath[]): UnsupportedCondition[] => {
    const out: UnsupportedCondition[] = [];
    for (const bar of bars) {
      if (bar.role !== 'longitudinal') continue;
      const owner = bar.ownerElementIds.find((id) => input.contexts.get(id)?.elementType === 'beam');
      const ctx = owner !== undefined ? input.contexts.get(owner) : undefined;
      const el = owner !== undefined ? input.elements.get(owner) : undefined;
      const a = el && input.nodes.get(el.nodeI), b = el && input.nodes.get(el.nodeJ);
      if (!ctx || !el || !a || !b || !bar.ownerElementIds.every((id) => input.contexts.get(id)?.elementType === 'beam')) continue;
      const run = bar.segments.filter((sg) => sg.kind === 'straight')
        .sort((p, q) => Math.hypot(q.end.x - q.start.x, q.end.y - q.start.y, q.end.z - q.start.z)
          - Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y, p.end.z - p.start.z))[0];
      if (!run) continue;
      const m = { x: (run.start.x + run.end.x) / 2, y: (run.start.y + run.end.y) / 2, z: (run.start.z + run.end.z) / 2 };
      // From the member's axis, the node plus its declared insertion (`memberLine`): the section
      // the bar must lie in is round that, not round the node.
      const ln = memberLine(owner!);
      const pa = ln?.i ?? nodePoint(a), pb = ln?.j ?? nodePoint(b);
      const u = unit(pa, pb);
      const t = { x: u.y, y: -u.x };
      const tl = Math.hypot(t.x, t.y) || 1;
      const across = Math.abs(((m.x - pa.x) * t.x + (m.y - pa.y) * t.y) / tl);
      const up = Math.abs(m.z - pa.z);
      const seat = (half: number) => half - ctx.material.cover - ctx.material.stirrupDia / 1000 - bar.diameterMm / 2000 + 0.002;
      const maxAcross = seat(ctx.section.b / 2), maxUp = seat(ctx.section.h / 2);
      if (across <= maxAcross + 1e-9 && up <= maxUp + 1e-9) continue;
      const params = {
        bar: bar.id, element: owner!, across: Math.round(across * 1000) / 1000, up: Math.round(up * 1000) / 1000,
        maxAcross: Math.round(maxAcross * 1000) / 1000, maxUp: Math.round(maxUp * 1000) / 1000,
      };
      out.push({
        key: 'detailing.cover.violated', scope: { elementIds: [owner!] },
        message: `${bar.id}: |${params.across}| > ${params.maxAcross} m / |${params.up}| > ${params.maxUp} m`,
        params, refs: [],
      });
    }
    return out;
  };


  /**
   * The stirrups the design verified for a beam, by region, with the verifier's regions: from
   * each node to the critical section d past the face (`computeBeamCriticalSections` on the
   * member's own model slice, as `verifyProvidedReinforcement` reads it), or `regionT` of the
   * length where there is no geometry.
   */
  const designedStirrupsOf = (id: number, rebar: ProvidedReinforcement | undefined) => {
    const ctx = input.contexts.get(id);
    const support = rebar?.regions?.stirrupsSupport ?? rebar?.stirrups;
    const span = rebar?.regions?.stirrupsSpan ?? rebar?.stirrups;
    if (!ctx || !support || !span) return undefined;
    const md = ctx.modelData;
    const cs = ctx.criticalSections ?? (md?.nodes && md.elements && md.sections && md.supports ? computeBeamCriticalSections(
      id, md.nodes, md.elements as never, md.sections as never, md.supports as never,
      { b: ctx.section.b, h: ctx.section.h, cover: ctx.material.cover, stirrupDia: ctx.material.stirrupDia },
    ) ?? undefined : undefined);
    const t = rebar?.regions?.regionT ?? 0.25;
    return {
      support, span,
      regionI: (cs ? cs.start.tCritShear : t) * ctx.L,
      regionJ: (cs ? cs.end.tCritShear : t) * ctx.L,
    };
  };

  // ── Beams ──
  for (const id of beams) {
    const ctx = input.contexts.get(id)!;
    const el = input.elements.get(id);
    const accepted = detailableReinforcement(input.outcomes.get(id))?.rebar;
    const opts = groupOptsFor(id);
    const groups = accepted && opts ? beamGroups(accepted, opts) : null;
    if (!el || !groups) {
      /**
       * A refusal that SAYS SO, rather than one that leaves an empty beam.
       *
       * `skipped` is read by nothing, so before this a beam that lost its steel arrived at the
       * viewer with a cage of somebody else's joint ties and no explanation. When the top-steel
       * resolver is what refused — a support that hogs with no designed steel, or a web too
       * narrow to host two bars of any standard diameter — it has a sentence about why, and a
       * zero-bar member record carries it into the assembly's unsupported conditions, which the
       * sheets, the panels and the constructibility gate all read.
       *
       * Only for THAT refusal. The pre-existing ones (no rebar at all, no element) keep their
       * behaviour, so no assembly gains a member because this branch exists.
       */
      const rebar = accepted?.regions;
      const hasBottom = !!(rebar?.bottomSpan?.count || accepted?.bottom?.count);
      const p = el && opts && hasBottom ? resolveTopSteelFor(accepted!, opts) : null;
      const reasons = p
        ? [...new Set([p.start, p.end].filter((x) => x.blocked).map((x) => x.note))] : [];
      // The old key said "no top or bottom steel was accepted for this beam" and the bottom
      // face WAS accepted. A reason that misdescribes the case is not better than none.
      skipped.push({
        elementId: id,
        key: reasons.length > 0
          ? 'detailing.skip.noBeamBarsBottomOnly' : 'detailing.skip.noBeamBars',
      });
      if (p && reasons.length > 0) {
        const blocked = p.start.blocked ?? p.end.blocked!;
        memberBarsById.set(id, {
          elementId: id,
          bars: [],
          requiredTransversePieces: 0,
          unsupported: reasons,
          maturity: 'UNSUPPORTED',
          refs: [...p.start.refs, ...p.end.refs],
          trace: [
            `Elemento ${id}: no se generó armadura longitudinal ni jaula de estribos.`,
            ...reasons,
          ],
        });
        unsupportedRun.push({ key: blocked.key, params: { element: id, ...blocked.params } });
      }
      continue;
    }
    const nI = input.nodes.get(el.nodeI);
    const nJ = input.nodes.get(el.nodeJ);
    if (!nI || !nJ) { skipped.push({ elementId: id, key: 'detailing.skip.missingNode' }); continue; }

    const stations = envelopeStations(ctx);
    if (stations.length < 3) { skipped.push({ elementId: id, key: 'detailing.skip.tooFewStations' }); continue; }

    const anchor = anchorageFunctions({
      fy: ctx.material.fy, fc: ctx.material.fc,
      favourableSpacing: true,
      // §25.4.2.5: top bars with more than 300 mm of concrete cast below take ψt = 1,3.
      psiT: ctx.section.h > 0.3 ? 1.3 : 1.0,
      edition: input.edition,
    } as never);

    const designedStirrups = designedStirrupsOf(id, accepted);
    const supportPlan = supportPlanOf(id);
    const gen = generateBeamBars({
      closureCache,
      elementId: id,
      L: ctx.L, b: ctx.section.b, h: ctx.section.h,
      // Raising the steel costs lever arm. The generator must size stirrup zones and
      // curtailment against the depth the bars ACTUALLY have, not the one they were
      // designed with — see the re-verification pass below.
      d: depthAfterRaise(
        ctx.section.h - ctx.material.cover - ctx.material.stirrupDia / 1000,
        layerRaiseOf.get(id) ?? 0),
      // The bars seat in the stirrups that are laid: the designed ones.
      cover: ctx.material.cover,
      stirrupDia: designedStirrups
        ? Math.max(designedStirrups.support.diameter, designedStirrups.span.diameter) : ctx.material.stirrupDia,
      fc: ctx.material.fc, fy: ctx.material.fy,
      maxAggregateSizeMm: input.maxAggregateSizeMm,
      edition: input.edition,
      stations,
      // Every bar end by the plan the design verified (`supportPlanOf`).
      ...(supportPlan ? {
        supportEnd: supportPlan.plan, topRowsAt: supportPlan.topRowsAt,
        simpleSupport: supportPlan.simple,
      } : {}),
      ...(designedStirrups ? { designedStirrups } : {}),
      supportI: supportKindAt(el.nodeI, id, input.elements),
      supportJ: supportKindAt(el.nodeJ, id, input.elements),
      vn: Math.max(...stations.map((s) => s.v), 1),
      bottom: groups.bottom, topStart: groups.topStart, topEnd: groups.topEnd,
      topPurpose: groups.topPurpose,
      lateralSystem: lateralOf(id),
      ...(lateralOf(id) && !(input.lateralSystem?.has(id) ?? false) && (raw.contexts.get(id)?.lateral?.role ?? 'undeclared') === 'undeclared' ? { lateralAssumed: true } : {}),
      ld: anchor.ld,
      // The member's axis as the analysis took it: the nodes plus the declared insertion
      // (`memberLine`). Laid round the nodes, a top-flush beam's top bars stood h/2 above its
      // top face — above the slab it is flush with.
      origin: memberLine(id)?.i ?? nodePoint(nI),
      axis: memberLine(id) ? unit(memberLine(id)!.i, memberLine(id)!.j) : unit(nodePoint(nI), nodePoint(nJ)),
      up: { x: 0, y: 0, z: 1 },
      supportFaceI: supportFaceOffset(el.nodeI, id),
      supportFaceJ: supportFaceOffset(el.nodeJ, id),
      stirrupInsetI: stirrupInsetAt(el.nodeI, id, ctx.material.stirrupDia, designedStirrups
        ? Math.max(designedStirrups.support.diameter, designedStirrups.span.diameter) : ctx.material.stirrupDia),
      stirrupInsetJ: stirrupInsetAt(el.nodeJ, id, ctx.material.stirrupDia, designedStirrups
        ? Math.max(designedStirrups.support.diameter, designedStirrups.span.diameter) : ctx.material.stirrupDia),
      transverseSlots: layoutChoice.slots.get(id),
      transverseLayers: layoutChoice.slotLayers.get(id),
      layerRaise: layerRaiseOf.get(id) ?? 0,
      layerDrop: layerDropOf.get(id) ?? 0,
      bentUp: input.bentUp ?? { seismicDesign: 'unstated', optOut: false },
      ...(accepted?.regions?.skin ? { skin: accepted.regions.skin } : {}),
      ...(input.webOpenings?.get(id)?.length ? { webOpenings: input.webOpenings.get(id)! } : {}),
      ...(input.linePieces?.get(id)?.bars.length
        ? { lineBars: input.linePieces.get(id)!.bars, lineStirrups: input.linePieces.get(id)!.stirrups }
        : input.memberCuts?.get(id) ? { cuts: input.memberCuts.get(id) } : {}),
      ...(accepted?.regions?.bottomGroups?.some((g) => g.anchorageStart === 'hook' || g.anchorageEnd === 'hook') ? { bottomHooks: {
        start: accepted.regions.bottomGroups.some((g) => g.anchorageStart === 'hook'),
        end: accepted.regions.bottomGroups.some((g) => g.anchorageEnd === 'hook'),
      } } : {}),
    } as never);

    for (const [barId, layer] of Object.entries(gen.barLayers)) barLayers.set(barId, layer);
    for (const l of gen.drawnLaps) drawnLaps.push({ ...l, elementId: id });
    // The laps the saved line draws with their middle in this member, against the splice length the
    // larger bar needs (§25.5.2), measured on the whole line where the whole overlap is.
    for (const { lap } of (input.lineLaps ?? []).filter((x) => x.owner === id)) {
      const need = anchor.lapSplice(lap.diameterMm);
      const where = `${lap.count}Ø${lap.diameterMm} ${lap.face === 'top' ? 'superiores' : 'inferiores'}, x = ${lap.from.toFixed(2)}–${lap.to.toFixed(2)} m de la línea`;
      if (lap.length < need - 1e-3) {
        gen.unsupported.push(`Solape dibujado de ${where}: ${lap.length.toFixed(2)} m, menor que la longitud de empalme ℓst = ${need.toFixed(2)} m (25.5.2).`);
      } else {
        gen.trace.push(`Solape dibujado de ${where}: ${lap.length.toFixed(2)} m, cubre ℓst = ${need.toFixed(2)} m (25.5.2).`);
      }
    }

    // ── The transverse cage joins the assembly ──
    //
    // Until this line the stirrups and crossties were fabricated and then dropped: real
    // `BarPath`s with hooks, mandrels and cutting lengths that nothing downstream could see.
    // No collision geometry, no mark, no schedule row, no mass, nothing in any export. The
    // cage existed in `gen.transverse` and the assembly's bar list did not contain it.
    //
    // Appending it is what makes every downstream consumer read one bar list. It also
    // exposes the cage to the collision detector for the first time, which is the point:
    // steel that nothing checks is steel nobody can trust.
    const transversePaths = gen.transverse.map((p) => p.path);

    // What the ZONES require, computed from the zones — not from `gen.transverse.length`.
    //
    // Reading the requirement off the output would make the gate self-satisfying: a
    // generator that emitted nothing would require nothing and pass. This mirrors the
    // generator's own zone walk (one closed stirrup plus `legs − 2` crossties at every
    // station the spacing produces) from the design-layer instruction, so the two numbers
    // are produced independently and a disagreement is visible.
    let requiredTransversePieces = 0;
    for (let zi = 0; zi < gen.stirrupZones.length; zi++) {
      const z = gen.stirrupZones[zi];
      const next = gen.stirrupZones[zi + 1];
      const stations = stirrupStationCount(
        z.from, z.to, z.spacing,
        next !== undefined && Math.abs(next.from - z.to) < 1e-9);
      requiredTransversePieces += stations * (1 + Math.max(0, Math.floor(z.legs) - 2));
    }

    memberBarsById.set(id, {
      elementId: id,
      bars: [...gen.bars, ...transversePaths],
      requiredTransversePieces,
      unsupported: gen.unsupported,
      maturity: deriveMaturity({
        implemented: true, refs: [...gen.refs, ...anchor.refs], benchmarks: [],
      }).maturity,
      refs: [...gen.refs, ...anchor.refs, ...groups.provisions.start.refs,
        ...groups.provisions.end.refs],
      /**
       * The top-steel decision joins the trace whichever way it went.
       *
       * A reader asking "why is there 2Ø10 up there" must find the answer on the member, not
       * only in a module's header — and the answer differs at the two supports, so both are
       * stated rather than one summarised.
       */
      trace: [
        ...gen.trace,
        ...(groups.topPurpose.start === 'stirrupHanger'
          ? [`Apoyo i: ${groups.provisions.start.note}`] : []),
        ...(groups.topPurpose.end === 'stirrupHanger'
          ? [`Apoyo j: ${groups.provisions.end.note}`] : []),
        // Where the bars were laid from: the declared insertion, or the assumption that the
        // axis runs through the nodes.
        ...(memberLine(id) ? [referenceLineNote(memberLine(id)!)] : []),
      ],
    });
  }

  // ── Materialise the laps: schedules become steel ──
  //
  // Until this runs, the "coordinated" floor is two members meeting end to end with a
  // compatibility claim between them. Nothing is continuous, nothing is lapped, and the
  // collision engine sees two independent bar sets sharing a joint with no reason to be
  // there. Every conflict count taken before this point was measured on that state.
  const materialised = materialiseLaps({
    barsByMember: new Map([...memberBarsById].map(([id, mb]) => [id, mb.bars])),
    transitions: layoutChoice.transitions,
  });
  for (const [id, bars] of materialised.barsByMember) {
    const mb = memberBarsById.get(id);
    if (mb) mb.bars = bars;
  }
  columnIndex = null; // Laps replaced geometry: subsequent queries need its new bounds.

  // ── The ends the laps did not take ──
  //
  // A bar the generator left `pending` at a support where the line continues was neither fused
  // nor lapped: its partner across the joint did not exist (the two sides carry different
  // counts) or the joint got no transition. It ends at the column's far face, so it has the
  // column's depth past the near face to develop in. Straight when that is enough; otherwise
  // it is not resolved, and says so.
  for (const mb of memberBarsById.values()) {
    mb.bars = mb.bars.map((bar) => {
      const a = bar.anchorage;
      if (!a || (a.start?.solution !== 'pending' && a.end?.solution !== 'pending')) return bar;
      const settle = (r: typeof a.start) => r && r.solution === 'pending'
        ? { ...r, solution: r.available >= r.required - 1e-9 ? 'straight' as const : 'unresolved' as const } : r;
      const start = settle(a.start), end = settle(a.end);
      return { ...bar, anchorage: { ...(start ? { start } : {}), ...(end ? { end } : {}) } };
    });
  }
  // The laps a saved line draws, declared as laps: the pair is intended, and the collision check
  // reads it as one (`isLapPair`). A pair farther apart than §25.5.1.3 allows is said so.
  for (const d of drawnLaps) {
    const bar = memberBarsById.get(d.elementId)?.bars.find((b) => b.id === d.fromBarId);
    const db = (bar?.diameterMm ?? 0) / 1000;
    const len = Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y, d.to.z - d.from.z);
    const maxOffset = Math.min(len / 5, 0.15);
    const contact = d.offset <= db + 0.002;
    if (!contact && d.offset > maxOffset + 1e-6) {
      memberBarsById.get(d.elementId)?.unsupported.push(`Solape dibujado de ${d.fromBarId} y ${d.toBarId}: barras a ${(d.offset * 1000).toFixed(0)} mm entre ejes, más que ${(maxOffset * 1000).toFixed(0)} mm (25.5.1.3).`);
    }
    materialised.laps.push({
      jointId: `drawn:e${d.elementId}`, fromElementId: d.elementId, toElementId: d.elementId,
      fromBarId: d.fromBarId, toBarId: d.toBarId, from: d.from, to: d.to, lapLength: len,
      kind: contact ? 'contactLap' : 'nonContactLap', spliceClass: 'B', offset: d.offset,
      maxOffset: contact ? Infinity : maxOffset, refs: [clause('cirsoc-201', input.edition, '25.5.1.3', 'empalmes por yuxtaposición sin contacto')],
    });
  }
  const laps = lapIndex(materialised.laps);
  lapLookup = (aId: string, bId: string) => {
    const lap = lapBetween(laps, aId, bId);
    return lap ? (lap.kind === 'contactLap' ? 'contact' : 'nonContact') : undefined;
  };

  // ── Authoritative re-verification at the FINAL geometry ──
  //
  // The layer allocation moved steel, and lever arm is what flexure is made of. A rank-1
  // line on Ø16 bars loses 16 mm of d, and on a shallow member that is the difference
  // between passing and not. On top of that sits Table 26.6.2.1(a)'s unfavourable
  // tolerance on d, which is a real prescribed number and applies whether or not anything
  // moved.
  //
  // Without a verifier nothing is reverified and `reverifiedMembers` stays at zero. That
  // is the honest reading: the check was not run, so the claim is not available.
  /**
   * One explicit record per applicable element. Silence is a failing invariant.
   *
   * `noBars` is not the same as `fail`: a member the generator produced no physical steel
   * for has nothing to reverify, and reporting that as a verification failure would send
   * an engineer looking at the wrong thing. It is still not a pass.
   */
  const reverification = new Map<number, ReverificationStatus>();
  /** The geometry each member was judged at, kept so a repair can act on it. */
  const finalGeometryOf = new Map<number, FinalGeometryRecord['finalGeometry']>();
  for (const [id, ctx] of input.contexts) {
    const nominalD = ctx.section.h - ctx.material.cover - ctx.material.stirrupDia / 1000;
    const tol = prescribedTolerances(nominalD, ctx.material.cover, input.edition);
    // Each face carries its OWN movement.
    //
    // Passing the worse of the two to both was a conservative simplification, and on this
    // fixture it was conservative enough to matter: beams 7 and 8 came out at ratio 1,031
    // — three per cent over — by being charged the top face's drop on the bottom face as
    // well. The two are tracked separately upstream and there is no reason to merge them.
    // Table 26.6.2.1(a)'s tolerance applies to both, because it applies to d itself.
    const geom = {
      bottomRaise: layerRaiseOf.get(id) ?? 0,
      topLower: layerDropOf.get(id) ?? 0,
      depthTolerance: tol.depth,
    };
    finalGeometryOf.set(id, geom);
    // Every applicable element gets a record, including one with no generated bars.
    // Skipping those silently is how the gate came to count `elementIds.length` as
    // applicable while only ever reverifying the subset that had geometry.
    if (!memberBarsById.has(id)) { reverification.set(id, 'noBars'); continue; }
    // The geometry is recorded even without a verifier, because a caller that supplies one
    // on the NEXT pass still needs to know what this pass produced.
    reverification.set(id, input.reverify ? input.reverify(id, geom) : 'noVerifier');
  }
  /**
   * The reportable record, with the layer elevations MEASURED on the finished bars.
   *
   * Reading them off the output rather than off the allocation is deliberate: the whole
   * point of this pass is that the intended geometry and the built geometry have disagreed
   * before — `applyJointLayers` flattened two-layer mats while the allocation was correct.
   */
  const reverificationRecords: FinalGeometryRecord[] = [...input.contexts.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const byLayer = new Map<string, number[]>();
      for (const bar of memberBarsById.get(id)?.bars ?? []) {
        // Longitudinal only. A layer centroid is a statement about flexural lever arm, and
        // the cage now shares this bar list — a stirrup carries a `layerId` of its own
        // (`e5:support:0:stirrup`) and averaging it in would put the reported centroid
        // somewhere between the top and bottom mats, on every member.
        if (bar.role !== 'longitudinal') continue;
        if (!bar.layerId) continue;
        const z = bar.segments[0]?.start.z;
        if (z === undefined) continue;
        byLayer.set(bar.layerId, [...(byLayer.get(bar.layerId) ?? []), z]);
      }
      return {
        elementId: id,
        status: reverification.get(id) ?? 'noVerifier',
        finalGeometry: finalGeometryOf.get(id)
          ?? { bottomRaise: 0, topLower: 0, depthTolerance: 0 },
        layerCentroids: [...byLayer.values()]
          .map((zs) => zs.reduce((s, z) => s + z, 0) / zs.length)
          .sort((a, b) => b - a),
      };
    });

  // ── Group into one assembly per level, and coordinate each ──
  const levelOf = (id: number): number => {
    const el = input.elements.get(id);
    if (!el) return 0;
    const a = input.nodes.get(el.nodeI);
    const b = input.nodes.get(el.nodeJ);
    // A beam sits at its own level; a column stack is filed at the level it starts from.
    return Math.round(Math.max(Z(a ?? { id: 0, x: 0, y: 0 }), Z(b ?? { id: 0, x: 0, y: 0 })) * 100) / 100;
  };

  const byLevel = new Map<number, MemberBars[]>();
  for (const [id, mb] of memberBarsById) {
    const lvl = levelOf(id);
    const list = byLevel.get(lvl) ?? [];
    list.push(mb);
    byLevel.set(lvl, list);
  }

  /**
   * Plan offsets of the column bars at each level, taken from the bars the generator
   * actually produced rather than recomputed. Threading has to dodge the real cage.
   */
  const columnBarsAtLevel = (level: number, centre: { x: number; y: number }) => {
    const out = columnBarsIndex().query(centre, level, 1.5).map((bar) => ({
      id: bar.id, diameterMm: bar.diameterMm, dx: bar.x - centre.x, dy: bar.y - centre.y,
    }));
    return out.sort((a, b) => a.id.localeCompare(b.id));
  };

  // Built at the first joint, after longitudinal geometry is final. The joint loop only
  // adds transverse bars, so every column can share these extents for this run.
  let jointBarExtents: Map<string, { lo: number; hi: number }> | undefined;

  // Fusion stores a continuous bar only in the last span, but every span still owns it.
  // Joint cages must see that steel for their mat clearance, crosstie orientation and
  // containment declarations. Index the final paths by physical ownership, not storage.
  const beamBarsByOwner = new Map<number, BarPath[]>(beams.map(id => [id, []]));
  for (const mb of memberBarsById.values()) for (const bar of mb.bars) {
    if (bar.role !== 'longitudinal') continue;
    for (const owner of bar.ownerElementIds) beamBarsByOwner.get(owner)?.push(bar);
  }

  // ── §15.4 — the joint gets its own transverse reinforcement ──
  //
  // Beam stirrups stop at the support face, which is where a beam's shear reinforcement
  // belongs. That leaves the joint volume, and the joint is not reinforced by either beam:
  // what confines it is the COLUMN's tie cage, continued through, perpendicular to the column
  // axis. §15.3.1.2 says so, and refers the geometry to §25.7.2.
  //
  // This was never modelled. Before the support-face clamp the joint merely CONTAINED steel —
  // the two beams' stirrups, lying in the beams' own section planes, at right angles to the
  // ties the clause asks for, and clashing with each other. Something in the right place is
  // not the right thing, and the gap only became visible once the wrong thing was removed.
  //
  // Fabricated here rather than in `generate-column` because the joint is a property of the
  // NODE, not of either member: its depth is set by the deepest beam framing into it, and no
  // single member knows that.
  for (const cid of columns) {
    const cEl = input.elements.get(cid);
    const cCtx = input.contexts.get(cid);
    const cMb = memberBarsById.get(cid);
    if (!cEl || !cCtx || !cMb) continue;
    const nI = input.nodes.get(cEl.nodeI);
    const nJ = input.nodes.get(cEl.nodeJ);
    if (!nI || !nJ) continue;
    const top = Z(nI) >= Z(nJ) ? nI : nJ;

    // Joint depth is the deepest beam framing in: the joint is as deep as the members that
    // form it, and a tie above the shallowest beam's soffit is still inside the joint. Each
    // beam stands on its own axis — the node plus its declared insertion — so the joint is the
    // band from the lowest soffit to the highest top face, [node − h, node] for top-flush beams;
    // node ± depth/2 is that band only where they are centred on the node.
    let depth = 0, jointLo = Infinity, jointHi = -Infinity;
    for (const bid of beams) {
      const bEl = input.elements.get(bid);
      if (!bEl || (bEl.nodeI !== top.id && bEl.nodeJ !== top.id)) continue;
      const h = input.contexts.get(bid)?.section.h ?? 0;
      depth = Math.max(depth, h);
      if (h > 0) {
        const dz = axisOffsetAt(bid, top.id).z;
        jointLo = Math.min(jointLo, Z(top) + dz - h / 2);
        jointHi = Math.max(jointHi, Z(top) + dz + h / 2);
      }
    }
    if (depth <= 0) continue;   // a column with no beam at its top has no joint.
    const centred = Math.abs(jointLo - (Z(top) - depth / 2)) < 1e-9 && Math.abs(jointHi - (Z(top) + depth / 2)) < 1e-9;
    // Kept exactly node ± depth/2 where it is, so a model that declares no insertion is unchanged.
    if (centred) { jointLo = Z(top) - depth / 2; jointHi = Z(top) + depth / 2; }
    const jointMid = centred ? Z(top) : (jointLo + jointHi) / 2;
    // The cage is the column's: round its axis, the node plus its declared insertion.
    const colOff = axisOffsetAt(cid, top.id);
    const cageCentre = { x: top.x + colOff.x, y: top.y + colOff.y };

    const cAccepted = detailableReinforcement(input.outcomes.get(cid))?.rebar;
    const longDia = (cAccepted ? columnBars(cAccepted)?.diameterMm : undefined)
      ?? cCtx.material.stirrupDia;
    const ts = tieSpacing(longDia, cCtx.material.stirrupDia,
      Math.min(cCtx.section.b, cCtx.section.h), input.edition);
    // §15.3.1.4: within the depth of the deepest beam framing into the joint, the
    // transverse joint reinforcement spacing must not exceed 200 mm. The §10.7.6.2
    // column-tie value can exceed it (16·Ø20 = 320 mm), so the cap is applied here,
    // on the joint, not inside `tieSpacing` (which is correct for the column itself).
    const jointSpacing = Math.min(ts.spacing, 0.2);
    const jointSpacingBy = ts.spacing <= 0.2 ? ts.governedBy : '§15.3.1.4 (200 mm)';

    // The column bars this cage has to enclose, in the TIE's section frame. The tie lies in
    // the horizontal plane, so `up` is taken as global x and `across` as global y — the same
    // arbitrary-but-stated choice the support-face offset had to make, for the same reason:
    // a column section carries `b` and `h` and nothing says which lies along which axis.
    // The bars the tie can grip, WITH the elevation each one actually reaches.
    //
    // A tie is a horizontal loop at one elevation, and a column bar is only there to be held
    // if it extends that far. At a ROOF termination the hook-tier lift shortens some bars by
    // up to a few diameters plus their clearance gaps, so the uppermost ties in a joint band
    // can sit above a bar that stops below them. Judging containment at the node's elevation
    // credits every tie with a bar that only some of them reach.
    if (!jointBarExtents) {
      jointBarExtents = new Map();
      for (const mb of memberBarsById.values()) {
        for (const bar of mb.bars) {
          if (bar.role !== 'longitudinal') continue;
          const zs = bar.segments.flatMap((sg) => [sg.start.z, sg.end.z]);
          jointBarExtents.set(bar.id, { lo: Math.min(...zs), hi: Math.max(...zs) });
        }
      }
    }
    const columnBarExtent = jointBarExtents;
    // Read at the middle of the joint, where the ties go: at the node, a top-flush joint's top
    // face, a roof column's bars (stopped a cover below it) were not found and the ties held none.
    const plan = columnBarsAtLevel(jointMid, cageCentre);
    const cageBarsAt = (z: number) => plan
      .filter((p) => {
        const e = columnBarExtent.get(p.id);
        return e === undefined || (e.lo <= z + 0.002 && e.hi >= z - 0.002);
      })
      .map((p) => ({ id: p.id, across: p.dy, up: p.dx, diameterMm: p.diameterMm }));
    const cageBars = cageBarsAt(jointMid);

    // ── The band a joint tie can actually occupy ──
    //
    // A joint tie is a closed rectangle in a HORIZONTAL plane, and a beam's longitudinal steel
    // is horizontal too. They are coplanar, not crossing: a tie placed at the elevation of a
    // beam's top mat does not pass over those bars, it passes THROUGH them. Measured before
    // this clamp: three prohibited overlaps and eleven near-misses, every one a tie at a beam
    // bar's own elevation.
    //
    // So the ties go where they physically go on site — the clear band between the incident
    // beams' bottom steel and their top steel. That is not a simplification of the clause; it
    // is the only place in the joint a horizontal tie fits.
    const incidentBeams = beams.filter((bid) => {
      const bEl = input.elements.get(bid);
      return !!bEl && (bEl.nodeI === top.id || bEl.nodeJ === top.id);
    });
    // Adjacent spans can name the same fused bar; evaluate its geometry once per joint.
    const throughBars = [...new Map(incidentBeams.flatMap(id => beamBarsByOwner.get(id) ?? [])
      .map(bar => [bar.id, bar])).values()];
    const tieR = cCtx.material.stirrupDia / 2000;
    let bandLo = jointLo;
    let bandHi = jointHi;
    /**
     * Squeeze the band away from one obstructing elevation.
     *
     * The reservation is the two radii PLUS the code's minimum clear spacing, not bare
     * contact. A tie resting against the bar above it satisfies no clause and leaves nowhere
     * for concrete to pass: measured, a tie placed at contact with a roof-hook tail came out
     * 7 mm clear against the 40 mm §25.2.3 asks of steel running alongside in a column.
     */
    const jointClear = minClearSpacingColumn(input.edition, {
      barDiameterMm: longDia, maxAggregateSizeMm: input.maxAggregateSizeMm,
    });
    const keepClearOf = (zc: number, diameterMm: number, from: 'mat' | 'roofHook') => {
      const keepOut = diameterMm / 2000 + tieR + jointClear.minClear;
      // A roof hook is a TOP-of-joint termination whatever elevation tier it landed on, so it
      // always brings the ceiling down. Sorting it by whether it happens to sit above or below
      // the node splits the band in two and leaves neither half usable — measured, both joints
      // of the feasible frame reported no room at all when the tier-0 tail, sitting exactly at
      // the node, was read as a floor for the tails beneath it.
      if (from === 'roofHook' || zc >= jointMid) bandHi = Math.min(bandHi, zc - keepOut);
      else bandLo = Math.max(bandLo, zc + keepOut);
    };
    for (const bar of throughBars) {
      // The mat is where the bar's RUN lies: its longest straight segment. The midpoint of all
      // its elevations put a bar hooked down into the column halfway down its own tail, and the
      // band then admitted ties at the elevation of the mat itself.
      const run = bar.segments.filter((sg) => sg.kind === 'straight')
        .sort((p, q) => Math.hypot(q.end.x - q.start.x, q.end.y - q.start.y, q.end.z - q.start.z)
          - Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y, p.end.z - p.start.z))[0];
      const zs = run ? [run.start.z, run.end.z] : bar.segments.flatMap((sg) => [sg.start.z, sg.end.z]);
      keepClearOf((Math.min(...zs) + Math.max(...zs)) / 2, bar.diameterMm, 'mat');
    }
    // ── And of the COLUMN's own steel where it turns horizontal ──
    //
    // A column bar is vertical and a horizontal tie crosses it, which is fine. Its roof hook
    // is not: at a roof termination the bar bends inward at the top and its tail lies FLAT
    // inside the joint, in the same plane a tie wants. `generate-column` staggers those tails
    // across elevation tiers so they do not collide with each other, which spreads them
    // through the joint band rather than concentrating them.
    //
    // Measured on the feasible-frame fixture: a tier's tail crossed the tie leg at −9,5 mm.
    // The tail is anchorage the clause requires and the tie is reinforcement §15.4.2 requires,
    // so neither yields — the band does.
    for (const bar of memberBarsById.get(cid)?.bars ?? []) {
      if (bar.role !== 'longitudinal') continue;
      for (const sg of bar.segments) {
        // Horizontal within the joint: a run whose ends share an elevation but not a position.
        if (Math.abs(sg.end.z - sg.start.z) > 1e-6) continue;
        if (Math.hypot(sg.end.x - sg.start.x, sg.end.y - sg.start.y) < 1e-9) continue;
        if (sg.start.z < jointLo || sg.start.z > jointHi) continue;
        keepClearOf(sg.start.z, bar.diameterMm, 'roofHook');
      }
    }
    // ── A tie cannot hold steel that stops below it ──
    //
    // The joint band is bounded by the beam mats and the roof hooks, and by one more thing:
    // the column's own bars. A tie placed above where they end encloses nothing, and
    // §25.7.1.2 reports every one of its four bends as empty — measured on qa-8, where the
    // uppermost tie of each joint sat past the shortest bar's termination.
    for (const p of plan) {
      const e = columnBarExtent.get(p.id);
      if (e === undefined) continue;
      bandHi = Math.min(bandHi, e.hi);
    }

    const zoneId = `joint-${top.id}:ties`;
    let from = bandLo;
    // The beam steel passing through the joint is CONFINED by these ties, and the tie belongs
    // to the joint rather than to the column alone. Both facts have to be recorded or the
    // classifier sees an unrelated pair and reaches for §25.2.3's column bar spacing.
    const jointOwners = [...new Set([cid, ...incidentBeams])].sort((x, y) => x - y);
    let built = 0;
    /**
     * The joint's tie set at a station, its centreline crossties on the side that runs through
     * fewest of the beams' bars. A crosstie on the cage's centreline may pass on either side of
     * the bars it grips (`buildCrosstie` `centreSides`), and the search reads it on the positive
     * one (`columnTailPosts`): where that side runs through a beam's hook tail, which stands on a
     * plane across the crosstie no slot of that beam can move, the other side is taken where it
     * runs through fewer. Measured on the span fixture at 40×40, its beams' role not declared:
     * the end beams' bottom tails stood 22 mm past the node and the crosstie's shaft at 20 mm,
     * 5,7 mm into each of them; on the other side it touched none. Chosen by the bars as laid,
     * a flip only ever removes an interpenetration of the tie: the search's slots are untouched.
     */
    const tieSetAt = (station: number, si: number) => {
      const build = (centreSides?: { across: 1 | -1; up: 1 | -1 }) => buildColumnTieSet({
        closureCache,
        elementId: cid,
        cageId: `joint-${top.id}:cage`,
        zoneId,
        station,
        // Same plan frame as the lift ties: across=Y carries h, up=X carries b.
        b: cCtx.section.h, h: cCtx.section.b,
        cover: cCtx.material.cover, stirrupDiaMm: cCtx.material.stirrupDia,
        // `legs` is not what decides a COLUMN cage. `buildColumnTieSet` reads the bars that
        // are there and adds a crosstie on every interior line that carries one at each end,
        // in both directions, which is what §25.7.2.3(a) needs and what a perimeter tie alone
        // cannot give: measured, the mid-face bars of an 8-bar cage sit 140,7 mm clear of the
        // nearest supported bar against the 120 mm (b) allows.
        legs: 2,
        longitudinalBars: cageBarsAt(from + station),
        origin: { x: cageCentre.x, y: cageCentre.y, z: from },
        axis: { x: 0, y: 0, z: 1 },
        up: { x: 1, y: 0, z: 0 },
        across: { x: 0, y: 1, z: 0 },
        hookOrientation: si % 2 === 0 ? 'a' : 'b',
        maxAggregateSizeMm: input.maxAggregateSizeMm,
        ...(centreSides ? { centreSides } : {}),
      });
      const first = build();
      if (first.unsupported.length > 0 || throughBars.length === 0) return first;
      // Interpenetrations of the crossties (every piece but the perimeter tie) with the beams'
      // bars, and how deep: fewer first, then shallower.
      const cost = (set: ReturnType<typeof build>) => {
        let n = 0, depth = 0;
        for (const piece of set.pieces.slice(1)) {
          for (const bar of throughBars) {
            const c = minSurfaceClearance(piece.path, bar).clearance;
            if (c < -1e-4) { n++; depth -= c; }
          }
        }
        return { n, depth };
      };
      let best = first, bestCost = cost(first);
      if (bestCost.n === 0) return first;
      for (const sides of [{ across: -1, up: 1 }, { across: 1, up: -1 }, { across: -1, up: -1 }] as const) {
        const alt = build(sides);
        if (alt.unsupported.length > 0) continue;
        const c = cost(alt);
        if (c.n < bestCost.n || (c.n === bestCost.n && c.depth < bestCost.depth - 1e-9)) { best = alt; bestCost = c; }
      }
      return best;
    };
    // The clearance band bounds every piece, not just the set's nominal station.
    // Probe the full cage at mid-joint; end stations can contain a subset of these bars.
    // Reserve the closure and staggered crossties before placing the first/last set.
    const halfSet = setSpread(tieSetAt(jointMid - from, 0).pieces.length, cCtx.material.stirrupDia) / 2;
    from += halfSet;
    const band = bandHi - halfSet - from;
    if (!(band > 0)) {
      cMb.unsupported.push(formatClause(clause('cirsoc-201', input.edition, '15.3.1.2',
        'el nudo no deja luz libre entre la armadura inferior y superior de las vigas ' +
        'para alojar estribos horizontales; la armadura transversal del nudo no se genera')));
      continue;
    }
    const stations = stirrupStations({
      from: 0, to: band, spacing: jointSpacing, nextZoneStartsAtEnd: false,
    });
    for (let si = 0; si < stations.length; si++) {
      const set = tieSetAt(stations[si], si);
      if (set.unsupported.length > 0) {
        cMb.unsupported.push(...set.unsupported.map((r) => formatClause(r)));
        continue;
      }
      for (const piece of set.pieces) {
        // The joint belongs to every member that forms it. A tie owned by the column alone
        // would be "unrelated" to the beam steel it confines, and the classifier would judge
        // the pair by clear spacing instead of recognising the containment.
        piece.path.ownerElementIds = jointOwners;
        piece.path.enclosesBarIds = [
          ...(piece.path.enclosesBarIds ?? []), ...throughBars.map((b) => b.id),
        ];
      }
      const jointBars = set.pieces.map((p) => p.path);
      columnBarsIndex().append(cid, jointBars);
      cMb.bars.push(...jointBars);
      built += set.pieces.length;

      // §25.7.2.3(b): no unbraced bar further than the lesser of 15·d_be and 150 mm clear
      // from a braced one. This IS a column clause and this IS a column tie, so it applies
      // here — unlike on a beam, where citing it would be a scope error.
      if (si === 0) {
        const unbraced = unbracedBarReport(
          cageBars, set.pieces, cCtx.material.stirrupDia);
        if (!unbraced.ok) {
          cMb.unsupported.push(formatClause(clause('cirsoc-201', input.edition, '25.7.2.3(b)',
            `${unbraced.offenders.length} barra(s) del nudo sin arriostrar dentro de ` +
            `${(unbraced.limit * 1000).toFixed(0)} mm; el nudo requiere ganchos ` +
            'suplementarios que no se generan')));
        }
      }
    }
    cMb.requiredTransversePieces = (cMb.requiredTransversePieces ?? 0) + stations.length;
    cMb.trace.push(
      `Nudo ${top.id}: ${built} estribo(s) Ø${cCtx.material.stirrupDia} en la luz libre de ` +
      `${(band * 1000).toFixed(0)} mm entre la armadura inferior y superior de las vigas ` +
      `(canto de nudo ${(depth * 1000).toFixed(0)} mm); separación máxima ` +
      `${(jointSpacing * 1000).toFixed(0)} mm por ${jointSpacingBy} (15.3.1, 25.7.2).`);
  }

  /** Owning members per bar id, for attributing materialised geometry to an assembly. */
  const barOwner = new Map<string, number[]>();
  for (const mb of memberBarsById.values()) {
    for (const b of mb.bars) barOwner.set(b.id, b.ownerElementIds);
  }

  /**
   * Prohibited physical overlaps touching these members.
   *
   * Filled in after each assembly is coordinated — an assembly's own conflict list is the
   * authoritative count, and guessing it ahead of time is how a gate ends up measuring
   * something other than what it claims.
   */
  const prohibitedByElement = new Map<number, number>();
  const prohibitedFor = (ids: readonly number[]): number =>
    ids.reduce((n, id) => n + (prohibitedByElement.get(id) ?? 0), 0);

  /** Spacing assessments that failed, across the run. Zero until the gate is wired. */
  const spacingFailures = { codeLegal: 0, placementRobust: 0 };

  /**
   * What a repair move may not leave: each beam's and column's section, by its real width and
   * height, cover, stirrup and the bar's own radius, and the effective depth the members were
   * reverified at above (`repair-envelope.ts`). Built once: the members do not change per level.
   */
  const repairEnvelope = buildRepairEnvelope([...input.contexts.values()].flatMap((ctx): EnvelopeMember[] => {
    if (ctx.elementType !== 'beam' && ctx.elementType !== 'column') return [];
    const el = input.elements.get(ctx.elementId);
    const a = el && input.nodes.get(el.nodeI), b = el && input.nodes.get(el.nodeJ);
    if (!el || !a || !b) return [];
    return [{
      elementId: ctx.elementId, kind: ctx.elementType, start: nodePoint(a), end: nodePoint(b),
      b: ctx.section.b, h: ctx.section.h, cover: ctx.material.cover, stirrupDiaMm: ctx.material.stirrupDia,
    }];
  }));

  /** Every beam in plan, for §9.7.7.1's perimeter test. */
  const planBeams: PlanBeam[] = beams.flatMap((id) => {
    const el = input.elements.get(id);
    const a = el && input.nodes.get(el.nodeI), b = el && input.nodes.get(el.nodeJ);
    return el && a && b ? [{ id, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, z: (Z(a) + Z(b)) / 2 }] : [];
  });
  /**
   * The open §25.5 conditions of one assembly's beam laps, measured on its FINAL bars — after the
   * joint layering and the repair ladder, which move the bars the materialiser lapped.
   *
   * Each lap is checked as built (`checkLapPair`); at each joint where top bars lap, §9.7.7.5(b)
   * asks whether the integrity steel of a perimeter beam is spliced there (`checkIntegritySplice`).
   * A bar a fusion later absorbed is found by the ids it is made of (`a+b` holds `a`).
   */
  const lapConditionsOf = (bars: readonly BarPath[], elementIds: readonly number[]): UnsupportedCondition[] => {
    const own = new Set(elementIds);
    const byId = new Map(bars.map((b) => [b.id, b]));
    const byPart = new Map<string, BarPath>();
    for (const b of bars) for (const part of b.id.split('+')) byPart.set(part, b);
    const current = (id: string) => byId.get(id) ?? byPart.get(id.split('+')[0]!);
    const found: UnsupportedCondition[] = [];
    const topLapsAt = new Map<string, { from: number; to: number; n: number }>();
    for (const lap of materialised.laps) {
      if (lap.fromElementId === undefined || lap.toElementId === undefined || !own.has(lap.fromElementId)) continue;
      const a = current(lap.fromBarId), b = current(lap.toBarId);
      const ca = input.contexts.get(lap.fromElementId), cb = input.contexts.get(lap.toElementId);
      if (!a || !b || !ca || !cb) continue;
      found.push(...checkLapPair({
        kind: 'beam', joint: lap.jointId, a, b, elementIds: [lap.fromElementId, lap.toElementId],
        members: [lapMemberOf(ca), lapMemberOf(cb)], ctx: lapContext,
      }));
      if (barFace(a) === 'top' && barFace(b) === 'top') {
        const t = topLapsAt.get(lap.jointId) ?? { from: lap.fromElementId, to: lap.toElementId, n: 0 };
        t.n++;
        topLapsAt.set(lap.jointId, t);
      }
    }
    for (const [jointId, t] of topLapsAt) {
      const node = input.nodes.get(Number(jointId.slice(1)));
      if (!node) continue;
      const perimeter = [t.from, t.to].some((id) => {
        const pb = planBeams.find((p) => p.id === id);
        return pb ? isPerimeterBeam(pb, planBeams) : true;
      });
      // The top bars of the two members that reach the support, and those of them that run
      // through it as one bar (owned by both).
      const reaching = bars.filter((b) => b.role === 'longitudinal' && barFace(b) === 'top'
        && (b.ownerElementIds.includes(t.from) || b.ownerElementIds.includes(t.to))
        && b.segments.some((sg) => sg.kind === 'straight' && distanceToSegmentPlan(node, sg.start, sg.end) <= 0.35));
      const continuous = reaching.filter((b) => b.ownerElementIds.includes(t.from) && b.ownerElementIds.includes(t.to));
      found.push(...checkIntegritySplice({
        joint: jointId, elementIds: [t.from, t.to], perimeter, topLaps: t.n, continuousTop: continuous,
        topAtSupport: [t.from, t.to].map((id) => reaching.filter((b) => b.ownerElementIds.includes(id))),
        edition: input.edition,
      }));
    }
    return [
      ...collapseLapConditions(found),
      ...columnLapOpen.filter((c) => (c.scope.elementIds ?? []).every((id) => own.has(id))),
    ];
  };

  const assemblies: DetailingAssembly[] = [];
  const coordination: FloorCoordinationResult[] = [];

  for (const [level, members] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const elementIds = members.map((m) => m.elementId).sort((a, b) => a - b);
    const joints = buildJoints(level, beams, columns, input);

    const result = coordinateFloor({
      // The generator laid every beam line at its rank (`allocateLayers`, `layerDrop`).
      linesLayered: true,
      assemblyId: `level-${level.toFixed(2)}`,
      // The label is data, not prose: the UI renders `detailing.assembly.level` with it.
      label: level.toFixed(2),
      labelKey: 'detailing.assembly.level',
      labelParams: { level: level.toFixed(2) },
      kind: 'beamLine',
      elementIds,
      members,
      joints,
      edition: input.edition,
      verifierId: input.verifierId,
      demandRevision: input.demandRevision,
      previousRevision: input.previousRevision,
      cover: members.length > 0
        ? (input.contexts.get(members[0].elementId)?.material.cover ?? 0.025) : 0.025,
      tieDia: members.length > 0
        ? (input.contexts.get(members[0].elementId)?.material.stirrupDia ?? 8) : 8,
      maxAggregateSizeMm: input.maxAggregateSizeMm,
      membersVerified: true,
      coordinated: true,
      lockedBars: input.lockedBars,
      // Without this the joint coordinator's layer allocation is recorded and never
      // applied, and every pair of beams meeting at a column overlaps.
      jointVolumes: joints.map((j) => {
        const n = input.nodes.get(j.nodeId)!;
        const cctx = input.contexts.get(j.elementIds[0]);
        return {
          id: j.id, nodeId: j.nodeId,
          centre: { x: n.x, y: n.y, z: Z(n) },
          columnB: j.columnB, columnH: j.columnH,
          cover: cctx?.material.cover ?? 0.025,
          tieDia: cctx?.material.stirrupDia ?? 8,
          columnBars: columnBarsAtLevel(Z(n), { x: n.x, y: n.y }),
          beams: j.beams.map((b) => ({
            elementId: b.elementId,
            direction: b.direction,
            depth: b.depth,
            width: input.contexts.get(b.elementId)?.section.b ?? 0.2,
          })),
        };
      }),
      memberKindOf: (id) => input.contexts.get(id)?.elementType,
      repairEnvelope,
      layerOf: layerOfBar,
      // Materialised laps are a detail, not a defect. Before materialisation this is
      // undefined and every pair is judged by plain clear spacing, which is correct.
      isLapPair: (a, b) => lapLookup?.(a, b),
      nodePositionOf: (id) => {
        const n = input.nodes.get(id);
        return n ? { x: n.x, y: n.y, z: Z(n) } : undefined;
      },
    });
    // ── Every beam bar inside its section's concrete ──
    //
    // The repair ladder used to push bars out of their section (28 on the 408-member frame);
    // it is now bounded by `repairEnvelope` and cannot, and a clash it cannot separate inside
    // the section is `detailing.clash.unresolved`. This check stays as the guard on everything
    // else that places a bar — the generators, the joint layering, a bar the user pinned — none
    // of which the ladder's bound covers. It reads the final bars, so whatever put a bar outside
    // its cage, the bar is recorded, naming where it is and where it may be.
    result.assembly.unsupported.push(...coverViolations(result.assembly.bars));
    // ── Every lap the assembly holds, as built (§25.5) ──
    //
    // The beams' laps on the final bars, and the column laps that stand in this storey (scoped to
    // the upper lift). An open condition here withholds CONSTRUCTIBLE through `noUnsupportedRule`.
    result.assembly.unsupported.push(...lapConditionsOf(result.assembly.bars, elementIds));
    // Persist a failed final strength check with the member, so a nominal pass cannot
    // reappear as an approval in counts, drawings or after reloading the assemblies.
    // Provisional/refused designs already carry their separate verification limitation.
    for (const id of elementIds) if (input.outcomes.get(id)?.outcome === 'VERIFIED'
      && reverification.get(id) === 'fail') {
      result.assembly.unsupported.push({ key: 'detailing.finalVerification.failed',
        scope: { elementIds: [id] }, params: { element: id }, refs: [],
        message: `Element ${id}: strength verification fails at the final reinforcement geometry.`,
      });
    }
    // ── The thirteen conditions, measured on what coordination ACTUALLY produced ──
    //
    // Second pass on purpose. The conflict count is an output of coordination, so a gate
    // evaluated before it runs is a gate measuring zero conflicts on every model — which
    // is precisely the shape of the defect being fixed here.
    const prohibited = result.assembly.conflicts
      .filter((c) => c.pairClass === 'prohibitedOverlap').length;
    const assessment = assessConstructibility({
      // "Complete envelope" here means: no applicable member of this assembly was left
      // out of the search.
      //
      // NOT the beamLayoutsOnly/beamsAndColumns distinction. That qualifier bounds
      // NEGATIVE verdicts — you may not call detailing INADEQUATE on the strength of a
      // partial search, because the unsearched part might have contained the answer. It
      // does not bound a positive one: a clash-free, fully reverified, placement-robust
      // cage is buildable no matter how narrow the search that found it was. A narrower
      // search succeeding is better news, not worse.
      //
      // What genuinely would invalidate a positive claim is a member that never entered
      // the search at all, because then the cage being judged is not the whole cage.
      completeEnvelope: !skipped.some((sk) => elementIds.includes(sk.elementId))
        && elementIds.every((e) => memberBarsById.has(e)),
      searchTruncated: layoutChoice.result.stats.truncated,
      applicableMembers: elementIds.length,
      assignedMembers: elementIds.filter((e) =>
        layoutChoice.slots.has(e) || input.contexts.get(e)?.elementType !== 'beam').length,
      selectedTransitions: layoutChoice.transitions
        .filter((t) => elementIds.includes(t.fromElementId)).length,
      materialisedTransitions: layoutChoice.transitions
        .filter((t) => elementIds.includes(t.fromElementId)).length
        - materialised.unmaterialised
          .filter((u) => layoutChoice.transitions
            .some((t) => t.jointId === u.jointId && elementIds.includes(t.fromElementId)))
          .length,
      unmaterialisedTransitions: materialised.unmaterialised
        .filter((u) => layoutChoice.transitions
          .some((t) => t.jointId === u.jointId && elementIds.includes(t.fromElementId)))
        .length,
      // Required from the ZONES (stated by each member), built from the assembly's own bar
      // list. Two independently-produced numbers; a gap between them is the cage the design
      // layer asked for and the geometry layer did not deliver.
      //
      // Counted on `result.assembly.bars` rather than on `gen.transverse` on purpose: the
      // assembly's bar list is what every downstream consumer reads, so it is the only list
      // whose contents can honestly be called materialised. A piece the coordinator dropped
      // is missing however many the generator fabricated.
      requiredTransversePieces: members
        .reduce((n, m) => n + (m.requiredTransversePieces ?? 0), 0),
      materialisedTransversePieces: result.assembly.bars
        .filter((bar) => bar.role === 'transverse').length,
      prohibitedConflicts: prohibited,
      // Re-verified and conforming: strength at the final geometry, and serviceability.
      reverifiedMembers: elementIds.filter((e) => {
        const v = reverification.get(e);
        return (v === 'ok' || v === 'warn') && !input.serviceabilityFails?.(e) && !input.loadSplitNotEstablished?.(e);
      }).length,
      // A certificate describes the geometry it was checked against.
      //
      // The first version of this refused any member whose steel had moved, on the grounds
      // that its certificate described a cage that no longer existed. That was right before
      // re-verification existed and wrong after: `reverify(id, depthLoss)` re-runs the
      // authoritative verifier at the member's FINAL effective depth — the joint-layer
      // movement plus Table 26.6.2.1(a)'s unfavourable tolerance — so a member that passes
      // it has a certificate for the geometry that is actually there.
      //
      // What still does not match is a member that was never rechecked, or was rechecked
      // and failed. Both are counted as mismatches, and a member with no verifier call at
      // all is a mismatch rather than a silent pass.
      certificateHashMatches: elementIds.filter((e) => {
        const v = reverification.get(e);
        return (v === 'ok' || v === 'warn') && !input.serviceabilityFails?.(e) && !input.loadSplitNotEstablished?.(e);
      }).length,
      /**
       * Beam lines and column stacks contain no slabs, walls or footings.
       *
       * Stated as three explicit zero requirements rather than omitted. `applicable: 0` is a
       * MEASUREMENT — "this assembly has no panels" — and it is what makes the gate able to
       * distinguish it from "panels present, none certified". An omitted field could mean
       * either, and this gate has already been broken once in each direction by exactly that
       * ambiguity.
       */
      familyRequirements: noFloorFamilies(),
      spacingNotCodeLegal: result.assembly.conflicts
        .filter((c) => c.pairClass === 'sameLayerSpacing'
          || c.pairClass === 'betweenLayerSpacing' || c.pairClass === 'crossMemberSpacing')
        .length,
      // Placement robustness: does the cage still comply once every bar is allowed to sit
      // at the unfavourable end of the project's margin?
      //
      // At the default zero margin the question is IDENTICAL to code legality — there is
      // no allowance to erode — so the answer is the code-legal count and no second pass
      // is run. A positive margin is a real, separate question and gets a real, separate
      // measurement: the same authoritative collision check with every requirement raised
      // by the margin.
      spacingNotPlacementRobust: spacingMargin <= 0
        ? 0
        : detectCollisions(result.assembly.bars, {
          tolerances: DEFAULT_TOLERANCES,
          classifyFor: (a, b, surface, ta, tb) => {
            const base = classifyForRun(a, b, surface, ta, tb);
            // Contact classes have no minimum to raise. A lap is meant to touch and a
            // stirrup is meant to grip; adding a margin to zero would report the detail.
            return base.requiredClear <= 0
              ? base
              : { ...base, requiredClear: base.requiredClear + spacingMargin };
          },
        }).conflicts.filter((c) => c.severity !== 'marginal').length,
      unsupportedRules: result.assembly.unsupported.length + unsupportedRun.length,
      staleAssemblies: 0,
      /**
       * The one condition measured on the MODEL rather than on this assembly.
       *
       * Every count above is over `elementIds`, which is this level's detailed members — the
       * right population for "is this cage sound" and the wrong one for "is this cage the whole
       * cage". A member the design refused never reached `byLevel`, so no per-assembly count can
       * see it, and fifteen conditions measured over four members out of twelve all passed.
       *
       * The same number goes to every assembly on purpose. Construction documentation is issued
       * from the DOCUMENT, which aggregates assemblies and takes the lowest state among them; a
       * level that happens to be clean is not a licence to build one storey of a structure whose
       * design has not converged. Withholding the claim on every assembly is what makes the
       * document unable to reach ISSUED, which is the outcome this condition is for.
       */
      undetailedScopeMembers: undetailedScopeCount(readiness.convergence),
    });
    const gated = evaluateState({
      bars: result.assembly.bars,
      conflicts: result.assembly.conflicts,
      unsupported: result.assembly.unsupported,
      membersVerified: true,
      coordinated: true,
      constructibility: assessment,
    });
    // The coordinator's own state is the ceiling set by the conditions the gate does not
    // cover — members failing their individual checks, coordination not converging, no
    // bars at all. Below COORDINATED those decide and the gate has nothing to add. At or
    // above it, the thirteen conditions decide.
    assemblies.push({
      ...result.assembly,
      state: reviewRank(result.assembly.state) < reviewRank('COORDINATED')
        ? result.assembly.state
        : gated.state,
      // The coordinator evaluated the ladder before the gate existed for this assembly,
      // so its blockers still say "not assessed". Replacing them keeps a single account of
      // why the state is what it is; two disagreeing lists is worse than none.
      stateBlockers: reviewRank(result.assembly.state) < reviewRank('COORDINATED')
        ? result.assembly.stateBlockers
        : gated.blockers,
      constructibility: assessment,
    });
    coordination.push(result);
  }

  /**
   * Stamp the proposal's bars, in ONE place, after every generator has run.
   *
   * Deliberately a post-pass rather than a flag threaded through the eight sites that build
   * bars. A bar is provisional because of the MEMBER it belongs to — a fact known here and
   * nowhere else more reliably — and stamping it centrally makes the property total: no
   * generator can be added later that forgets to set it, because no generator sets it.
   *
   * A bar continuous over two members is provisional if EITHER owner is. It cannot be built
   * from a certified drawing while one of the members it runs through is a proposal.
   */
  const provisionalMembers = new Set<number>();
  for (const [id, o] of input.outcomes) if (isProvisionalOutcome(o)) provisionalMembers.add(id);
  for (const a of assemblies) {
    for (const bar of a.bars) {
      if (bar.ownerElementIds.some((id) => provisionalMembers.has(id))) {
        bar.provisional = 'biaxial';
      }
    }
    /**
     * The member-level fact, recorded separately from the bar-level one.
     *
     * Intersected against the bars' OWNERS rather than against `a.elementIds`. The two are
     * not the same list: `elementIds` names the members the assembly was built around, and on
     * the 7-storey building it reached only 55 of the 117 provisional beams, because a beam
     * can contribute bars to a line assembly it is not itself listed on. Taking the owners
     * makes the claim exactly "this assembly carries steel for these provisional members",
     * which is what a projection of it needs and all it can honestly say.
     */
    const ownProvisional = new Set<number>();
    for (const bar of a.bars) {
      for (const id of bar.ownerElementIds) if (provisionalMembers.has(id)) ownProvisional.add(id);
    }
    a.provisionalMembers = [...ownProvisional].sort((x, y) => x - y);
  }

  /**
   * The torsion warning, stamped the same way and in the same place.
   *
   * A post-pass over the CONTEXTS, which is where the demands are, rather than over the
   * outcomes: a member's torsion is a property of the analysis and not of whether its design
   * succeeded, and reading it off the outcome would silently drop every member that did not
   * reach one. Nothing about a member's state, certificate or geometry is touched here — see
   * `torsion-notice.ts` for why this is a warning and not a refusal.
   */
  const torsionUnevaluated = torsionUnevaluatedMembers(
    [...input.contexts.values()].map((c) => ({
      elementId: c.elementId, elementType: c.elementType, demands: c.demands,
    })),
    { beams: input.checksTorsion === true },
  );
  const torsionIds = new Set(torsionUnevaluated.map((n) => n.elementId));
  for (const a of assemblies) {
    // Intersected against the bars' OWNERS, exactly as the provisional pass is, and for the
    // same reason: `elementIds` names the members the assembly was built around and misses
    // members that only contribute bars to it.
    const own = new Set<number>();
    for (const bar of a.bars) {
      for (const id of bar.ownerElementIds) if (torsionIds.has(id)) own.add(id);
    }
    a.torsionUnevaluatedMembers = [...own].sort((x, y) => x - y);
  }

  return {
    assemblies, readiness, coordination, skipped,
    provisionalMembers: [...provisionalMembers].sort((a, b) => a - b),
    torsionUnevaluated,
    reverification: reverificationRecords,
    layoutSearch: layoutChoice.result,
    layering: layerDiagnostics ? {
      ...layerDiagnostics,
      byLine: layerAllocation?.byLine ?? new Map(),
      unresolved: layerAllocation?.unresolved ?? [],
      ranks: layerAllocation?.ranks ?? 1,
    } : undefined,
    lapping: {
      laps: materialised.laps,
      fused: materialised.fused.length,
      unmaterialised: materialised.unmaterialised,
    },
  };
}

/** Beam-column joints at one level, with the incident beams in plan. */
function buildJoints(
  level: number, beams: number[], columns: number[], input: RunDetailingInput,
): JointInput[] {
  const joints: JointInput[] = [];
  for (const cid of columns) {
    const cEl = input.elements.get(cid);
    const cCtx = input.contexts.get(cid);
    if (!cEl || !cCtx) continue;
    const nI = input.nodes.get(cEl.nodeI);
    const nJ = input.nodes.get(cEl.nodeJ);
    if (!nI || !nJ) continue;
    const top = Z(nI) >= Z(nJ) ? nI : nJ;
    if (Math.abs(Z(top) - level) > 0.05) continue;

    const incident: IncidentBeamAtJoint[] = [];
    const elementIds = [cid];
    for (const bid of beams) {
      const bEl = input.elements.get(bid);
      const bCtx = input.contexts.get(bid);
      if (!bEl || !bCtx) continue;
      const bI = input.nodes.get(bEl.nodeI);
      const bJ = input.nodes.get(bEl.nodeJ);
      if (!bI || !bJ) continue;
      const at = bEl.nodeI === top.id ? bI : bEl.nodeJ === top.id ? bJ : null;
      if (!at) continue;
      const far = bEl.nodeI === top.id ? bJ : bI;
      const dx = far.x - at.x, dy = far.y - at.y;
      const L = Math.hypot(dx, dy) || 1;
      const accepted = detailableReinforcement(input.outcomes.get(bid))?.rebar;
      const g = accepted
        ? beamGroups(accepted, {
          ctx: bCtx, edition: input.edition,
          maxAggregateSizeMm: input.maxAggregateSizeMm,
          hogging: hoggingAtSupports(bCtx),
        })
        : null;
      incident.push({
        elementId: bid,
        direction: { x: dx / L, y: dy / L },
        depth: bCtx.section.h,
        topDiameterMm: g?.topStart.diameterMm ?? 16,
        continuous: supportKindAt(top.id, bid, input.elements) === 'continuous',
      });
      elementIds.push(bid);
    }
    if (incident.length === 0) continue;

    // A column continues above when another column-like member starts at this node.
    let columnAbove = false;
    for (const other of columns) {
      if (other === cid) continue;
      const oEl = input.elements.get(other);
      if (!oEl) continue;
      const a = input.nodes.get(oEl.nodeI);
      const b = input.nodes.get(oEl.nodeJ);
      if (!a || !b || !isColumnLike(a, b)) continue;
      const base = Z(a) <= Z(b) ? a : b;
      if (base.id === top.id) { columnAbove = true; break; }
    }

    joints.push({
      id: `joint-${top.id}`,
      nodeId: top.id,
      beams: incident,
      columnAbove,
      columnB: cCtx.section.b,
      columnH: cCtx.section.h,
      elementIds: [...new Set(elementIds)].sort((a, b) => a - b),
    });
  }
  return joints;
}
