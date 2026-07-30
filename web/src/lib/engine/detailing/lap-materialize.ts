/**
 * Turn splice schedules into physical steel.
 *
 * ── Why this module exists ─────────────────────────────────────────
 *
 * `splice.ts` answers a question: *may* these two collinear layouts be joined legally?
 * That answer is what the coordination search needs, and it is emphatically NOT detailing.
 * A compatibility oracle result cannot reach COORDINATED or CONSTRUCTIBLE, because nothing
 * has moved: the bars still stop where the generator put them, the drawings still show two
 * members meeting end to end with no continuity, and the schedule still lists two bars where
 * the builder will place one.
 *
 * Worse, it makes the collision numbers meaningless in the pessimistic direction. Before
 * materialisation the two members' bar sets simply coexist near the joint with no rule
 * saying why, so every lapped pair reads as a clash. The 3,090 and 9,299 conflict counts
 * were both measured in that state and neither was a final measurement of anything.
 *
 * ── The three physical outcomes ────────────────────────────────────
 *
 * A schedule is not one detail, it is three, and conflating them is what produced eight
 * coincident centrelines where a drawing should show eight bars:
 *
 *   continuous    The two layouts put their bars in the SAME transverse positions. There is
 *                 no lap here at all and never was — the correct detail is ONE bar running
 *                 through the joint, owned by both members. Modelling that as two lapped
 *                 bars invents steel that nobody will place and a clash that cannot happen.
 *                 The two BarPaths are FUSED.
 *
 *   contactLap    §25.5.1.2. The bars touch. Both exist, at their own transverse positions,
 *                 and only over the lap interval.
 *
 *   nonContactLap §25.5.1.3. Same, with a transverse pitch ≤ min(lst/5, 150 mm).
 *
 * For the two lap kinds the overlap is CONFINED: the incoming bar is extended past the
 * joint to the far end of the lap interval and the outgoing bar's start is pulled back to
 * the near end. They coexist over exactly the lap length the class earned, and nowhere else.
 *
 * ── Pairing is recomputed from geometry, not read from the schedule ─
 *
 * `SplicePair.fromAcross`/`toAcross` are expressed in each member's own transverse frame,
 * and two members meeting at a joint routinely disagree about which way that frame points
 * (element nodeI/nodeJ ordering is arbitrary). Reading those numbers directly mirrors the
 * layout of every second member on a line. So the pairing is redone here in the LINE frame,
 * from where the bars actually are, using the same order-preserving rule `pairUp` uses.
 *
 * Pure: no store, no runes, no i18n.
 */

import {
  developedLength, straightSegment,
  type BarPath, type BarSegment, type Point3,
} from '../../codes/cirsoc201/bar-geometry';
import { msg, type EngineMessage } from '../../codes/message';
import type { ClauseRef } from '../../codes/regulation';
import type { SpliceClass, SpliceSchedule, TransitionKind } from './splice';

/** Bars closer than this in the transverse frame are the same position. */
const SAME_POSITION_M = 0.004;
/** A bar end within this distance of the joint is a bar that terminates AT the joint. */
const AT_JOINT_M = 0.35;
/** Two bars within this vertical distance of one another belong to the same layer. */
const SAME_LEVEL_M = 0.020;
/**
 * Greatest total vertical span one layer may have, m.
 *
 * Below §25.2.2's 25 mm between layers, so two genuine layers can never merge however
 * finely the elevations between them are graded.
 */
const MAX_LAYER_SPAN_M = 0.024;
/**
 * How far apart two members' corresponding layers may sit and still be lapped, m.
 *
 * Generous, because the members meeting at a support routinely differ in depth and in bar
 * size, and neither makes their top steel a different layer. Beyond it there is genuinely
 * no counterpart.
 */
const LAYER_MATCH_M = 0.080;

/**
 * A materialised lap: the interval over which two real bars coexist, in global coordinates.
 *
 * This is what the collision engine, the drawings and the bar schedule consume. Without it
 * the collision engine has no way to know that two bars sharing a stretch of beam are a
 * detail rather than a defect.
 */
