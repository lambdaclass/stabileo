/**
 * Slab–column punching: the production collector the engine was waiting for.
 *
 * ── What was missing, and what was not ─────────────────────────────
 *
 * `punching-shear.ts` has been complete since it was written. `derivePunchingDemand` forms
 * the transferred force as `|N_below − N_above|` — an exact joint free body, not an
 * interpolation — and `criticalSection` already truncates the perimeter at a free edge.
 * Footings have driven both for several revisions.
 *
 * What did not exist was the COLLECTOR: at a slab–column joint the two axial forces are per
 * COMBINATION and live on the column element ends, and nothing assembled them. So every
 * column-supported panel reported its governing check as UNSUPPORTED while the engine that
 * could answer it sat one import away. This module is that collector.
 *
 * ── The free body, stated completely ───────────────────────────────
 *
 * Cut a body out of the floor bounded by the critical perimeter at d/2 from the column
 * faces, and cut through the columns above and below. Vertical equilibrium gives
 *
 *     ΔN  =  V_u  +  F_direct  +  q_u · A_enclosed
 *
 * where
 *
 *   ΔN                the step in column axial force across the joint, compression positive:
 *                     everything delivered into the column at this level
 *   V_u               the two-way shear crossing the critical perimeter — the punching demand
 *   F_direct          load that reaches the column WITHOUT crossing the perimeter: the end
 *                     shears of beams framing into the joint, and any load applied at the
 *                     joint node itself
 *   q_u · A_enclosed  the surface load standing on the slab inside the perimeter
 *
 * Every term on the right is measured, so V_u is what is left. `F_direct` matters and is the
 * term a naive collector drops: at a joint where beams frame into the column, most of the
 * floor load arrives through the beams, and calling the whole axial step "punching" would
 * fail an ordinary beam-and-slab floor on a mechanism that is not carrying it. It is deducted
 * because it is KNOWN — the branch's rule is conservative where a quantity is unknown and
 * exact where it is measured, and beam end shears at a joint are measured.
 *
 * ── Why the residual is a gate and not a decoration ────────────────
 *
 * The identity above is what defines V_u here, so it closes to rounding BY CONSTRUCTION — and
 * that is exactly what makes its failure informative. It cannot close when the deductions
 * exceed the axial step, which is what a stale analysis, a missing column force or a joint
 * whose beams were solved against different loads all look like. In that case `V_u` would be
 * a negative number floored at zero: a passing punching check produced by arithmetic rather
 * than by capacity. So the residual is measured against its own denominator, and a joint that
 * cannot establish it returns UNSUPPORTED with the shortfall named, never a verified check.
 *
 * ── Position is measured from the slab around the joint ────────────
 *
 * α_s (§22.6.5.3) is tabulated for interior, edge and corner and for nothing else, so the
 * position cannot be assumed. It is measured as the total interior ANGLE of slab material
 * meeting the joint: 360° interior, 180° in one run edge, 90° corner. The angle — rather than
 * a count of adjoining elements — is what a meshed floor needs, where one joint can have two
 * neighbours or eight and still be the same interior joint.
 *
 * Two patterns are refused rather than approximated, and they are the same two the footing
 * path already refuses: 180° arriving as two OPPOSITE runs is a strip-like perimeter that is
 * none of the three tabulated cases, and 270° is a re-entrant corner whose perimeter is a
 * sixth shape again.
 *
 * Pure: no store, no runes, no i18n. Lengths m, forces kN, stresses MPa.
 */

import type { ClauseRef } from '../../codes/regulation';
import type { Maturity } from '../../codes/maturity';
import { msg, type EngineMessage } from '../../codes/message';
import {
  PHI_SHEAR, checkPunchingShear, criticalSection, punchingResistance,
  type ColumnPosition,
} from './punching-shear';
import type { CheckStatus } from './foundation-check';
import type { FloorNode } from './run-floor-design';

// ─── What the store collects ─────────────────────────────────────

