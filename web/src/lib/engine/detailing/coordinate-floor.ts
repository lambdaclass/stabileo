/**
 * The detailing pipeline: from verified members to a coordinated, constructible floor.
 *
 * This is the orchestrator that turns the individual engines into a workflow:
 *
 *   1. group members into beam lines and column stacks
 *   2. generate physical bars for each member from its envelope
 *   3. coordinate the choices along each line so neighbours agree
 *   4. coordinate the joints so perpendicular beams get distinct layers
 *   5. detect collisions across the whole assembly
 *   6. attempt a bounded repair on what collides
 *   7. assign marks, evaluate the earned state, and record what could not be resolved
 *
 * ── Repair, and its limits ─────────────────────────────────────
 *
 * Step 6 is a bounded ladder, not a solver: try the next-larger layer separation, then
 * the next-smaller bar of equivalent area, then give up. Each rung is re-verified. What
 * cannot be cleared is returned as an unresolved conflict attached to its joint — the
 * rest of the floor still produces drawings, because losing a whole floor's output to
 * one clash in one corner helps nobody.
 *
 * Pure: no store, no runes. The caller owns persistence.
 */

import type { Point3 } from '../../codes/cirsoc201/bar-geometry';
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import { minClearSpacingFor } from '../../codes/cirsoc201/spacing';
import type { ConstructibilityAssessment } from './constructibility';
import type { EngineMessage } from '../../codes/message';
import { worstMaturity, type Maturity } from '../../codes/maturity';
import type { ClauseRef, RegulationEdition } from '../../codes/regulation';
import {
  assignMarks, evaluateState, type DetailingAssembly, type JointRecord,
  type UnsupportedCondition,
} from './assembly';
import {
  DEFAULT_TOLERANCES, detectCollisions, type BarConflict, type CollisionTolerances,
} from './collision';
import { classifyPair, type ClassificationContext, type PairClassification } from './classify';
import type { JointVolume } from './joint-packing';
import { coordinateJoint, type IncidentBeamAtJoint, type JointCoordination } from './generate-column';

// ─── Inputs ──────────────────────────────────────────────────────

export interface MemberBars {
  elementId: number;
  bars: BarPath[];
  /** Unsupported conditions the generator reported for this member. */
  unsupported: string[];
  /** Maturity of the calculations behind this member's bars. */
  maturity: Maturity;
  /** Clauses applied. */
  refs: ClauseRef[];
  /** Generator trace. */
  trace: string[];
  /**
   * Transverse pieces the member's stirrup ZONES require, derived from the zones and the
   * table's spacing rather than counted off the pieces.
   *
   * Carried on the member rather than recomputed at the gate so the requirement is stated
   * once, by the layer that owns it, and the gate compares two independently-produced
   * numbers instead of comparing an output with itself.
   */
  requiredTransversePieces?: number;
}

export interface JointInput {
  id: string;
  nodeId: number;
  beams: IncidentBeamAtJoint[];
  columnAbove: boolean;
  columnB: number;
  columnH: number;
  elementIds: number[];
  /** Maturity of the joint-shear result, when one was computed. */
  jointShearMaturity?: Maturity;
  jointShearKey?: string;
}