export interface LapInterval {
  jointId: string;
  /** Bar continuing through the joint. */
  fromBarId: string;
  /** Bar starting after the joint. */
  toBarId: string;
  /** Global start of the shared stretch. */
  from: Point3;
  /** Global end of the shared stretch. */
  to: Point3;
  lapLength: number;
  kind: Exclude<TransitionKind, 'continuous'>;
  spliceClass: SpliceClass;
  /** Centre-to-centre transverse offset as BUILT, m. */
  offset: number;
  /** §25.5.1.3 limit that applies to `offset`, m. Infinity for a contact lap. */
  maxOffset: number;
  refs: ClauseRef[];
}

/** A fusion: two generated bars that are physically one bar. */
export interface FusedBar {
  jointId: string;
  keptBarId: string;
  removedBarId: string;
  ownerElementIds: number[];
}

export interface MaterialisationInput {
  /** Every generated bar, keyed by owning member. Mutated copies are returned. */
  barsByMember: ReadonlyMap<number, readonly BarPath[]>;
  transitions: readonly PlannedTransition[];
}

export interface PlannedTransition {
  jointId: string;
  /** Member whose bars continue through the joint. */
  fromElementId: number;
  /** Member whose bars begin after the joint. */
  toElementId: number;
  /** Joint location, global. */
  jointPoint: Point3;
  /** Unit vector along the line, pointing from the `from` member toward the `to` member. */
  axis: Point3;
  /** Unit vector transverse to the line, in plan. */
  across: Point3;
  schedule: SpliceSchedule;
}

export interface MaterialisationResult {
  /** The bar set after fusion and lap confinement, keyed by owning member. */
  barsByMember: Map<number, BarPath[]>;
  laps: LapInterval[];
  fused: FusedBar[];
  /** Transitions that produced no geometry, and why. Never silently dropped. */
  unmaterialised: Array<{ jointId: string; reason: EngineMessage }>;
}

function dot(a: Point3, b: Point3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }

function rel(p: Point3, o: Point3): Point3 {
  return { x: p.x - o.x, y: p.y - o.y, z: p.z - o.z };
}

function along(p: Point3, t: PlannedTransition): number {
  return dot(rel(p, t.jointPoint), t.axis);
}

function acrossOf(p: Point3, t: PlannedTransition): number {
  return dot(rel(p, t.jointPoint), t.across);
}

/**
 * The bar's body: its longest straight segment.
 *
 * Hooks live in `segments` as an extension plus an arc, so segments[0] is not reliably the
 * bar itself. The body is always the longest straight run — a hook extension is a few bar
 * diameters and a beam bar is metres.
 */
function bodyIndex(bar: BarPath): number {
  let best = -1;
  let bestLen = -1;
  bar.segments.forEach((s, i) => {
    if (s.kind === 'straight' && s.length > bestLen) { bestLen = s.length; best = i; }
  });
  return best;
}

/** Move a point to a given along-coordinate, keeping its transverse and vertical position. */
function atAlong(p: Point3, target: number, t: PlannedTransition): Point3 {
  const delta = target - along(p, t);
  return { x: p.x + t.axis.x * delta, y: p.y + t.axis.y * delta, z: p.z + t.axis.z * delta };
}

function withSegments(bar: BarPath, segments: BarSegment[], extra?: Partial<BarPath>): BarPath {
  return {
    ...bar, segments,
    cuttingLength: developedLength(segments),
    source: 'coordinated',
    ...extra,
  };
}

/** Candidate bar ends at one side of a joint, in the line frame. */
interface Endpoint {
  bar: BarPath;
  /** Index of the body segment. */
  body: number;
  /** True when the body's `end` is the joint-side terminus. */
  endIsJointSide: boolean;
  across: number;
  level: number;
}

function endpointsAt(
  bars: readonly BarPath[], t: PlannedTransition, side: 'from' | 'to',
): Endpoint[] {
  const out: Endpoint[] = [];
  for (const bar of bars) {
    if (bar.role !== 'longitudinal' || bar.locked) continue;
    const body = bodyIndex(bar);
    if (body < 0) continue;
    const seg = bar.segments[body];
    const aStart = along(seg.start, t);
    const aEnd = along(seg.end, t);
    // The joint-side terminus is the end nearer the joint; it must actually reach it.
    const endIsJointSide = Math.abs(aEnd) <= Math.abs(aStart);
    const near = endIsJointSide ? aEnd : aStart;
    if (Math.abs(near) > AT_JOINT_M) continue;
    // The `from` member's bar arrives from behind the joint; the `to` member's leaves ahead.
    const far = endIsJointSide ? aStart : aEnd;
    if (side === 'from' ? far > 0 : far < 0) continue;
    const p = endIsJointSide ? seg.end : seg.start;
    out.push({ bar, body, endIsJointSide, across: acrossOf(p, t), level: p.z });
  }
  return out;
}