/** One combination's forces at a slab–column joint. */
export interface SlabJointForce {
  combinationId: number;
  combinationName: string;
  /**
   * Column axial force immediately BELOW the joint, compression positive, kN.
   *
   * Null when there is no column below — a joint at the lowest storey of the frame. Null is
   * not zero: a zero would enter the axial step as a measured value.
   */
  axialBelow: number | null;
  /** Column axial force immediately ABOVE the joint, compression positive, kN. */
  axialAbove: number | null;
  /**
   * Vertical load reaching the column without crossing the critical perimeter, kN, downward
   * positive: the end shears of beams framing into the joint plus any load applied at the
   * joint node.
   */
  directlyDelivered: number;
  /**
   * Step in the column end moments across the joint, kN·m — the unbalanced moment the
   * connection transfers, about global x and y.
   *
   * Collected and PASSED rather than omitted. §8.4.4.2 eccentric-shear moment transfer is
   * not implemented, and the engine refuses a joint whose unbalanced moment is significant
   * instead of reporting a direct-shear pass. Dropping these two numbers would turn that
   * refusal into exactly the false pass it exists to prevent: an eccentric joint approved on
   * a check that never saw its eccentricity.
   */
  unbalancedMomentX: number;
  unbalancedMomentY: number;
}

/** A joint where a slab panel supports a column, with everything measured at it. */
export interface SlabColumnJoint {
  nodeId: number;
  /** Plan position of the joint, m — the control perimeter is centred on it. */
  at: { x: number; y: number };
  /**
   * The column whose section sets the critical perimeter.
   *
   * The column BELOW when there is one: the perimeter is the surface the slab punches
   * against, and that is the supporting column's face. A joint with only a column above —
   * a column hanging from the slab — uses that one, because it is the only face there is.
   */
  columnElementId: number;
  /** Column plan dimensions, m. */
  b: number;
  h: number;
  elementBelow: number | null;
  elementAbove: number | null;
  forces: readonly SlabJointForce[];
}

// ─── Position, by the angle of slab around the joint ─────────────

/** A slab shell adjoining the joint, in plan. */
export interface AdjoiningShell {
  elementId: number;
  nodeIds: readonly number[];
  points: readonly FloorNode[];
}

export type JointPattern =
  /** 180° in two opposite runs — strip-like; §22.6.5.3 tabulates no α_s for it. */
  | 'oppositeRuns'
  /** 270° — a re-entrant corner. A sixth perimeter shape, also untabulated. */
  | 'reEntrant'
  /** Slab arrives in disjoint runs that are not the opposite-run case. */
  | 'disjointRuns'
  /** No slab meets the joint at all — nothing to punch. */
  | 'noSlab'
  /** A coverage angle that is none of 90 / 180 / 270 / 360 within tolerance. */
  | 'skewed';

export interface JointPositionResult {
  position: ColumnPosition | null;
  /** Total interior angle of slab meeting the joint, degrees. */
  coverageDeg: number;
  /** How many contiguous angular runs the slab arrives in. */
  runs: number;
  /** Sides of the critical perimeter truncated: 0 interior, 1 edge, 2 corner. */
  truncatedSides: number;
  /**
   * Bearing of the bisector of the LARGEST uncovered sector, degrees CCW from +x — the
   * direction the free edge faces. Null when the joint is interior.
   *
   * The drawing needs it: a truncated perimeter drawn with its opening on the wrong side is
   * a perimeter of the right length in the wrong place.
   */
  openBearingDeg: number | null;
  pattern?: JointPattern;
}

/** Angular tolerance on the four tabulated coverages, degrees. */
const ANGLE_TOL = 15;

const TWO_PI = Math.PI * 2;

function norm(a: number): number {
  let v = a % TWO_PI;
  if (v < 0) v += TWO_PI;
  return v;
}

/**
 * The interior sector one shell subtends at the joint.
 *
 * The two polygon edges incident to the node give two bearings; the sweep between them is
 * taken in the direction that contains the shell's own centroid, so a re-entrant or reflex
 * corner is measured as the angle the material actually occupies rather than its complement.
 */
function sectorAt(
  nodeId: number, shell: AdjoiningShell,
): { start: number; width: number } | null {
  const n = shell.nodeIds.length;
  const i = shell.nodeIds.indexOf(nodeId);
  if (i < 0 || n < 3 || shell.points.length !== n) return null;
  const at = shell.points[i];
  const next = shell.points[(i + 1) % n];
  const prev = shell.points[(i - 1 + n) % n];
  const a1 = Math.atan2(next.y - at.y, next.x - at.x);
  const a2 = Math.atan2(prev.y - at.y, prev.x - at.x);
  if (!Number.isFinite(a1) || !Number.isFinite(a2)) return null;

  let cx = 0;
  let cy = 0;
  for (const p of shell.points) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  const toCentroid = norm(Math.atan2(cy - at.y, cx - at.x) - a1);

  const ccw = norm(a2 - a1);
  // The sweep a1 → a2 is the interior one when the centroid lies inside it.
  if (ccw > 1e-9 && toCentroid <= ccw) return { start: norm(a1), width: ccw };
  return { start: norm(a2), width: TWO_PI - ccw };
}