export interface FloorCoordinationInput {
  assemblyId: string;
  label: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  kind: DetailingAssembly['kind'];
  elementIds: number[];
  members: MemberBars[];
  joints: JointInput[];
  edition: RegulationEdition;
  verifierId: string;
  demandRevision: number;
  /** Previous revision, so regeneration increments rather than resets. */
  previousRevision?: number;
  cover: number;
  tieDia: number;
  maxAggregateSizeMm: number;
  /** True when every member passed its own code checks. */
  membersVerified: boolean;
  /** True when the line coordinator returned COORDINATED. */
  coordinated: boolean;
  /** Bars the user pinned; these survive regeneration untouched. */
  lockedBars?: BarPath[];
  tolerances?: CollisionTolerances;
  coordinationTrace?: string[];
  /**
   * Assumptions to carry into the assembly's provenance.
   *
   * Structured messages, because they reach certificates, reports and exports and must be
   * translatable at the i18n boundary like everything else an engine emits.
   */
  assumptions?: EngineMessage[];
  /**
   * Plan/elevation position of a node, so the joint layering knows where each joint is.
   * Optional: without it the layer allocation is recorded but not applied, which is the
   * pre-existing behaviour and is why this is explicit rather than assumed.
   */
  nodePositionOf?: (nodeId: number) => { x: number; y: number; z: number } | undefined;
  /** Member kind per element, so a beam bar is judged by §25.2.1 and not §25.2.3. */
  memberKindOf?: (elementId: number) => 'beam' | 'column' | 'wall' | 'slab' | undefined;
  /** Supplied once laps are materialised; see `ClassificationContext.isLapPair`. */
  isLapPair?: (aId: string, bId: string) => 'contact' | 'nonContact' | undefined;
  /**
   * The thirteen-condition constructibility gate for this assembly.
   *
   * Absent means "not assessed", which caps the assembly at COORDINATED. That is the
   * correct default: the top rung of the ladder is a claim about buildability and it is
   * not available to a caller that has not produced the evidence for it.
   */
  constructibility?: ConstructibilityAssessment;
  /** Layer index per bar, so bars in different layers get the §25.2.2 rule. */
  layerOf?: (barId: string) => number | undefined;
  /**
   * Joint volumes with their column bar positions, for the threading pass.
   *
   * Supplied separately from `joints` because the layer allocation only needs the incident
   * beams, while threading needs the column cage the beam bars have to pass through.
   */
  jointVolumes?: readonly JointVolume[];
}

// ─── Repair ──────────────────────────────────────────────────────

export interface RepairAttempt {
  rung: string;
  cleared: number;
  remaining: number;
}

export interface RepairResult {
  bars: BarPath[];
  conflicts: BarConflict[];
  attempts: RepairAttempt[];
  trace: string[];
}

/**
 * Bounded repair ladder.
 *
 * Rung 1 — nudge non-locked bars in a clashing pair apart along the section's minor
 *          axis, by the shortfall plus a margin, and re-test.
 * Rung 2 — same, with a larger margin.
 * Give up — the remaining conflicts are returned honestly.
 *
 * A locked bar is never moved: the user pinned it, and silently relocating pinned work
 * is the fastest way to lose their trust. When both bars in a pair are locked the
 * conflict is unresolvable by definition and is reported as such.
 */

/** Unit axis of a bar, from its first point to its last. */
function barAxis(bar: BarPath): Point3 {
  const a = bar.segments[0]?.start;
  const b = bar.segments[bar.segments.length - 1]?.end;
  if (!a || !b) return { x: 1, y: 0, z: 0 };
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const L = Math.hypot(d.x, d.y, d.z);
  return L < 1e-9 ? { x: 1, y: 0, z: 0 } : { x: d.x / L, y: d.y / L, z: d.z / L };
}

function centroid(bar: BarPath): Point3 {
  let x = 0, y = 0, z = 0, n = 0;
  for (const sg of bar.segments) {
    x += sg.start.x + sg.end.x; y += sg.start.y + sg.end.y; z += sg.start.z + sg.end.z;
    n += 2;
  }
  return n === 0 ? { x: 0, y: 0, z: 0 } : { x: x / n, y: y / n, z: z / n };
}

/**
 * The direction to push `movable` so it separates from `other`.
 *
 * Away from the other bar, with any component along the movable bar's own axis removed —
 * sliding a bar lengthwise never resolves a clash. When the two bars are collinear (so
 * "away" is degenerate) the fall-back is the most open perpendicular: horizontal for a
 * vertical bar, vertical for a horizontal one.
 */
function separationDirection(movable: BarPath, other: BarPath, at: Point3): Point3 {
  const u = barAxis(movable);
  const from = centroid(other);
  let d = { x: at.x - from.x, y: at.y - from.y, z: at.z - from.z };
  if (Math.hypot(d.x, d.y, d.z) < 1e-9) {
    const c = centroid(movable);
    d = { x: c.x - from.x, y: c.y - from.y, z: c.z - from.z };
  }
  // Remove the component along the bar's own axis.
  const dot = d.x * u.x + d.y * u.y + d.z * u.z;
  let p = { x: d.x - dot * u.x, y: d.y - dot * u.y, z: d.z - dot * u.z };
  let L = Math.hypot(p.x, p.y, p.z);
  if (L < 1e-9) {
    // Collinear. A vertical bar has room sideways; a horizontal one has room across.
    p = Math.abs(u.z) > 0.7 ? { x: 1, y: 0, z: 0 }
      : Math.abs(u.x) >= Math.abs(u.y) ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    L = 1;
  }
  return { x: p.x / L, y: p.y / L, z: p.z / L };
}