/**
 * Group endpoints into physical layers.
 *
 * ── Why not rounding ───────────────────────────────────────────────
 *
 * This used to key on `round(level / 20 mm)`. Fixed-grid rounding has a boundary, and two
 * bars a few millimetres apart land on opposite sides of it whenever they happen to
 * straddle one. A Ø32 top bar and a Ø20 top bar sit 6 mm apart in elevation — the bar
 * centre is half a diameter below the face — so at a support where the two members carry
 * different diameters they fell into different buckets, never paired, and their steel
 * simply coexisted. That was 405 parallel cross-member overlaps.
 *
 * The elevation difference was never a layer difference. Diameter is bar geometry; it is
 * not a layer identity. What makes a layer is the face, the elevation the bars actually
 * share, and the region they run through.
 *
 * Clustering has no grid and therefore no boundary: bars join a layer when they are within
 * `SAME_LEVEL_M` of a bar already in it. A top mat and a bottom mat are half a metre apart
 * and never merge; a Ø32 and a Ø20 in the same mat are 6 mm apart and always do.
 *
 * ── And why pairwise proximity alone is not enough either ──────────
 *
 * Pure single linkage is transitive, so it chains: elevations 0, 15 and 30 mm all join one
 * cluster at a 20 mm threshold even though the first and last bars are 30 mm apart and are
 * plainly two layers. §25.2.2 puts 25 mm between layers, so a chain of three is exactly the
 * case that arises in a real two-layer mat.
 *
 * So the cluster also has a bounded TOTAL SPAN. A bar joins only if it is within
 * `SAME_LEVEL_M` of the previous bar AND within `MAX_LAYER_SPAN_M` of the cluster's lowest.
 * Both conditions, because either alone is wrong: proximity alone chains, and span alone
 * would split a wide single layer of graded diameters.
 *
 * This remains a geometric FALLBACK. An explicit layer identity carried from candidate
 * generation through assignment, materialisation and persistence is the right answer and
 * is what `barLayers` is for; clustering is what happens when a bar reaches here without
 * one.
 */
function byLevel(eps: Endpoint[]): Endpoint[][] {
  // Declared identity wins. The generator knows which layer it placed each bar in; when
  // every endpoint carries that, grouping is a lookup and no geometry is inferred at all.
  // Clustering below is the documented fallback for bars that arrive without one.
  if (eps.length > 0 && eps.every((e) => e.bar.layerId)) {
    const byId = new Map<string, Endpoint[]>();
    for (const e of eps) {
      const key = e.bar.layerId!;
      const g = byId.get(key);
      if (g) g.push(e); else byId.set(key, [e]);
    }
    const groups = [...byId.values()];
    for (const g of groups) g.sort((a, b) => a.across - b.across);
    // Ordered by elevation so the caller can match one member's layers to the other's.
    return groups.sort((a, b) => meanLevel(a) - meanLevel(b));
  }
  return clusterByLevel(eps);
}

/**
 * Geometric fallback: cluster endpoints by elevation.
 *
 * LEGACY. Used only for bars with no declared `layerId` — imported geometry, or paths from
 * a generator that predates the field. Everything the generator produces carries its layer,
 * and this should be reachable only at the edges of the system.
 */
function clusterByLevel(eps: Endpoint[]): Endpoint[][] {
  const sorted = [...eps].sort((a, b) => a.level - b.level || a.across - b.across);
  const clusters: Endpoint[][] = [];
  for (const e of sorted) {
    const last = clusters[clusters.length - 1];
    const prev = last?.[last.length - 1];
    const base = last?.[0];
    const near = prev !== undefined && e.level - prev.level <= SAME_LEVEL_M;
    const withinSpan = base !== undefined && e.level - base.level <= MAX_LAYER_SPAN_M;
    if (near && withinSpan) last.push(e);
    else clusters.push([e]);
  }
  for (const c of clusters) c.sort((a, b) => a.across - b.across);
  return clusters;
}

