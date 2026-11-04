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
 * Step 6 is a bounded ladder, not a solver: translate one layer of a clashing pair away
 * from the other by a growing margin, then give up. Every candidate move is judged before it
 * is applied — inside the section, off none of the lever arm the design verified, and clear
 * of every other bar — and one that fails is not made. What cannot be cleared that way stays
 * where the generator put it and is returned as an unresolved clash, with every move tried and
 * why it was refused, attached to its joint and recorded as an open condition: the rest of the
 * floor still produces drawings, because losing a whole floor's output to one clash in one
 * corner helps nobody.
 *
 * Pure: no store, no runes. The caller owns persistence.
 */

import type { Point3 } from '../../codes/cirsoc201/bar-geometry';
import { samplePath, type BarPath } from '../../codes/cirsoc201/bar-geometry';
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
  DEFAULT_TOLERANCES, detectCollisions, prepareCollisionRepair, type BarConflict, type CollisionTolerances,
} from './collision';
import { classifyPair, type ClassificationContext, type PairClassification } from './classify';
import type { JointVolume } from './joint-packing';
import { coordinateJoint, type IncidentBeamAtJoint, type JointCoordination } from './generate-column';
import type { RepairEnvelope, RepairRejection } from './repair-envelope';

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
  /**
   * The beams' mats already stand at their lines' layers (`joint-layers.ts` `allocateLayers`,
   * applied by the generator): the joint allocation is recorded, and nothing is moved again.
   */
  linesLayered?: boolean;
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
  /**
   * The section and verified-depth bound of a repair move (`buildRepairEnvelope`).
   *
   * Optional only for callers with no members to bound bars by; without it the ladder is
   * bounded by the clearances alone and can push a bar out of its concrete, which is what it
   * did on every model before this existed.
   */
  repairEnvelope?: RepairEnvelope;
}

// ─── Repair ──────────────────────────────────────────────────────

export interface RepairAttempt {
  rung: string;
  cleared: number;
  remaining: number;
}

/** One candidate move the ladder judged, and why it was refused when it was. */
export interface RepairCandidate {
  rung: string;
  /** The bar whose layer the candidate translates. */
  moved: string;
  /** Length of the translation, m. */
  shift: number;
  /** Absent when the candidate was accepted. */
  rejected?: RepairRejection;
}

/**
 * A clash the ladder tried to separate and could not without producing invalid geometry.
 *
 * Its bars are where the ladder found them: every candidate below was refused, so none was
 * applied. Carried with the clash rather than summarised, because "unresolved" alone does not
 * tell an engineer whether the section is too narrow, the design's lever arm is in the way or
 * the neighbouring bars are.
 */
export interface UnresolvedClash {
  barA: string;
  barB: string;
  pairClass?: string;
  severity: BarConflict['severity'];
  /** How far short of the rule the pair still is, m. */
  shortfall: number;
  elementIds: number[];
  /** Every candidate tried, in rung order, each with its rejection. */
  candidates: RepairCandidate[];
}

export interface RepairResult {
  bars: BarPath[];
  conflicts: BarConflict[];
  attempts: RepairAttempt[];
  /** The remaining conflicts the ladder attempted, with why each move was refused. */
  unresolved: UnresolvedClash[];
  /** Every bar the ladder translated, and by how much in total, m: what a reviewer checks. */
  moved: Array<{ id: string; offset: Point3 }>;
  trace: string[];
}

/**
 * Bounded repair ladder.
 *
 * Each rung walks the conflicts, worst first, and for each translates one bar's layer directly
 * away from the other bar by the shortfall plus the rung's margin. The side that moves less steel
 * tries first and the other second, so either can give way, and neither choice reads a bar id.
 * Every candidate is JUDGED before it is applied (see `repairConflicts`); one that fails is not
 * a candidate. The ladder stops at the first rung that clears nothing.
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

/**
 * How far from a moved layer a bar can be and still form a reportable pair with it, m, at the
 * least. The sweep itself never reports a pair whose surfaces are further apart than its own
 * bound (`maxReportableClear` in `collision.ts`: 40 mm, 1,5 bar diameters, 67 mm or the
 * tolerance's clear, plus the placement allowance); the reach is taken at no less than that.
 */
const REPAIR_REACH = 0.15;

