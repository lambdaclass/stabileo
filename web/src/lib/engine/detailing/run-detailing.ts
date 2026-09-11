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

import { clause, formatClause, type RegulationEdition } from '../../codes/regulation';
import { anchorageFunctions } from '../../codes/cirsoc201/anchorage';
import {
  centrelineRadius, minMandrelDiameter, type BarPath, type Point3,
} from '../../codes/cirsoc201/bar-geometry';
import type { MemberContext } from '../design/member-context';
import { STANDARD_LONG_DIAS } from '../design/objective';
import {
  reconcileAcrossTheMember, resolveTopSteel,
  type TopSteelProvision, type TopSteelPurpose,
} from './beam-top-steel';
import { detailableReinforcement, isProvisionalOutcome, type MemberDesignOutcome } from '../design/outcome';
import {
  generateBeamBars, type BentUpPolicy, type MomentStation, type SupportKind,
} from './generate-beam';
import {
  generateColumnStack, tieSpacing, type ColumnLift, type IncidentBeamAtJoint,
} from './generate-column';
import { candidateClears, generateLayoutCandidates, type KeepOut } from './candidates';
import {
  cageKeepOuts, generateColumnCandidates, type ColumnLayoutCandidate,
} from './column-candidates';
import {
  coordinate, type CoordinationResult, type JointConstraint, type MemberVariable,
} from './coordination-search';
import { DEFAULT_TOLERANCES } from './collision';
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
import type { EngineMessage } from '../../codes/message';
import {
  allocateLayers, depthAfterRaise,
  type LayerAllocation, type LineCrossing, type LineForLayering,
} from './joint-layers';
import { prescribedTolerances } from '../../codes/cirsoc201/placement';
import { deriveDevelopment } from '../../codes/cirsoc201/anchorage';
import { minClearSpacingColumn } from '../../codes/cirsoc201/spacing';
import {
  buildColumnTieSet, seatedLongitudinalHalfExtents, stirrupStationCount, stirrupStations,
  unbracedBarReport,
} from '../../codes/cirsoc201/transverse-cage';
import { coordinateFloor, type FloorCoordinationResult, type JointInput, type MemberBars } from './coordinate-floor';
import { evaluateState, reviewRank, type DetailingAssembly } from './assembly';
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
}