/** Mean elevation of a cluster, for matching one side's layers against the other's. */
function meanLevel(c: readonly Endpoint[]): number {
  return c.reduce((s, e) => s + e.level, 0) / Math.max(1, c.length);
}

/**
 * Fuse two bars that occupy the same line into one continuous bar.
 *
 * The joint-side hooks go: a bar that runs through a support is not anchored into it. What
 * survives is the incoming bar's far-end treatment and the outgoing bar's far-end treatment,
 * which is exactly what a continuous bar has.
 */
function fuse(a: Endpoint, b: Endpoint): BarPath {
  const aSeg = a.bar.segments[a.body];
  const bSeg = b.bar.segments[b.body];
  // The far end of each: the terminus that is NOT at the joint.
  const aFar = a.endIsJointSide ? aSeg.start : aSeg.end;
  const bFar = b.endIsJointSide ? bSeg.start : bSeg.end;
  // The through bar keeps the incoming bar's LEVEL. The two agree to within
  // SAME_POSITION_M transversely by construction — that is what made this a fusion rather
  // than a lap — so adopting one of the two avoids a kink at the joint that exists only as
  // rounding.
  const straight = straightSegment(aFar, { x: bFar.x, y: bFar.y, z: aFar.z });

  // Keep whatever leading treatment the incoming bar had at its far end, and the outgoing
  // bar's at its. Those are the two segment runs that are not the bodies.
  const leading = a.endIsJointSide
    ? a.bar.segments.slice(0, a.body)
    : [...a.bar.segments.slice(a.body + 1)].reverse();
  const trailing = b.endIsJointSide
    ? [...b.bar.segments.slice(0, b.body)].reverse()
    : b.bar.segments.slice(b.body + 1);

  const segments = [...leading, straight, ...trailing];
  return withSegments(a.bar, segments, {
    id: `${a.bar.id}+${b.bar.id}`,
    startTreatment: a.endIsJointSide ? a.bar.startTreatment : a.bar.endTreatment,
    endTreatment: b.endIsJointSide ? b.bar.endTreatment : b.bar.startTreatment,
    ownerElementIds: [...new Set([...a.bar.ownerElementIds, ...b.bar.ownerElementIds])]
      .sort((x, y) => x - y),
  });
}

/** Move one terminus of a bar's body to a new along-coordinate, dropping its hook there. */
function retermine(
  ep: Endpoint, targetAlong: number, t: PlannedTransition,
): BarPath {
  const seg = ep.bar.segments[ep.body];
  const moved = ep.endIsJointSide
    ? straightSegment(seg.start, atAlong(seg.end, targetAlong, t))
    : straightSegment(atAlong(seg.start, targetAlong, t), seg.end);
  // Everything on the joint side of the body was that end's hook. A spliced bar is not
  // anchored into the joint, so it goes.
  const kept = ep.endIsJointSide
    ? [...ep.bar.segments.slice(0, ep.body), moved]
    : [moved, ...ep.bar.segments.slice(ep.body + 1)];
  return withSegments(ep.bar, kept, {
    startTreatment: ep.endIsJointSide ? ep.bar.startTreatment : { kind: 'straight' },
    endTreatment: ep.endIsJointSide ? { kind: 'straight' } : ep.bar.endTreatment,
  });
}

/**
 * Materialise every planned transition.
 *
 * Returns a NEW bar set. Nothing is mutated in place, because the caller still needs the
 * pre-materialisation geometry to report what changed.
 */