interface RepairBox { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }

function repairBox(bar: BarPath): RepairBox {
  const r = bar.diameterMm / 2000;
  const box = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  for (const p of samplePath(bar, 0.01)) {
    if (p.x < box.minX) box.minX = p.x; if (p.x > box.maxX) box.maxX = p.x;
    if (p.y < box.minY) box.minY = p.y; if (p.y > box.maxY) box.maxY = p.y;
    if (p.z < box.minZ) box.minZ = p.z; if (p.z > box.maxZ) box.maxZ = p.z;
  }
  return { minX: box.minX - r, minY: box.minY - r, minZ: box.minZ - r, maxX: box.maxX + r, maxY: box.maxY + r, maxZ: box.maxZ + r };
}

function translateBar(bar: BarPath, d: Point3): BarPath {
  const move = (p: Point3): Point3 => ({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z });
  return {
    ...bar,
    // An arc is its two ends AND its centre: moving the ends alone redraws a hook's bend
    // about a point the bar has left, and the samples swing through whatever is there.
    segments: bar.segments.map((sg) => ({
      ...sg, start: move(sg.start), end: move(sg.end), ...(sg.centre ? { centre: move(sg.centre) } : {}),
    })),
  };
}

const byConflictOrder = (x: BarConflict, y: BarConflict) =>
  y.shortfall - x.shortfall || x.barA.localeCompare(y.barA) || x.barB.localeCompare(y.barB);

/**
 * The bounded repair ladder (see the header): every candidate judged before it is applied.
 *
 * ── What a candidate has to pass ───────────────────────────────────
 *
 * The ladder used to apply every rung's moves blindly and keep whichever rung counted the
 * fewest conflicts. Two things went wrong with that, both measured: a layer was translated once
 * per conflict it took part in, so the moves compounded (46 mm up on a top mat with 43 of room),
 * and nothing bounded a move by the concrete — 28 bars of the 408-member frame and 3 of the
 * span building at a 0,5 m mesh (measured at f8fb3883) ended outside their section, with their
 * clashes counted as resolved. Fewer
 * conflicts is not a better cage when the bars that stopped clashing are in the air.
 *
 * Now a candidate translation of a layer is accepted only when:
 *
 *   1. every bar of the layer stays inside its section and keeps the effective depth the
 *      design verified (`envelope`, built by the caller that knows the members — see
 *      `repair-envelope.ts`);
 *   2. the targeted pair clears its §25.2 rule; and
 *   3. no other pair involving the moved bars appears or gets worse — the clearance to every
 *      other bar is measured on the moved geometry before anything is committed.
 *
 * Each accepted move therefore strictly reduces the conflicts and leaves valid geometry, so the
 * last state IS the best one and there is nothing to roll back. A refused candidate is never
 * applied: when no rung yields a valid move, the bars stay where the ladder received them and
 * the clash comes back in `unresolved` with every candidate and its reason.
 *
 * Candidates are measured on the moved layer and the bars within `REPAIR_REACH` of it — no
 * pair further apart can be reportable — which keeps a rung linear in the conflicts instead of
 * a full sweep per candidate. The session, when there is one, stays the authority on the whole
 * cage: it is updated once per accepted move.
 */