/**
 * Where the joint sits in the floor: interior, edge, corner, or none of the three.
 *
 * `adjoining` is every slab shell at the joint's own level that lists the node — the
 * caller's level grouping is what makes this a question about one floor rather than about the
 * whole building.
 */
export function slabJointPosition(
  nodeId: number, adjoining: readonly AdjoiningShell[],
): JointPositionResult {
  const sectors = adjoining
    .map((s) => sectorAt(nodeId, s))
    .filter((s): s is { start: number; width: number } => s !== null && s.width > 1e-6)
    // Deterministic: the run merge below walks this order.
    .sort((a, b) => a.start - b.start);

  if (sectors.length === 0) {
    return {
      position: null, coverageDeg: 0, runs: 0, truncatedSides: 0,
      openBearingDeg: null, pattern: 'noSlab',
    };
  }

  // Merge the sectors into contiguous runs on the circle. Touching sectors — the normal case
  // for a meshed floor, where neighbours share an edge exactly — merge into one run.
  const eps = 1e-6;
  type Run = { start: number; end: number };
  const runs: Run[] = [];
  for (const s of sectors) {
    const r = { start: s.start, end: s.start + s.width };
    const last = runs[runs.length - 1];
    if (last && r.start <= last.end + eps) {
      last.end = Math.max(last.end, r.end);
    } else {
      runs.push(r);
    }
  }
  // The first and last run may join across 0.
  if (runs.length > 1) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (last.end >= first.start + TWO_PI - eps) {
      first.start = last.start - TWO_PI;
      runs.pop();
    }
  }

  const coverage = runs.reduce((s, r) => s + Math.min(TWO_PI, r.end - r.start), 0);
  const coverageDeg = +((coverage * 180) / Math.PI).toFixed(3);
  const runCount = runs.length;

  // The gaps, so the drawing knows which way the free edge faces.
  const gapBearing = (): number | null => {
    if (runCount === 0) return null;
    let widest = -1;
    let mid = 0;
    for (let i = 0; i < runCount; i++) {
      const end = runs[i].end;
      const nextStart = runs[(i + 1) % runCount].start + (i + 1 === runCount ? TWO_PI : 0);
      const gap = nextStart - end;
      if (gap > widest) { widest = gap; mid = end + gap / 2; }
    }
    if (widest <= 1e-6) return null;
    return +((norm(mid) * 180) / Math.PI).toFixed(3);
  };

  const near = (deg: number, target: number) => Math.abs(deg - target) <= ANGLE_TOL;

  if (coverageDeg >= 360 - ANGLE_TOL) {
    return {
      position: 'interior', coverageDeg, runs: runCount, truncatedSides: 0,
      openBearingDeg: null,
    };
  }

  if (runCount !== 1) {
    // Two runs adding to a half turn, facing each other, is the strip-like condition the
    // footing path already refuses by name.
    const opposite = runCount === 2 && near(coverageDeg, 180);
    return {
      position: null, coverageDeg, runs: runCount,
      truncatedSides: 0, openBearingDeg: gapBearing(),
      pattern: opposite ? 'oppositeRuns' : 'disjointRuns',
    };
  }

  if (near(coverageDeg, 90)) {
    return {
      position: 'corner', coverageDeg, runs: 1, truncatedSides: 2,
      openBearingDeg: gapBearing(),
    };
  }
  if (near(coverageDeg, 180)) {
    return {
      position: 'edge', coverageDeg, runs: 1, truncatedSides: 1,
      openBearingDeg: gapBearing(),
    };
  }
  return {
    position: null, coverageDeg, runs: 1, truncatedSides: 0,
    openBearingDeg: gapBearing(),
    pattern: near(coverageDeg, 270) ? 'reEntrant' : 'skewed',
  };
}

// ─── The check ───────────────────────────────────────────────────

/** One combination's contribution, kept whole so the governing choice is auditable. */
export interface SlabPunchingContribution {
  combinationId: number;
  combinationName: string;
  axialBelow: number | null;
  axialAbove: number | null;
  /** |below − above| with a missing column read as an open free-body face, kN. */
  axialStep: number;
  /** Beam end shears and nodal load at the joint, kN. */
  directlyDelivered: number;
  /** q_u · A_enclosed, kN. */
  loadInsidePerimeter: number;
  /** Magnitude of the unbalanced moment transferred at the joint, kN·m. */
  unbalancedMoment: number;
  /** Two-way shear crossing the critical perimeter, kN. */
  Vu: number;
  utilization: number;
  status: CheckStatus;
  /** ΔN − (V_u + F_direct + q_u·A_enc), kN. Zero to rounding when the free body closes. */
  equilibriumResidual: number;
  /** What the residual is measured against, kN. */
  residualDenominator: number;
}