export function repairConflicts(
  bars: readonly BarPath[],
  requiredClearFor: (a: BarPath, b: BarPath) => number,
  tolerances: CollisionTolerances = DEFAULT_TOLERANCES,
  classifyFor?: (a: BarPath, b: BarPath, surfaceClearance: number,
    tangentA?: Point3, tangentB?: Point3) => PairClassification,
): RepairResult {
  const attempts: RepairAttempt[] = [];
  const trace: string[] = [];
  let working = bars.map((b) => ({ ...b, segments: b.segments.map((s) => ({ ...s })) }));

  let result = detectCollisions(working, { tolerances, requiredClearFor, classifyFor });
  const initial = result.conflicts.length;
  if (initial === 0) {
    return { bars: working, conflicts: [], attempts, trace: ['Sin conflictos.'] };
  }
  trace.push(`${initial} conflicto(s) detectado(s); se intenta la escalera de reparación.`);

  const byId = new Map(working.map((b) => [b.id, b]));

  // Four rungs, not two. Moving a bar out of one clash can create another, so a single
  // pass leaves a long tail; the flagship frame converged from ~4,800 conflicts to a few
  // hundred over four passes and stopped improving after that. The loop exits early when
  // a rung stops helping, so a model that coordinates in one pass pays for one pass.
  const RUNGS = [
    ['separación mínima', 0.002], ['separación ampliada', 0.006],
    ['separación amplia', 0.012], ['última pasada', 0.020],
  ] as const;
  // Keep the BEST state seen, not the last one. A rung can make things worse — pushing a
  // bar out of one clash into two — and committing that would hand the user a cage that
  // the repair made worse than the raw generation.
  let best = { bars: working, conflicts: result.conflicts };

  for (const [rung, margin] of RUNGS) {
    const before = result.conflicts.length;
    for (const c of result.conflicts) {
      const a = byId.get(c.barA);
      const b = byId.get(c.barB);
      if (!a || !b) continue;
      if (a.locked && b.locked) continue;
      // ── A CAGE PIECE IS NOT NUDGEABLE ──
      //
      // The ladder translates a bar to separate it from another. That is a sound move for two
      // parallel longitudinal bars and a meaningless one for a closed stirrup or tie: the
      // piece is a loop drawn AROUND a set of bars, so sliding it 3 mm off one of them slides
      // it 3 mm INTO the one opposite. Measured on `rc-design-qa-8` — the ladder moved each
      // joint tie off the corner bar it was clashing with, and the tie's far side and its
      // hook tail then interpenetrated the diagonally opposite bar instead. Eight conflicts
      // that were not there before the repair ran.
      //
      // A cage that does not fit is a GENERATOR defect: the bar seating, the bend radius or
      // the closing corner is wrong, and each of those has a clause behind it. Nudging the
      // symptom hides which. So transverse pieces hold still and the conflict is reported.
      // Either side being a cage piece disqualifies the pair, not just both. Moving the
      // LONGITUDINAL bar instead is no better: the cage was built around that bar's position,
      // so shifting the bar off the tie pushes it into the bend on the other side. Measured —
      // holding only the tie still simply moved the same eight conflicts onto the column bars.
      if (a.role === 'transverse' || b.role === 'transverse') continue;
      // Move whichever is not locked; if neither is, move the second for determinism.
      const movable = a.locked ? b : b.locked ? a : b;
      const other = movable === b ? a : b;
      const shift = c.shortfall + margin;
      // Push directly AWAY from the other bar, in the plane perpendicular to this bar's
      // own axis.
      //
      // This used to push along global y unconditionally. For a beam running north-south
      // that is a shift along the bar's OWN axis, which cannot separate anything: the
      // ladder burned both rungs sliding bars lengthwise and reported the clash
      // unresolved. Pushing along the true separation direction is both the physically
      // correct nudge and the one a detailer would make.
      const dir = separationDirection(movable, other, c.at);

      // ── The rigid-mat invariant ──────────────────────────────────
      //
      // A bar is not a free particle. Bars sharing a `layerId` are one physical layer,
      // placed at a legal §25.2.1 pitch by the candidate and separated from the layer above
      // by the §25.2.2 clear distance. Nudging ONE of them out of its layer breaks both
      // rules to fix a third, and the geometry it leaves behind is not a detail anyone can
      // build.
      //
      // That is what happened on the QA fixture: `applyJointLayers` delivered the mat
      // correctly with 35 mm between layers, and the ladder then lifted three layer-1 bars
      // 11 mm on their own, leaving 24 mm where §25.2.2 wants 25.
      //
      // So the unit of movement is the LAYER, not the bar. Every bar sharing the movable
      // bar's layer receives the identical translation, and their relative vectors survive
      // by construction. A bar with no layer identity still moves alone — there is nothing
      // to keep rigid.
      const group = movable.layerId
        ? working.filter((x) => x.layerId === movable.layerId && !x.locked)
        : [movable];
      for (const member of group) {
        const target = byId.get(member.id) ?? member;
        for (const seg of target.segments) {
          seg.start = {
            x: seg.start.x + dir.x * shift,
            y: seg.start.y + dir.y * shift,
            z: seg.start.z + dir.z * shift,
          };
          seg.end = {
            x: seg.end.x + dir.x * shift,
            y: seg.end.y + dir.y * shift,
            z: seg.end.z + dir.z * shift,
          };
        }
      }
    }
    working = [...byId.values()].map((b) => ({ ...b, segments: b.segments.map((sg) => ({ ...sg })) }));
    result = detectCollisions(working, { tolerances, requiredClearFor, classifyFor });
    const cleared = before - result.conflicts.length;
    attempts.push({ rung, cleared, remaining: result.conflicts.length });
    trace.push(
      `Rung "${rung}": ${cleared} resuelto(s), ${result.conflicts.length} pendiente(s).`);

    if (result.conflicts.length < best.conflicts.length) {
      best = { bars: working, conflicts: result.conflicts };
    }
    if (result.conflicts.length === 0) break;
    // A rung that resolved nothing, or made things worse, will not do better with a
    // larger margin on the same geometry.
    if (cleared <= 0) {
      trace.push(`Rung "${rung}" no mejoró el resultado; se conserva el mejor estado previo.`);
      break;
    }
  }

  working = best.bars;
  result = { ...result, conflicts: best.conflicts };

  if (result.conflicts.length > 0) {
    trace.push(
      `${result.conflicts.length} conflicto(s) no resueltos tras la escalera acotada. Se ` +
      'informan como tales; el resto de la planta sigue produciendo documentación.');
  }

  return { bars: working, conflicts: result.conflicts, attempts, trace };
}