export function repairConflicts(
  bars: readonly BarPath[],
  requiredClearFor: (a: BarPath, b: BarPath) => number,
  tolerances: CollisionTolerances = DEFAULT_TOLERANCES,
  classifyFor?: (a: BarPath, b: BarPath, surfaceClearance: number,
    tangentA?: Point3, tangentB?: Point3) => PairClassification,
  /**
   * `incremental`: opt in only for pure pair policies with fixed context throughout the repair.
   * `envelope`: the section and depth bound of a candidate (`buildRepairEnvelope`); without it
   * only the clearances bound a move, which is right for bars with no member to bound them by.
   */
  options: { incremental?: boolean; envelope?: RepairEnvelope } = {},
): RepairResult {
  const attempts: RepairAttempt[] = [];
  const trace: string[] = [];
  const working = bars.map((b) => ({ ...b, segments: b.segments.map((s) => ({ ...s })) }));

  const collisionOptions = { tolerances, requiredClearFor, classifyFor };
  // Generic callers retain callback invocation semantics; production opts in with pure policies.
  const session = options.incremental ? prepareCollisionRepair(working, collisionOptions) : null;
  try {
    let result = session?.initial ?? detectCollisions(working, collisionOptions);
    const initial = result.conflicts.length;
    if (initial === 0) {
      return { bars: working, conflicts: [], attempts, unresolved: [], moved: [], trace: ['Sin conflictos.'] };
    }
    trace.push(`${initial} conflicto(s) detectado(s); se intenta la escalera de reparación.`);

    const index = new Map(working.map((b, i) => [b.id, i]));
    // The geometry the design verified, which every candidate is judged against.
    const reference = new Map(bars.map((b) => [b.id, b]));
    const offset = new Map<string, Point3>();
    const boxes = working.map(repairBox);
    const maxDia = working.reduce((m, b) => Math.max(m, b.diameterMm), 0) / 1000;
    const layers = new Map<string, string[]>();
    for (const bar of working) {
      if (!bar.layerId || bar.locked) continue;
      const group = layers.get(bar.layerId);
      if (group) group.push(bar.id); else layers.set(bar.layerId, [bar.id]);
    }
    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    let byPair = new Map<string, BarConflict>();
    let byBar = new Map<string, BarConflict[]>();
    const reindex = () => {
      byPair = new Map(result.conflicts.map((c) => [pairKey(c.barA, c.barB), c]));
      byBar = new Map();
      for (const c of result.conflicts) {
        for (const id of [c.barA, c.barB]) {
          const list = byBar.get(id);
          if (list) list.push(c); else byBar.set(id, [c]);
        }
      }
    };
    reindex();
    const tried = new Map<string, RepairCandidate[]>();
    const note = (key: string, c: RepairCandidate) => {
      const list = tried.get(key);
      if (list) list.push(c); else tried.set(key, [c]);
    };

    /** Judge translating `group` by `delta` to clear `target`; the refusal, or the move's conflicts. */
    const judge = (group: readonly string[], delta: Point3, target: string)
      : { rejected: RepairRejection } | { moved: BarPath[]; after: BarConflict[] } => {
      // ── 1. The section and the verified depth ──
      if (options.envelope) {
        for (const id of group) {
          const o = offset.get(id) ?? { x: 0, y: 0, z: 0 };
          const rejected = options.envelope.reject(reference.get(id)!,
            { x: o.x + delta.x, y: o.y + delta.y, z: o.z + delta.z });
          if (rejected) return { rejected };
        }
      }
      // ── 2–3. The clearances, measured on the moved geometry ──
      const ids = new Set(group);
      const moved = group.map((id) => translateBar(working[index.get(id)!], delta));
      /** The first pair of `found` that refuses the move: the target still short, or any other new or worse. */
      const refusal = (found: readonly BarConflict[]): RepairRejection | null => {
        for (const c of found) {
          // Two bars of the moved layer move together; their clearance is the layer's own.
          if (ids.has(c.barA) && ids.has(c.barB)) continue;
          const key = pairKey(c.barA, c.barB);
          const prev = byPair.get(key);
          const bar = ids.has(c.barA) ? c.barA : c.barB;
          const other = bar === c.barA ? c.barB : c.barA;
          if (key === target || !prev) return { reason: 'clearance', bar, with: other, by: c.shortfall };
          // Conflicts carry their shortfall to 0,01 mm; a difference under that is the rounding.
          if (c.shortfall > prev.shortfall + 2e-5) {
            return { reason: 'clearance', bar, with: other, by: c.shortfall - prev.shortfall };
          }
        }
        return null;
      };
      const involving = (cs: readonly BarConflict[]) => cs.filter((c) => ids.has(c.barA) || ids.has(c.barB));

      // The pairs the layer is already in first. Measured on the 408-member frame, nine refusals
      // in ten are one of them — the layer clashes at both ends, and moving it off one joint
      // presses it into the other — and these few bars settle it without the neighbourhood.
      const partners = new Set<string>();
      for (const id of group) for (const c of byBar.get(id) ?? []) {
        for (const o of [c.barA, c.barB]) if (!ids.has(o)) partners.add(o);
      }
      if (partners.size > 0) {
        const early = refusal(involving(detectCollisions(
          [...[...partners].map((id) => working[index.get(id)!]), ...moved], collisionOptions).conflicts));
        if (early) return { rejected: early };
      }

      // Then every bar the moved layer can reach: no new pair anywhere along it.
      const reach = Math.max(REPAIR_REACH, 1.5 * maxDia, tolerances.requiredClear) + tolerances.placement;
      const box = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
      for (const id of group) {
        const b = boxes[index.get(id)!];
        box.minX = Math.min(box.minX, b.minX + Math.min(0, delta.x)); box.maxX = Math.max(box.maxX, b.maxX + Math.max(0, delta.x));
        box.minY = Math.min(box.minY, b.minY + Math.min(0, delta.y)); box.maxY = Math.max(box.maxY, b.maxY + Math.max(0, delta.y));
        box.minZ = Math.min(box.minZ, b.minZ + Math.min(0, delta.z)); box.maxZ = Math.max(box.maxZ, b.maxZ + Math.max(0, delta.z));
      }
      const near: BarPath[] = [];
      for (let i = 0; i < working.length; i++) {
        const b = boxes[i];
        if (ids.has(working[i].id)) continue;
        if (b.minX > box.maxX + reach || b.maxX < box.minX - reach || b.minY > box.maxY + reach
          || b.maxY < box.minY - reach || b.minZ > box.maxZ + reach || b.maxZ < box.minZ - reach) continue;
        near.push(working[i]);
      }
      const after = involving(detectCollisions([...near, ...moved], collisionOptions).conflicts);
      const late = refusal(after);
      if (late) return { rejected: late };
      return { moved, after };
    };

    // ── Nothing here reads a bar id ──
    //
    // Which clash goes first and which bar gives way used to follow the ids: conflicts came in
    // the collision sweep's order (shortfall, then bar ids as text) and the second bar of each
    // pair moved. A bar id carries its element's number (`e13-topI-1`), so the cage depended on
    // how the model was numbered — measured on the 6 m span building, V2's bottom layer moved at
    // one numbering and V5's top layer at another, from the same forces. Both choices are now
    // made on what the bars ARE and where they stand: worst clash first, ties by place; the side
    // that moves less steel (a smaller layer, then a thinner bar) tries first, ties by place.
    // A rung can only reach the id fallback for two clashes at the same point, or two equal bars
    // at the same place, where the order cannot change the outcome.
    const mm = (v: number) => Math.round(v * 10000);
    const byPoint = (p: Point3, q: Point3) => mm(p.z) - mm(q.z) || mm(p.x) - mm(q.x) || mm(p.y) - mm(q.y);
    const byPlace = (x: BarConflict, y: BarConflict) => y.shortfall - x.shortfall || byPoint(x.at, y.at)
      || pairKey(x.barA, x.barB).localeCompare(pairKey(y.barA, y.barB));
    const groupOf = (bar: BarPath) => (bar.layerId ? (layers.get(bar.layerId) ?? [bar.id]) : [bar.id]);
    const givingWay = (a: BarPath, b: BarPath): BarPath[] => [a, b].filter((x) => !x.locked).sort((x, y) =>
      groupOf(x).length - groupOf(y).length || x.diameterMm - y.diameterMm
      || byPoint(centroid(reference.get(x.id)!), centroid(reference.get(y.id)!)) || x.id.localeCompare(y.id));

    // Four rungs, not two. Moving a bar out of one clash can uncover another, and the flagship
    // frame kept improving over four passes; the loop exits early when a rung stops helping, so
    // a model that coordinates in one pass pays for one pass.
    const RUNGS = [
      ['separación mínima', 0.002], ['separación ampliada', 0.006],
      ['separación amplia', 0.012], ['última pasada', 0.020],
    ] as const;

    for (const [rung, margin] of RUNGS) {
      const before = result.conflicts.length;
      let refused = 0;
      for (const snapshot of [...result.conflicts].sort(byPlace)) {
        const key = pairKey(snapshot.barA, snapshot.barB);
        // A move earlier in this rung may already have cleared it.
        const c = byPair.get(key);
        if (!c) continue;
        const a = working[index.get(c.barA) ?? -1];
        const b = working[index.get(c.barB) ?? -1];
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

        for (const movable of givingWay(a, b)) {
          const other = movable === b ? a : b;
          // Push directly AWAY from the other bar, in the plane perpendicular to this bar's
          // own axis. Pushing along a fixed global axis slides a bar along a beam running that
          // way, which separates nothing.
          const away = separationDirection(movable, other, c.at);
          // Within the room the bar has: the part of "away" that keeps its lever arm. The push
          // is lengthened so its component along "away" is still the shortfall plus the margin;
          // a direction left with under a third of it is not a separation but a slide, and is
          // judged as the original push, which the envelope then refuses for what it is.
          const kept = options.envelope ? options.envelope.admissible(reference.get(movable.id)!, away) : away;
          const keptLen = Math.hypot(kept.x, kept.y, kept.z);
          const cos = keptLen > 1e-9 ? (kept.x * away.x + kept.y * away.y + kept.z * away.z) / keptLen : 0;
          const dir = cos >= 1 / 3 ? { x: kept.x / keptLen, y: kept.y / keptLen, z: kept.z / keptLen } : away;
          const shift = (c.shortfall + margin) / (dir === away ? 1 : cos);
          const delta = { x: dir.x * shift, y: dir.y * shift, z: dir.z * shift };

          // ── The rigid-mat invariant ──────────────────────────────────
          //
          // A bar is not a free particle. Bars sharing a `layerId` are one physical layer,
          // placed at a legal §25.2.1 pitch by the candidate and separated from the layer above
          // by the §25.2.2 clear distance. Nudging ONE of them out of its layer breaks both
          // rules to fix a third (measured on the QA fixture: three layer-1 bars lifted 11 mm on
          // their own, leaving 24 mm where §25.2.2 wants 25). So the unit of movement is the
          // LAYER: every bar sharing the movable bar's layer receives the identical translation.
          // A bar with no layer identity moves alone — there is nothing to keep rigid.
          const group = groupOf(movable);
          const verdict = judge(group, delta, key);
          if ('rejected' in verdict) {
            note(key, { rung, moved: movable.id, shift, rejected: verdict.rejected });
            refused++;
            continue;
          }
          note(key, { rung, moved: movable.id, shift });
          const changed = new Set(group);
          group.forEach((id, k) => {
            const i = index.get(id)!;
            working[i] = verdict.moved[k];
            boxes[i] = repairBox(verdict.moved[k]);
            const o = offset.get(id) ?? { x: 0, y: 0, z: 0 };
            offset.set(id, { x: o.x + delta.x, y: o.y + delta.y, z: o.z + delta.z });
          });
          if (session) {
            result = session.update(working, changed);
          } else {
            const conflicts = [
              ...result.conflicts.filter((x) => !changed.has(x.barA) && !changed.has(x.barB)),
              ...verdict.after,
            ].sort(byConflictOrder);
            result = { ...result, conflicts, constructible: conflicts.every((x) => x.severity === 'marginal') };
          }
          reindex();
          break;
        }
      }
      const cleared = before - result.conflicts.length;
      attempts.push({ rung, cleared, remaining: result.conflicts.length });
      trace.push(
        `Rung "${rung}": ${cleared} resuelto(s), ${result.conflicts.length} pendiente(s).`);
      if (refused > 0) {
        trace.push(`Rung "${rung}": ${refused} movimiento(s) rechazado(s) por salir de la sección, ` +
          'reducir la altura útil verificada o invadir la separación de otra barra.');
      }
      if (result.conflicts.length === 0) break;
      // A rung that resolved nothing will not do better with a larger margin on the same
      // geometry.
      if (cleared <= 0) {
        trace.push(`Rung "${rung}" no mejoró el resultado; se conserva el mejor estado previo.`);
        break;
      }
    }

    const unresolved: UnresolvedClash[] = result.conflicts
      .filter((c) => tried.has(pairKey(c.barA, c.barB)))
      .map((c) => ({
        barA: c.barA, barB: c.barB, pairClass: c.pairClass, severity: c.severity,
        shortfall: c.shortfall, elementIds: [...c.elementIds],
        candidates: tried.get(pairKey(c.barA, c.barB))!,
      }));

    if (result.conflicts.length > 0) {
      trace.push(
        `${result.conflicts.length} conflicto(s) no resueltos tras la escalera acotada. Se ` +
        'informan como tales; el resto de la planta sigue produciendo documentación.');
    }

    const moved = [...offset].map(([id, o]) => ({ id, offset: o }));
    return { bars: working, conflicts: result.conflicts, attempts, unresolved, moved, trace };
  } finally { session?.free(); }
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
    // The joint's top face, which `topOffset` is measured down from. A beam is laid about its
    // axis through the node (`generate-beam`: the cage's half depth either side of it), so its
    // top is the node plus half its depth, and the joint's is the highest of them. This read
    // the node itself as the top: every top mat on a layer below the outer one went down by
    // half the beam's depth — 0,28 m on the span fixture's 50 cm beams, 0,36 m on the
    // flagship's 65 cm ones — to near mid-depth, the whole bar with it.
    const topFace = at.z + Math.max(0, ...joint.beams.map((b) => b.depth / 2));

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
      // Down only: a mat already below its layer stays where its own cage put it.
      const shift = Math.min(0, (topFace - alloc.topOffset) - outermost);
      if (Math.abs(shift) < 1e-6) continue;

      for (const bar of mat) {
        byId.set(bar.id, {
          ...bar,
          segments: bar.segments.map((sg) => ({
            ...sg,
            start: { ...sg.start, z: sg.start.z + shift },
            end: { ...sg.end, z: sg.end.z + shift },
            ...(sg.centre ? { centre: { ...sg.centre, z: sg.centre.z + shift } } : {}),
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
    // A bar end that could not be anchored where it ends is an open condition of the member,
    // read off the bar that records it, so the assembly cannot be built past it.
    for (const b of m.bars) {
      for (const side of ['start', 'end'] as const) {
        const a = b.anchorage?.[side];
        if (a?.solution !== 'unresolved') continue;
        const params = {
          bar: b.id, element: m.elementId, end: side, rule: a.rule,
          available: Math.round(a.available * 1000) / 1000, required: Math.round(a.required * 1000) / 1000,
        };
        unsupported.push({
          key: 'detailing.anchorage.unresolved',
          scope: { elementIds: [m.elementId] },
          message: `${b.id} (${side}): ${params.available} m < ${a.rule} ${params.required} m`,
          params,
          refs: m.refs,
        });
      }
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
  //
  // Not where the lines were layered already (`linesLayered`): the generator laid every line's
  // mats at the elevation its rank asks, whole bars, along the whole line (`joint-layers.ts`).
  // Moving again here only the bars that END at a joint lowered those and not the ones running
  // through it, and put two bars of one mat at two heights.
  const layered = input.linesLayered
    ? { bars: allBars, moved: 0 }
    : applyJointLayers(allBars, input.joints, jointCoordination, input.nodePositionOf ?? (() => undefined));
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
    layered.bars, requiredClearFor, input.tolerances, classifyFor,
    { incremental: true, envelope: input.repairEnvelope });
  trace.push(...repair.trace);

  // ── A clash the ladder could not separate without invalid geometry is an open condition ──
  //
  // The conflict itself stays in the conflict list; this records that the repair was tried and
  // why every move was refused, so the assembly cannot be built past it and the document, the
  // memoria and the desk can say what stands in the way: the section, the verified depth, or
  // another bar.
  for (const u of repair.unresolved) {
    const why = (r: RepairRejection['reason']) => u.candidates.filter((c) => c.rejected?.reason === r);
    const mm = (v: number) => Math.round(v * 10000) / 10;
    const outside = why('outsideSection'), depth = why('depthReduced'), clear = why('clearance');
    const params = {
      bar: u.barA, barB: u.barB, element: u.elementIds[0] ?? 0,
      shortfall: mm(u.shortfall), tried: u.candidates.length,
      rungs: new Set(u.candidates.map((c) => c.rung)).size,
      outside: outside.length, outsideBy: mm(Math.max(0, ...outside.map((c) => c.rejected!.by))),
      depth: depth.length, depthBy: mm(Math.max(0, ...depth.map((c) => c.rejected!.by))),
      clearance: clear.length,
    };
    unsupported.push({
      key: 'detailing.clash.unresolved',
      scope: { elementIds: [...u.elementIds] },
      message: `${u.barA} / ${u.barB}: ${params.shortfall} mm; ${params.tried} movimiento(s) rechazado(s) ` +
        `(sección ${params.outside}, altura útil ${params.depth}, separación ${params.clearance})`,
      params,
      refs: [],
    });
  }

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