export interface SlabPunchingResult {
  nodeId: number;
  /** Plan position of the joint, m — carried through so the drawing can place the perimeter. */
  at: { x: number; y: number };
  columnElementId: number;
  elementBelow: number | null;
  elementAbove: number | null;
  status: CheckStatus;
  position: ColumnPosition | null;
  truncatedSides: number;
  coverageDeg: number;
  openBearingDeg: number | null;
  /** Governing values, copied from the governing contribution. */
  Vu: number;
  phiVc: number;
  utilization: number;
  axialAbove: number;
  axialBelow: number;
  equilibriumResidual: number | null;
  governingCombination: string | null;
  contributions: SlabPunchingContribution[];
  /** The critical perimeter, for the drawing and the report. */
  perimeter: {
    bo: number;
    beta: number;
    d: number;
    enclosedArea: number;
    /** Half-side of the critical rectangle in x and y, m — b/2 + d/2 and h/2 + d/2. */
    halfX: number;
    halfY: number;
  } | null;
  maturity: Maturity;
  unsupported: EngineMessage[];
  assumptions: EngineMessage[];
  refs: ClauseRef[];
}

export interface SlabPunchingInput {
  panelId: string;
  joint: SlabColumnJoint;
  position: JointPositionResult;
  /** Slab thickness and cover at the joint, m. */
  thickness: number;
  cover: number;
  /**
   * Average top-mat bar diameter, mm — the depth punching cracks form at.
   *
   * Averaged over the two mat directions because they sit at different depths and the
   * perimeter is a single surface. That average is recorded as an assumption on the result.
   */
  topBarDiameterMm: number;
  fc: number;
  /** Factored area load on the panel, kPa. */
  qu: number;
  /** True when the panel's own stresses came from an analysis older than the model. */
  staleAnalysis: boolean;
}

/** Relative tolerance the free body must close to. */
export const RESIDUAL_TOL = 1e-6;

/** Below this, a force is not a force — used to keep 0/0 out of the residual ratio. */
const FORCE_FLOOR = 1e-9;

function unsupportedResult(
  input: SlabPunchingInput, unsupported: EngineMessage[],
): SlabPunchingResult {
  const { joint, position } = input;
  return {
    nodeId: joint.nodeId,
    at: { ...joint.at },
    columnElementId: joint.columnElementId,
    elementBelow: joint.elementBelow,
    elementAbove: joint.elementAbove,
    status: 'UNSUPPORTED',
    position: position.position,
    truncatedSides: position.truncatedSides,
    coverageDeg: position.coverageDeg,
    openBearingDeg: position.openBearingDeg,
    // Zeros with an UNSUPPORTED status are not a claim that the demand is zero. `status` is
    // what a consumer reads and `unsupported` says what is missing; the same contract the
    // footing records already use.
    Vu: 0, phiVc: 0, utilization: 0, axialAbove: 0, axialBelow: 0,
    equilibriumResidual: null,
    governingCombination: null,
    contributions: [],
    perimeter: null,
    maturity: 'UNSUPPORTED',
    unsupported,
    assumptions: [],
    refs: [],
  };
}

/**
 * Punching at one slab–column joint, over every combination.
 *
 * The governing combination is the one with the largest V_u, and every combination
 * considered is retained: the choice a design turns on has to be auditable, and a reader who
 * cannot see the combinations that lost cannot check the one that won.
 */