// ─── Applying the joint layer allocation ─────────────────────────

/**
 * Move each beam's top bars to the layer the joint coordinator allocated.
 *
 * `allocateBeamLayers` decides which incident beam's top steel runs outermost and returns
 * a `topOffset` per beam — and until now that decision was recorded on the joint record and
 * nothing moved. Two beams meeting at the same column therefore kept their top bars at
 * identical elevations, which is a physical impossibility and produced thousands of
 * overlap conflicts on the flagship frame: the coordinator was reporting a plan the
 * geometry never followed.
 *
 * Only the top bars NEAR the joint are moved. A bar is "near" when one of its ends lands
 * within the column footprint, which is where the layering has to happen and where the
 * beam's own depth still accommodates it.
 */
export function applyJointLayers(
  bars: readonly BarPath[],
  joints: readonly JointInput[],
  coordination: readonly JointCoordination[],
  nodePositionOf: (nodeId: number) => { x: number; y: number; z: number } | undefined,
): { bars: BarPath[]; moved: number } {
  const byId = new Map(bars.map((b) => [b.id, b]));
  let moved = 0;

  for (let i = 0; i < joints.length; i++) {
    const joint = joints[i];
    const co = coordination[i];
    if (!co) continue;
    const at = nodePositionOf(joint.nodeId);
    if (!at) continue;
    // Half the column's diagonal: the plan radius within which a bar end is "at" the joint.
    const radius = Math.hypot(joint.columnB, joint.columnH) / 2 + 0.05;

    for (const alloc of co.layers) {
      if (alloc.layer === 0) continue;   // the outer layer is already where it was placed.

      // ── Move the mat, do not flatten it ──────────────────────────
      //
      // This used to compute `target − maxZ` PER BAR and snap each one to `target`. The
      // allocation carries one `topOffset` per ELEMENT, so every top bar of that member
      // landed on a single plane — and a member whose top steel is in two layers had those
      // layers collapsed onto each other. `placeGroup` had already separated them by the
      // §25.2.2 clear distance, correctly, and this threw that away; the collision engine
      // then reported the two coincident layers as prohibited overlaps, and the repair
      // ladder shifted them apart IN PLAN, destroying the vertical alignment too.
      //
      // What the allocation actually decides is where this beam's top mat sits relative to
      // the other beams at the joint. The mat's own internal layering belongs to the
      // member. So the shift is computed ONCE, from the element's outermost bar, and the
      // whole mat moves rigidly.
      const mat = bars.filter((bar) => {
        if (!bar.ownerElementIds.includes(alloc.elementId)) return false;
        if (bar.role !== 'longitudinal') return false;
        const ends = [bar.segments[0]?.start, bar.segments[bar.segments.length - 1]?.end]
          .filter(Boolean) as Array<{ x: number; y: number; z: number }>;
        if (ends.length === 0) return false;
        if (!ends.some((e) => Math.hypot(e.x - at.x, e.y - at.y) <= radius)) return false;
        // Top bars only: those above the joint node's elevation are the hogging steel.
        return Math.max(...bar.segments.flatMap((sg) => [sg.start.z, sg.end.z]))
          >= at.z - 0.02;
      });
      if (mat.length === 0) continue;

      const outermost = Math.max(...mat.flatMap((bar) =>
        bar.segments.flatMap((sg) => [sg.start.z, sg.end.z])));
      const shift = (at.z - alloc.topOffset) - outermost;
      if (Math.abs(shift) < 1e-6) continue;

      for (const bar of mat) {
        byId.set(bar.id, {
          ...bar,
          segments: bar.segments.map((sg) => ({
            ...sg,
            start: { ...sg.start, z: sg.start.z + shift },
            end: { ...sg.end, z: sg.end.z + shift },
          })),
          source: 'coordinated',
        });
        moved++;
      }
    }
  }
  return { bars: [...byId.values()], moved };
}