export function materialiseLaps(input: MaterialisationInput): MaterialisationResult {
  const barsByMember = new Map<number, BarPath[]>();
  for (const [id, bars] of input.barsByMember) barsByMember.set(id, [...bars]);

  const laps: LapInterval[] = [];
  const fused: FusedBar[] = [];
  const unmaterialised: MaterialisationResult['unmaterialised'] = [];

  for (const t of input.transitions) {
    const fromBars = barsByMember.get(t.fromElementId);
    const toBars = barsByMember.get(t.toElementId);
    if (!fromBars || !toBars) {
      unmaterialised.push({
        jointId: t.jointId,
        reason: msg('detailing.lap.noBars', { joint: t.jointId }),
      });
      continue;
    }

    const fromLevels = byLevel(endpointsAt(fromBars, t, 'from'));
    const toLevels = byLevel(endpointsAt(toBars, t, 'to'));

    let produced = 0;
    // Match each incoming layer to the outgoing layer at the same elevation. Ordered by
    // height on both sides, so bottom pairs with bottom and top with top even when the two
    // members have different depths or different bar sizes.
    const usedTo = new Set<number>();
    for (const fromEps of fromLevels) {
      const fromZ = meanLevel(fromEps);
      let bestIdx = -1;
      let bestGap = Number.POSITIVE_INFINITY;
      toLevels.forEach((cand, idx) => {
        if (usedTo.has(idx)) return;
        const gap = Math.abs(meanLevel(cand) - fromZ);
        if (gap < bestGap) { bestGap = gap; bestIdx = idx; }
      });
      // A layer with no counterpart within one layer's height is not a lap; those bars
      // terminate with their own anchorage and that is not a failure.
      if (bestIdx < 0 || bestGap > LAYER_MATCH_M) continue;
      usedTo.add(bestIdx);
      const toEps = toLevels[bestIdx];
      if (toEps.length === 0) continue;

      // Order-preserving, exactly as `pairUp`: bars in a lap do not cross over each other.
      const n = Math.min(fromEps.length, toEps.length);
      for (let i = 0; i < n; i++) {
        const a = fromEps[i];
        const b = toEps[i];
        const pair = t.schedule.pairs[Math.min(i, t.schedule.pairs.length - 1)];
        if (!pair) continue;
        const offset = Math.abs(b.across - a.across);

        if (offset <= SAME_POSITION_M) {
          // Same line: one bar, not two lapped ones.
          const merged = fuse(a, b);
          const fi = fromBars.findIndex((x) => x.id === a.bar.id);
          if (fi >= 0) fromBars[fi] = merged;
          const ti = toBars.findIndex((x) => x.id === b.bar.id);
          if (ti >= 0) toBars.splice(ti, 1);
          fused.push({
            jointId: t.jointId, keptBarId: merged.id, removedBarId: b.bar.id,
            ownerElementIds: merged.ownerElementIds,
          });
          produced++;
          continue;
        }

        // A real lap. Confine it to the interval the class earned.
        const start = pair.overlapFrom;
        const end = pair.overlapTo;
        const extended = retermine(a, end, t);
        const pulled = retermine(b, start, t);
        const fi = fromBars.findIndex((x) => x.id === a.bar.id);
        if (fi >= 0) fromBars[fi] = extended;
        const ti = toBars.findIndex((x) => x.id === b.bar.id);
        if (ti >= 0) toBars[ti] = pulled;

        const d = a.bar.diameterMm / 1000;
        const kind: LapInterval['kind'] = offset <= d + 1e-9 ? 'contactLap' : 'nonContactLap';
        laps.push({
          jointId: t.jointId,
          fromBarId: extended.id, toBarId: pulled.id,
          from: atAlong(t.jointPoint, start, t),
          to: atAlong(t.jointPoint, end, t),
          lapLength: end - start,
          kind,
          spliceClass: t.schedule.spliceClass,
          offset,
          maxOffset: kind === 'contactLap'
            ? Number.POSITIVE_INFINITY
            : Math.min(t.schedule.lapLength / 5, 0.150),
          refs: t.schedule.refs,
        });
        produced++;
      }
    }

    if (produced === 0) {
      unmaterialised.push({
        jointId: t.jointId,
        reason: msg('detailing.lap.noPairedEnds', { joint: t.jointId }),
      });
    }
  }

  return { barsByMember, laps, fused, unmaterialised };
}

/**
 * Index the laps for the collision engine.
 *
 * Returns a lookup from an unordered bar-id pair to the lap joining them. A pair that is a
 * lap is a DETAIL, and judging it by plain clear spacing reports the detail as the defect.
 */
export function lapIndex(laps: readonly LapInterval[]): Map<string, LapInterval> {
  const index = new Map<string, LapInterval>();
  for (const lap of laps) {
    const key = lap.fromBarId < lap.toBarId
      ? `${lap.fromBarId}|${lap.toBarId}`
      : `${lap.toBarId}|${lap.fromBarId}`;
    index.set(key, lap);
  }
  return index;
}

/** Look one up, in either order. */
export function lapBetween(
  index: ReadonlyMap<string, LapInterval>, aId: string, bId: string,
): LapInterval | undefined {
  return index.get(aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`);
}