export function checkSlabJointPunching(input: SlabPunchingInput): SlabPunchingResult {
  const { joint, position, panelId } = input;

  if (input.staleAnalysis) {
    return unsupportedResult(input, [msg('detailing.slabPunching.staleAnalysis', {
      panel: panelId, node: joint.nodeId, column: joint.columnElementId,
    })]);
  }

  if (position.position === null) {
    const key = position.pattern === 'oppositeRuns'
      ? 'detailing.slabPunching.oppositeRuns'
      : position.pattern === 'reEntrant'
        ? 'detailing.slabPunching.reEntrant'
        : position.pattern === 'noSlab'
          ? 'detailing.slabPunching.noSlab'
          : position.pattern === 'disjointRuns'
            ? 'detailing.slabPunching.disjointRuns'
            : 'detailing.slabPunching.skewed';
    return unsupportedResult(input, [msg(key, {
      panel: panelId, node: joint.nodeId, column: joint.columnElementId,
      coverage: position.coverageDeg,
    })]);
  }

  const d = input.thickness - input.cover - input.topBarDiameterMm / 1000;
  if (!(d > 0) || !(joint.b > 0) || !(joint.h > 0) || !(input.fc > 0)) {
    return unsupportedResult(input, [msg('detailing.slabPunching.missingGeometry', {
      panel: panelId, node: joint.nodeId, column: joint.columnElementId,
      thickness: +input.thickness.toFixed(4), cover: +input.cover.toFixed(4),
      b: +joint.b.toFixed(4), h: +joint.h.toFixed(4), fc: +input.fc.toFixed(2),
    })]);
  }

  if (joint.forces.length === 0) {
    return unsupportedResult(input, [msg('detailing.slabPunching.noColumnForces', {
      panel: panelId, node: joint.nodeId, column: joint.columnElementId,
    })]);
  }

  const critical = criticalSection(joint.b, joint.h, d, position.position);
  const resistance = punchingResistance(input.fc, critical, position.position);
  const phiVcForce = PHI_SHEAR * resistance.vc * critical.bo * critical.d * 1000;
  const insideLoad = input.qu * critical.enclosedArea;

  const assumptions: EngineMessage[] = [
    msg('detailing.slabPunching.averageMatDepth', {
      panel: panelId, node: joint.nodeId,
      d: +d.toFixed(4), diameter: input.topBarDiameterMm,
    }),
  ];
  const unsupported: EngineMessage[] = [];

  // A missing column above or below is a real free-body boundary — a roof joint has no column
  // above and a joint at the lowest framed level has none below — so it is read as an open
  // face rather than as a zero force. It is stated, because at a boundary the whole axial
  // force of the one column present becomes the step, and a reader has to know that is why.
  if (joint.elementAbove === null) {
    assumptions.push(msg('detailing.slabPunching.noColumnAbove', {
      panel: panelId, node: joint.nodeId, column: joint.columnElementId,
    }));
  }
  if (joint.elementBelow === null) {
    assumptions.push(msg('detailing.slabPunching.noColumnBelow', {
      panel: panelId, node: joint.nodeId, column: joint.columnElementId,
    }));
  }

  const contributions: SlabPunchingContribution[] = [];
  const failedResidual: SlabPunchingContribution[] = [];

  // Sorted so the governing pick and the reported name cannot depend on collection order.
  const ordered = [...joint.forces].sort((a, b) => a.combinationId - b.combinationId);

  for (const f of ordered) {
    const below = f.axialBelow ?? 0;
    const above = f.axialAbove ?? 0;
    const axialStep = Math.abs(below - above);
    const deducted = f.directlyDelivered + insideLoad;
    const vuRaw = axialStep - deducted;

    const residual = axialStep - (Math.max(0, vuRaw) + deducted);
    const denominator = Math.max(Math.abs(axialStep), Math.abs(deducted), FORCE_FLOOR);
    const contribution: SlabPunchingContribution = {
      combinationId: f.combinationId,
      combinationName: f.combinationName,
      axialBelow: f.axialBelow,
      axialAbove: f.axialAbove,
      axialStep,
      directlyDelivered: f.directlyDelivered,
      loadInsidePerimeter: insideLoad,
      unbalancedMoment: Math.hypot(f.unbalancedMomentX, f.unbalancedMomentY),
      Vu: Math.max(0, vuRaw),
      utilization: phiVcForce > 0 ? Math.max(0, vuRaw) / phiVcForce : 0,
      status: phiVcForce > 0 && Math.max(0, vuRaw) <= phiVcForce ? 'OK' : 'FAIL',
      equilibriumResidual: residual,
      residualDenominator: denominator,
    };

    if (Math.abs(residual) / denominator > RESIDUAL_TOL) {
      // V_u would have been a negative number floored at zero: a passing check produced by
      // arithmetic. Kept, so the report can name the combination and the shortfall, but never
      // offered as a result.
      failedResidual.push(contribution);
      continue;
    }
    contributions.push(contribution);
  }

  if (contributions.length === 0) {
    const worst = failedResidual.reduce<SlabPunchingContribution | null>(
      (m, c) => (m === null || Math.abs(c.equilibriumResidual) > Math.abs(m.equilibriumResidual)
        ? c : m), null);
    const result = unsupportedResult(input, [
      msg('detailing.slabPunching.residualNotEstablished', {
        panel: panelId, node: joint.nodeId, column: joint.columnElementId,
        combination: worst?.combinationName ?? '—',
        residual: +(worst?.equilibriumResidual ?? 0).toFixed(2),
        step: +(worst?.axialStep ?? 0).toFixed(2),
        deducted: +((worst?.directlyDelivered ?? 0) + insideLoad).toFixed(2),
      }),
    ]);
    // The failed combinations travel with the result: a residual nobody can see is a
    // limitation the reader is asked to take on trust.
    return { ...result, contributions: failedResidual, assumptions };
  }

  if (failedResidual.length > 0) {
    unsupported.push(msg('detailing.slabPunching.someCombinationsUnbalanced', {
      panel: panelId, node: joint.nodeId,
      count: failedResidual.length, total: ordered.length,
      combinations: failedResidual.map((c) => c.combinationName).join(', '),
    }));
  }

  // Governing = largest V_u; ties broken by combination id so the answer is deterministic.
  const governing = contributions.reduce((m, c) => (
    c.Vu > m.Vu || (c.Vu === m.Vu && c.combinationId < m.combinationId) ? c : m),
  contributions[0]);

  const governingForce = ordered.find((f) => f.combinationId === governing.combinationId)!;

  // Run the ENGINE's own check on the governing case, so the status and the utilisation the
  // record carries are the engine's numbers rather than this module's restatement of them.
  // `loadInsidePerimeter` is handed the equivalent pressure of everything deducted, so the
  // engine solves the same free body: the beam shears and the nodal load are a real part of
  // it, and folding them into the pressure is how they enter a signature that takes kPa.
  const totalDeducted = governing.directlyDelivered + insideLoad;
  const engineCheck = checkPunchingShear({
    fc: input.fc,
    columnB: joint.b, columnH: joint.h,
    d, position: position.position,
    demand: {
      axialBelow: governing.axialBelow ?? 0,
      axialAbove: governing.axialAbove ?? 0,
      loadInsidePerimeter: totalDeducted / critical.enclosedArea,
      unbalancedMomentX: governingForce.unbalancedMomentX,
      unbalancedMomentY: governingForce.unbalancedMomentY,
    },
  });

  // The engine's third outcome is a REFUSAL, not a failure: a joint transferring a
  // significant unbalanced moment is unverified under §8.4.4.2, and reporting it as FAIL
  // would claim a capacity comparison that was never made.
  if (engineCheck.status === 'UNSUPPORTED') {
    unsupported.push(msg('detailing.slabPunching.momentTransfer', {
      panel: panelId, node: joint.nodeId, column: joint.columnElementId,
      combination: governing.combinationName,
      moment: +governing.unbalancedMoment.toFixed(2),
      shear: +governing.Vu.toFixed(2),
    }));
  }

  const allContributions = [...contributions, ...failedResidual]
    .sort((a, b) => a.combinationId - b.combinationId);

  return {
    nodeId: joint.nodeId,
    at: { ...joint.at },
    columnElementId: joint.columnElementId,
    elementBelow: joint.elementBelow,
    elementAbove: joint.elementAbove,
    status: engineCheck.status,
    position: position.position,
    truncatedSides: position.truncatedSides,
    coverageDeg: position.coverageDeg,
    openBearingDeg: position.openBearingDeg,
    Vu: engineCheck.demand.Vu,
    phiVc: engineCheck.phiVc * critical.bo * critical.d * 1000,
    utilization: engineCheck.utilization,
    axialAbove: governing.axialAbove ?? 0,
    axialBelow: governing.axialBelow ?? 0,
    equilibriumResidual: governing.equilibriumResidual,
    governingCombination: governing.combinationName,
    contributions: allContributions,
    perimeter: {
      bo: critical.bo,
      beta: critical.beta,
      d: critical.d,
      enclosedArea: critical.enclosedArea,
      halfX: joint.b / 2 + d / 2,
      halfY: joint.h / 2 + d / 2,
    },
    // The demand is exact and the resistance is clause-grounded, but no worked example has
    // been reproduced against it, which is the same bar every other family row is held to. A
    // joint the engine refused carries UNSUPPORTED: it has no verified check to be provisional
    // about.
    maturity: engineCheck.status === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'IMPLEMENTED_PROVISIONAL',
    unsupported,
    assumptions,
    refs: [...critical.refs, ...resistance.refs, ...engineCheck.refs],
  };
}