// ─── The pipeline ────────────────────────────────────────────────

export interface FloorCoordinationResult {
  assembly: DetailingAssembly;
  jointCoordination: JointCoordination[];
  repair: RepairResult;
  /** Everything the pipeline decided, in order. */
  trace: string[];
}

/**
 * Run the whole pipeline for one assembly.
 *
 * Never throws on a bad member: a member with no bars contributes an unsupported
 * condition and the rest of the assembly proceeds.
 */
export function coordinateFloor(input: FloorCoordinationInput): FloorCoordinationResult {
  const trace: string[] = [...(input.coordinationTrace ?? [])];
  const unsupported: UnsupportedCondition[] = [];
  const refs: ClauseRef[] = [];
  const assumptions = [...(input.assumptions ?? [])];

  // ── 1–2. Collect generated bars, keeping locked ones ──
  const locked = input.lockedBars ?? [];
  const lockedIds = new Set(locked.map((b) => b.id));
  const generated: BarPath[] = [];

  for (const m of input.members) {
    if (m.bars.length === 0) {
      unsupported.push({
        key: 'memberNoBars',
        scope: { elementIds: [m.elementId] },
        message: `El elemento ${m.elementId} no produjo barras físicas.`,
        refs: m.refs,
      });
    }
    for (const b of m.bars) {
      // A locked bar wins over its regenerated replacement, always.
      if (!lockedIds.has(b.id)) generated.push(b);
    }
    for (const u of m.unsupported) {
      unsupported.push({
        key: 'generation',
        scope: { elementIds: [m.elementId] },
        message: u,
        refs: m.refs,
      });
    }
    refs.push(...m.refs);
    trace.push(...m.trace);
  }

  const allBars = [...locked, ...generated];
  if (locked.length > 0) {
    trace.push(`${locked.length} barra(s) fijada(s) por el usuario se conservan sin modificar.`);
  }

  // ── 4. Joints ──
  const jointCoordination: JointCoordination[] = [];
  const jointRecords: JointRecord[] = [];
  const maturities: Maturity[] = input.members.map((m) => m.maturity);

  for (const j of input.joints) {
    const co = coordinateJoint({
      beams: j.beams, columnAbove: j.columnAbove,
      columnB: j.columnB, columnH: j.columnH,
      cover: input.cover, tieDia: input.tieDia, edition: input.edition,
    });
    jointCoordination.push(co);
    trace.push(...co.trace);
    refs.push(...co.refs);
    for (const u of co.unsupported) {
      unsupported.push({
        key: 'jointCoordination', scope: { jointIds: [j.id] }, message: u, refs: co.refs,
      });
    }
    if (j.jointShearMaturity) maturities.push(j.jointShearMaturity);

    jointRecords.push({
      id: j.id, nodeId: j.nodeId, elementIds: j.elementIds,
      kind: co.kind, beamCount: co.beamCount,
      beamLayers: co.layers.map((l) => ({ elementId: l.elementId, layer: l.layer })),
      jointShearKey: j.jointShearKey,
      maturity: j.jointShearMaturity ?? 'UNSUPPORTED',
      unresolved: [],
    });
  }

  // ── 4b. Move the bars to the layers the joints just allocated ──
  const layered = applyJointLayers(
    allBars, input.joints, jointCoordination, input.nodePositionOf ?? (() => undefined));
  if (layered.moved > 0) {
    trace.push(`${layered.moved} barra(s) superiores reubicadas a su capa en el nudo.`);
  }

  // ── 5–6. Collisions and repair ──
  const requiredClearFor = (a: BarPath, b: BarPath) => minClearSpacingFor(
    input.edition,
    a.role === 'transverse' || b.role === 'transverse' ? 'beam' : 'column',
    {
      barDiameterMm: Math.max(a.diameterMm, b.diameterMm),
      maxAggregateSizeMm: input.maxAggregateSizeMm,
    },
  ).minClear;

  // Classify before judging: a tie around its own longitudinals is not a clash, a beam bar
  // is not held to the column rule, and crossing bars are tied in contact.
  const classificationContext: ClassificationContext = {
    edition: input.edition,
    maxAggregateSizeMm: input.maxAggregateSizeMm,
    memberKindOf: input.memberKindOf ?? (() => undefined),
    layerOf: input.layerOf,
    isLapPair: input.isLapPair,
  };
  const classifyFor = (a: BarPath, b: BarPath, surfaceClearance: number,
    tangentA?: Point3, tangentB?: Point3) =>
    classifyPair(a, b, classificationContext, surfaceClearance, tangentA, tangentB);

  const repair = repairConflicts(
    layered.bars, requiredClearFor, input.tolerances, classifyFor);
  trace.push(...repair.trace);

  // Route unresolved conflicts to their joint where one matches, so the UI can navigate.
  const jointByElement = new Map<number, JointRecord>();
  for (const jr of jointRecords) for (const id of jr.elementIds) jointByElement.set(id, jr);
  for (const c of repair.conflicts) {
    const jr = c.elementIds.map((id) => jointByElement.get(id)).find(Boolean);
    if (jr) jr.unresolved.push(c);
  }

  // ── 7. Marks and state ──
  const marks = assignMarks(repair.bars, input.kind === 'columnStack' ? 'C' : 'B');
  const evaluation = evaluateState({
    bars: repair.bars,
    conflicts: repair.conflicts,
    unsupported,
    membersVerified: input.membersVerified,
    coordinated: input.coordinated,
    constructibility: input.constructibility,
  });
  trace.push(
    `Estado alcanzado: ${evaluation.state}` +
    (evaluation.blockers.length > 0 ? ` — ${evaluation.blockers.join(' ')}` : '.'));

  const assembly: DetailingAssembly = {
    id: input.assemblyId,
    kind: input.kind,
    label: input.label,
    labelKey: input.labelKey,
    labelParams: input.labelParams,
    elementIds: input.elementIds,
    bars: repair.bars,
    marks,
    joints: jointRecords,
    conflicts: repair.conflicts,
    unsupported,
    detailingRevision: (input.previousRevision ?? 0) + 1,
    demandRevision: input.demandRevision,
    state: evaluation.state,
    stateBlockers: evaluation.blockers,
    maturity: worstMaturity(maturities),
    provenance: {
      edition: input.edition,
      verifierId: input.verifierId,
      trace,
      assumptions,
    },
  };

  return { assembly, jointCoordination, repair, trace };
}

/** Keys of the provisional calculations in an assembly, for the review gate. */
export function provisionalKeys(a: DetailingAssembly): string[] {
  const out = new Set<string>();
  if (a.maturity === 'IMPLEMENTED_PROVISIONAL') out.add('assembly');
  for (const j of a.joints) {
    if (j.maturity === 'IMPLEMENTED_PROVISIONAL') out.add(`jointShear:${j.id}`);
  }
  return [...out].sort();
}