export interface RunDetailingInput {
  contexts: ReadonlyMap<number, MemberContext>;
  /** Design outcomes keyed by element id. Only VERIFIED members are detailed. */
  outcomes: ReadonlyMap<number, MemberDesignOutcome>;
  nodes: ReadonlyMap<number, DetailingModelNode>;
  elements: ReadonlyMap<number, DetailingModelElement>;
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

/**
 * Envelope stations for a beam, from the per-combo station forces.
 *
 * The generators need sagging, hogging and shear envelopes at each x. Taking the max over
 * combos at each station is exactly what "envelope" means, and it is what the curtailment
 * rules in §9.7.3 are written against.
 */
function envelopeStations(ctx: MemberContext): MomentStation[] {
  const sr = ctx.stations;
  if (!sr || sr.comboResults.length === 0) return [];
  const byX = new Map<number, MomentStation>();
  for (const combo of sr.comboResults) {
    for (const st of combo.stations) {
      const key = Math.round(st.x * 1e6) / 1e6;
      const cur = byX.get(key) ?? { x: key, mPos: 0, mNeg: 0, v: 0 };
      // Local-y bending is the strong axis for a horizontal member under gravity.
      const m = st.my;
      cur.mPos = Math.max(cur.mPos, m > 0 ? m : 0);
      cur.mNeg = Math.max(cur.mNeg, m < 0 ? -m : 0);
      cur.v = Math.max(cur.v, Math.abs(st.vz), Math.abs(st.vy));
      byX.set(key, cur);
    }
  }
  return [...byX.values()].sort((a, b) => a.x - b.x);
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

/**
 * Peak hogging moment at each end of a member, kN·m, from its own envelope.
 *
 * The FIRST and LAST station rather than a region sweep, matching what `generateBeamBars`
 * already calls `peakNegI` / `peakNegJ`. Two readings of "does this support hog" that disagree
 * would put a hanger pair on a face the generator then curtails hogging steel into.
 */
function hoggingAtSupports(ctx: MemberContext): { start: number; end: number } {
  const st = envelopeStations(ctx);
  if (st.length === 0) return { start: 0, end: 0 };
  return {
    start: Math.max(st[0].mNeg, 0),
    end: Math.max(st[st.length - 1].mNeg, 0),
  };
}

interface BeamGroupOptions {
  ctx: MemberContext;
  edition: RegulationEdition;
  maxAggregateSizeMm: number;
  hogging: { start: number; end: number };
}

/** The top-steel provision at each support. One derivation, two readers. */
function resolveTopSteelFor(
  accepted: NonNullable<MemberDesignOutcome['accepted']>,
  opts: BeamGroupOptions,
): { start: TopSteelProvision; end: TopSteelProvision } {
  const g = (x?: { count: number; diameter: number }) =>
    x && x.count > 0 ? { count: x.count, diameterMm: x.diameter } : undefined;
  const r = accepted.regions;
  const common = {
    b: opts.ctx.section.b,
    cover: opts.ctx.material.cover,
    stirrupDiaMm: opts.ctx.material.stirrupDia,
    maxAggregateSizeMm: opts.maxAggregateSizeMm,
    availableDiametersMm: STANDARD_LONG_DIAS,
    edition: opts.edition,
  };
  const start = resolveTopSteel({
    ...common,
    designed: g(r?.topStart) ?? g(accepted.top),
    hoggingMoment: opts.hogging.start,
  });
  const end = resolveTopSteel({
    ...common,
    designed: g(r?.topEnd) ?? g(accepted.top),
    hoggingMoment: opts.hogging.end,
  });
  return reconcileAcrossTheMember(start, end);
}


/**
 * The three longitudinal groups a beam is detailed from, and what each top group IS.
 *
 * ── The line this replaces, and why it was wrong ───────────────────
 *
 *     if (!bottom || !topStart || !topEnd) return null;
 *
 * All three or nothing. A beam whose envelope never hogs is designed with bottom steel and no
 * top groups — `bottomSpan=2Ø20`, `topStart=—`, `topEnd=—` in the design's own candidate — and
 * that gate discarded the bottom bars the design DID produce, along with the entire stirrup
 * cage, which is generated in the same call. Sixty-three of the 7-storey building's 119 beams
 * reached the viewport with no steel of their own at all; the transverse bars they appeared to
 * have were the JOINT ties of the columns they frame into, which claim the beam ids too.
 *
 * The missing group is now RESOLVED rather than demanded — see `./beam-top-steel.ts`
 * for the clauses and, more importantly, for the one number none of them fixes. The bottom group
 * is still demanded: a beam with no bottom steel has nothing this function can build a beam from.
 */
function beamGroups(
  accepted: NonNullable<MemberDesignOutcome['accepted']>,
  opts: BeamGroupOptions,
): {
  bottom: { count: number; diameterMm: number };
  topStart: { count: number; diameterMm: number };
  topEnd: { count: number; diameterMm: number };
  topPurpose: { start: TopSteelPurpose; end: TopSteelPurpose };
  /** The full provisions, for the trace, the refs and the blocked reasons. */
  provisions: { start: TopSteelProvision; end: TopSteelProvision };
} | null {
  const g = (x?: { count: number; diameter: number }) =>
    x && x.count > 0 ? { count: x.count, diameterMm: x.diameter } : null;
  const r = accepted.regions;
  const bottom = g(r?.bottomSpan) ?? g(accepted.bottom);
  if (!bottom) return null;

  const { start, end } = resolveTopSteelFor(accepted, opts);
  if (!start.group || !end.group) return null;
  return {
    bottom, topStart: start.group, topEnd: end.group,
    topPurpose: { start: start.purpose, end: end.purpose },
    provisions: { start, end },
  };
}

function columnBars(accepted: NonNullable<MemberDesignOutcome['accepted']>):
  { count: number; diameterMm: number } | null {
  const c = accepted.column;
  if (c && 'totalBars' in c && typeof (c as { totalBars?: number }).totalBars === 'number') {
    const t = c as unknown as { totalBars: number; diameter?: number; barDiameter?: number };
    const d = t.diameter ?? t.barDiameter;
    if (t.totalBars > 0 && d) return { count: t.totalBars, diameterMm: d };
  }
  const l = accepted.longitudinal;
  if (l && l.count > 0) return { count: l.count, diameterMm: l.diameter };
  return null;
}

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

/**
 * Generate and coordinate detailing for every verified member, grouped into one assembly
 * per storey level.
 *
 * Grouping by level is what "coordinate the floor" means physically: bars clash with the
 * bars they share a pour with, and a column stack spans levels but is coordinated at each
 * joint it passes through.
 */
export function runDetailing(input: RunDetailingInput): RunDetailingResult {
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
    const key = `${Math.round(lo.x * 1000)}:${Math.round(lo.y * 1000)}`;
    const list = stacks.get(key) ?? [];
    list.push({
      elementId: id, baseZ: Z(lo), topZ: Z(hi),
      b: ctx.section.b, h: ctx.section.h,
      centre: { x: lo.x, y: lo.y },
      bars, tieDia: ctx.material.stirrupDia, cover: ctx.material.cover,
    });
    stacks.set(key, list);
  }

  const memberBarsById = new Map<number, MemberBars>();

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
    layerOf: (barId) => barLayers.get(barId),
    isLapPair: (x, y) => lapLookup?.(x, y),
  }, surface, ta, tb);
  /** Layer index per bar, reported by the generators, for the §25.2.2 classification. */
  const barLayers = new Map<string, number>();

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

  /**
   * Column bars whose line passes through a node's plan position and elevation.
   *
   * Read from the bars the column generator actually produced, not recomputed: threading
   * must dodge the real cage, and a second derivation of "where the column bars are" is a
   * second thing that can disagree with the drawing.
   */
  function columnBarsNear(n: DetailingModelNode) {
    const found: Array<{ id: string; diameterMm: number; x: number; y: number }> = [];
    for (const mb of memberBarsById.values()) {
      if (input.contexts.get(mb.elementId)?.elementType !== 'column') continue;
      for (const bar of mb.bars) {
        const p = bar.segments[0]?.start;
        if (!p) continue;
        if (Math.hypot(p.x - n.x, p.y - n.y) > 1.0) continue;
        // The bar must physically span this elevation to obstruct anything here.
        const zs = bar.segments.flatMap((sg) => [sg.start.z, sg.end.z]);
        if (Math.min(...zs) > Z(n) + 0.02 || Math.max(...zs) < Z(n) - 0.02) continue;
        found.push({ id: bar.id, diameterMm: bar.diameterMm, x: p.x, y: p.y });
      }
    }

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
  }, barDiaMm: number) => {
    const seat = seatedLongitudinalHalfExtents(
      ctx.section.b, ctx.section.h, ctx.material.cover, ctx.material.stirrupDia, barDiaMm);
    const r = centrelineRadius(
      minMandrelDiameter(ctx.material.stirrupDia, 'transverse').value, ctx.material.stirrupDia);
    return {
      cornerSeatAcross: seat.corner.halfAcross,
      cornerSeatTolerance: r + barDiaMm / 2000,
    };
  };

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
          && Math.hypot(n.x - lift.centre.x, n.y - lift.centre.y) < 0.6
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

    // Beam depth at the joint above each lift, for the splice-free zone.
    const beamDepthAtTop = new Map<number, number>();
    lifts.forEach((lift, i) => {
      let depth = 0;
      for (const bId of beams) {
        const bEl = input.elements.get(bId);
        const bCtx = input.contexts.get(bId);
        if (!bEl || !bCtx) continue;
        for (const nid of [bEl.nodeI, bEl.nodeJ]) {
          const n = input.nodes.get(nid);
          if (!n) continue;
          if (Math.abs(Z(n) - lift.topZ) < 0.05
            && Math.hypot(n.x - lift.centre.x, n.y - lift.centre.y) < 0.6) {
            depth = Math.max(depth, bCtx.section.h);
          }
        }
      }
      if (depth > 0) beamDepthAtTop.set(i, depth);
    });

    const gen = generateColumnStack({
      stackId, lifts,
      fc: first.material.fc, fy: first.material.fy,
      maxAggregateSizeMm: input.maxAggregateSizeMm,
      edition: input.edition,
      lapSplice: anchor.lapSplice,
      // The cage from `column-candidates`, which distributes the non-corner bars around
      // ALL FOUR faces and validates §25.2.3 before returning.
      //
      // The generator's own fallback crams every extra bar onto the two ±y faces. For the
      // flagship's 24Ø12 and 28Ø12 columns that is 20-plus bars on two faces at roughly
      // 8 mm clear, against the 40 mm the article requires — an illegal cage, drawn without
      // complaint, which then blocked every beam framing into that joint. It is the reason
      // 120 beams were reported impossible to thread.
      barPositions: conventionalCage.get(stackId)?.slots.map((sl) => ({ x: sl.dx, y: sl.dy })),
      beamDepthAtTop,
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
        const clearTop = zone.to - (beamDepthAtTop.get(liftIndex) ?? 0);
        const height = clearTop - zone.from;
        if (!(height > 0)) continue;

        const ctx = input.contexts.get(lift.elementId);
        if (!ctx) continue;

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
            elementId: lift.elementId,
            cageId: `col-${lift.elementId}:cage`,
            zoneId: `col-${lift.elementId}:ties`,
            station: stations[si],
            b: lift.b, h: lift.h,
            cover: lift.cover, stirrupDiaMm: zone.diameterMm,
            // As at the joint: `legs` does not decide a column cage. The builder reads the
            // bars that are there and braces every interior line that carries one.
            legs: 2,
            longitudinalBars: cageAt(zone.from + stations[si]),
            origin: { x: lift.centre.x, y: lift.centre.y, z: zone.from },
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
        trace: lift.elementId === lifts[0].elementId ? gen.trace : [],
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
    const perBeam = new Map<number, {
      dia: number; count: number; t: { x: number; y: number };
      botDia: number; topDia: number;
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

      // The widest group governs: one arrangement serves the whole member.
      const count = Math.max(groups.bottom.count, groups.topStart.count, groups.topEnd.count);
      const dia = Math.max(
        groups.bottom.diameterMm, groups.topStart.diameterMm, groups.topEnd.diameterMm);
      const clearWidth = Math.max(0.02,
        ctx.section.b - 2 * (ctx.material.cover + ctx.material.stirrupDia / 1000));

      const lockedAcross = (input.lockedBars ?? [])
        .filter((b) => b.ownerElementIds.includes(id))
        .map((b) => {
          const p = b.segments[0]?.start;
          if (!p) return null;
          return (p.x - nI.x) * t.x + (p.y - nI.y) * t.y;
        })
        .filter((x): x is number => x !== null);

      // The UNION of both ends' cages. A straight bar holds one transverse position along
      // its whole length, so the arrangement has to clear every joint it passes through —
      // and the generator needs to see them all to offer a channel-aware alternative.
      const endObstacles: KeepOut[] = [];
      for (const n of [nI, nJ]) {
        for (const c of columnBarsNear(n)) {
          endObstacles.push({
            at: (c.x - n.x) * t.x + (c.y - n.y) * t.y,
            halfWidth: c.diameterMm / 2000 + placement,
          });
        }
      }

      const domain = generateLayoutCandidates({
        count, diameterMm: dia, clearWidth, edition: input.edition,
        maxAggregateSizeMm: input.maxAggregateSizeMm, memberKind: 'beam',
        placementTolerance: placement,
        lockedAcross: lockedAcross.length > 0 ? lockedAcross : undefined,
        obstacles: endObstacles.length > 0 ? endObstacles : undefined,
        ...beamSeat(ctx, dia),
      });
      if (domain.length === 0) continue;

      perBeam.set(id, {
        dia, count, t,
        botDia: groups.bottom.diameterMm,
        topDia: Math.max(groups.topStart.diameterMm, groups.topEnd.diameterMm),
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
      const cage = columnBarsNear(n);
      if (cage.length === 0 && ids.length < 2) continue;

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
        keepOutsFor.set(id, cage.map((c) => ({
          at: (c.x - n.x) * info.t.x + (c.y - n.y) * info.t.y,
          halfWidth: c.diameterMm / 2000 + placement,
        })));
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
          const dev = deriveDevelopment({
            diameterMm: Math.max(ia.dia, ib.dia),
            fy: ctxA.material.fy, fc: ctxA.material.fc,
            favourableSpacing: true, edition: input.edition,
          });
          return transitionExists(
            aLayout.slots.map((sl) => sl.across),
            bLayout.slots.map((sl) => sl.across),
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
    layerAllocation = allocateLayers({
      lines: linesForLayering, crossings,
      edition: input.edition,
      extraMargin: input.spacingMargin ?? 0,
    });
    for (const [id, lineId] of lineOfMember) {
      const la = layerAllocation.byLine.get(lineId);
      if (la) {
        layerRaiseOf.set(id, la.bottomRaise);
        layerDropOf.set(id, la.topLower);
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
        const la = result.assignment.get(aId);
        const lb = result.assignment.get(bId);
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

        const dev = deriveDevelopment({
          diameterMm: Math.max(ia.dia, ib.dia),
          fy: ctxA.material.fy, fc: ctxA.material.fc,
          favourableSpacing: true, edition: input.edition,
        });
        const attempt = planSplice({
          from: la.slots.map((sl) => sl.across),
          to: lb.slots.map((sl) => sl.across),
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
          jointPoint: { x: jn.x, y: jn.y, z: Z(jn) },
          axis: { x: raw.x / rl, y: raw.y / rl, z: 0 },
          across: { x: ia.t.x, y: ia.t.y, z: 0 },
          schedule: attempt.schedule,
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
  const supportFaceOffset = (nodeId: number): number => {
    let half = 0;
    for (const cid of columns) {
      const cEl = input.elements.get(cid);
      if (!cEl || (cEl.nodeI !== nodeId && cEl.nodeJ !== nodeId)) continue;
      const cCtx = input.contexts.get(cid);
      if (!cCtx) continue;
      half = Math.max(half, Math.min(cCtx.section.b, cCtx.section.h) / 2);
    }
    return half;
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

    const gen = generateBeamBars({
      elementId: id,
      L: ctx.L, b: ctx.section.b, h: ctx.section.h,
      // Raising the steel costs lever arm. The generator must size stirrup zones and
      // curtailment against the depth the bars ACTUALLY have, not the one they were
      // designed with — see the re-verification pass below.
      d: depthAfterRaise(
        ctx.section.h - ctx.material.cover - ctx.material.stirrupDia / 1000,
        layerRaiseOf.get(id) ?? 0),
      cover: ctx.material.cover, stirrupDia: ctx.material.stirrupDia,
      fc: ctx.material.fc, fy: ctx.material.fy,
      maxAggregateSizeMm: input.maxAggregateSizeMm,
      edition: input.edition,
      stations,
      supportI: supportKindAt(el.nodeI, id, input.elements),
      supportJ: supportKindAt(el.nodeJ, id, input.elements),
      vn: Math.max(...stations.map((s) => s.v), 1),
      bottom: groups.bottom, topStart: groups.topStart, topEnd: groups.topEnd,
      topPurpose: groups.topPurpose,
      lateralSystem: input.lateralSystem?.has(id) ?? false,
      ld: anchor.ld,
      origin: nodePoint(nI),
      axis: unit(nodePoint(nI), nodePoint(nJ)),
      up: { x: 0, y: 0, z: 1 },
      supportFaceI: supportFaceOffset(el.nodeI),
      supportFaceJ: supportFaceOffset(el.nodeJ),
      transverseSlots: layoutChoice.slots.get(id),
      transverseLayers: layoutChoice.slotLayers.get(id),
      layerRaise: layerRaiseOf.get(id) ?? 0,
      layerDrop: layerDropOf.get(id) ?? 0,
      bentUp: input.bentUp ?? { seismicDesign: 'unstated', optOut: false },
    } as never);

    for (const [barId, layer] of Object.entries(gen.barLayers)) barLayers.set(barId, layer);

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
    const out: Array<{ id: string; diameterMm: number; dx: number; dy: number }> = [];
    for (const mb of memberBarsById.values()) {
      const ctx = input.contexts.get(mb.elementId);
      if (ctx?.elementType !== 'column') continue;
      for (const bar of mb.bars) {
        const zs = bar.segments.flatMap((sg) => [sg.start.z, sg.end.z]);
        // The bar must actually pass through this level to obstruct it.
        if (Math.min(...zs) > level + 0.02 || Math.max(...zs) < level - 0.02) continue;
        const p = bar.segments[0]?.start;
        if (!p) continue;
        const dx = p.x - centre.x;
        const dy = p.y - centre.y;
        if (Math.hypot(dx, dy) > 1.5) continue;   // a different column line
        out.push({ id: bar.id, diameterMm: bar.diameterMm, dx, dy });
      }
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  };

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
    // form it, and a tie above the shallowest beam's soffit is still inside the joint.
    let depth = 0;
    for (const bid of beams) {
      const bEl = input.elements.get(bid);
      if (!bEl || (bEl.nodeI !== top.id && bEl.nodeJ !== top.id)) continue;
      depth = Math.max(depth, input.contexts.get(bid)?.section.h ?? 0);
    }
    if (depth <= 0) continue;   // a column with no beam at its top has no joint.

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
    const columnBarExtent = new Map<string, { lo: number; hi: number }>();
    for (const mb of memberBarsById.values()) {
      for (const bar of mb.bars) {
        if (bar.role !== 'longitudinal') continue;
        const zs = bar.segments.flatMap((sg) => [sg.start.z, sg.end.z]);
        columnBarExtent.set(bar.id, { lo: Math.min(...zs), hi: Math.max(...zs) });
      }
    }
    const plan = columnBarsAtLevel(Z(top), { x: top.x, y: top.y });
    const cageBarsAt = (z: number) => plan
      .filter((p) => {
        const e = columnBarExtent.get(p.id);
        return e === undefined || (e.lo <= z + 0.002 && e.hi >= z - 0.002);
      })
      .map((p) => ({ id: p.id, across: p.dy, up: p.dx, diameterMm: p.diameterMm }));
    const cageBars = cageBarsAt(Z(top));

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
    const tieR = cCtx.material.stirrupDia / 2000;
    let bandLo = Z(top) - depth / 2;
    let bandHi = Z(top) + depth / 2;
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
      if (from === 'roofHook' || zc >= Z(top)) bandHi = Math.min(bandHi, zc - keepOut);
      else bandLo = Math.max(bandLo, zc + keepOut);
    };
    for (const bid of incidentBeams) {
      for (const bar of memberBarsById.get(bid)?.bars ?? []) {
        if (bar.role !== 'longitudinal') continue;
        const zs = bar.segments.flatMap((sg) => [sg.start.z, sg.end.z]);
        keepClearOf((Math.min(...zs) + Math.max(...zs)) / 2, bar.diameterMm, 'mat');
      }
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
        if (sg.start.z < Z(top) - depth / 2 || sg.start.z > Z(top) + depth / 2) continue;
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

    const band = bandHi - bandLo;
    if (!(band > 0)) {
      cMb.unsupported.push(formatClause(clause('cirsoc-201', input.edition, '15.3.1.2',
        'el nudo no deja luz libre entre la armadura inferior y superior de las vigas ' +
        'para alojar estribos horizontales; la armadura transversal del nudo no se genera')));
      continue;
    }

    const zoneId = `joint-${top.id}:ties`;
    const from = bandLo;
    const stations = stirrupStations({
      from: 0, to: band, spacing: jointSpacing, nextZoneStartsAtEnd: false,
    });
    // The beam steel passing through the joint is CONFINED by these ties, and the tie belongs
    // to the joint rather than to the column alone. Both facts have to be recorded or the
    // classifier sees an unrelated pair and reaches for §25.2.3's column bar spacing.
    const throughBars = incidentBeams.flatMap((bid) =>
      (memberBarsById.get(bid)?.bars ?? []).filter((b) => b.role === 'longitudinal'));
    const jointOwners = [...new Set([cid, ...incidentBeams])].sort((x, y) => x - y);
    let built = 0;
    for (let si = 0; si < stations.length; si++) {
      const set = buildColumnTieSet({
        elementId: cid,
        cageId: `joint-${top.id}:cage`,
        zoneId,
        station: stations[si],
        b: cCtx.section.b, h: cCtx.section.h,
        cover: cCtx.material.cover, stirrupDiaMm: cCtx.material.stirrupDia,
        // `legs` is not what decides a COLUMN cage. `buildColumnTieSet` reads the bars that
        // are there and adds a crosstie on every interior line that carries one at each end,
        // in both directions, which is what §25.7.2.3(a) needs and what a perimeter tie alone
        // cannot give: measured, the mid-face bars of an 8-bar cage sit 140,7 mm clear of the
        // nearest supported bar against the 120 mm (b) allows.
        legs: 2,
        longitudinalBars: cageBarsAt(from + stations[si]),
        origin: { x: top.x, y: top.y, z: from },
        axis: { x: 0, y: 0, z: 1 },
        up: { x: 1, y: 0, z: 0 },
        across: { x: 0, y: 1, z: 0 },
        hookOrientation: si % 2 === 0 ? 'a' : 'b',
        maxAggregateSizeMm: input.maxAggregateSizeMm,
      });
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
      cMb.bars.push(...set.pieces.map((p) => p.path));
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

  const assemblies: DetailingAssembly[] = [];
  const coordination: FloorCoordinationResult[] = [];

  for (const [level, members] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const elementIds = members.map((m) => m.elementId).sort((a, b) => a - b);
    const joints = buildJoints(level, beams, columns, input);

    const result = coordinateFloor({
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
      layerOf: (barId) => barLayers.get(barId),
      // Materialised laps are a detail, not a defect. Before materialisation this is
      // undefined and every pair is judged by plain clear spacing, which is correct.
      isLapPair: (a, b) => lapLookup?.(a, b),
      nodePositionOf: (id) => {
        const n = input.nodes.get(id);
        return n ? { x: n.x, y: n.y, z: Z(n) } : undefined;
      },
    });
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
      reverifiedMembers: elementIds.filter((e) => {
        const v = reverification.get(e);
        return v === 'ok' || v === 'warn';
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
        return v === 'ok' || v === 'warn';
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
