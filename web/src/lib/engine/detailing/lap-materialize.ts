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
  /** The members the lap joins, incoming and outgoing. Optional for laps persisted before it. */
  fromElementId?: number;
  toElementId?: number;
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
  /**
   * Both members' bars are of one steel (the same fy). Absent: they are. Two steels on one line
   * are lapped, never fused into one bar.
   */
  sameSteel?: boolean;
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
  // The anchorage records follow the far ends: what the through bar does at the joint is run.
  const aFarRecord = a.endIsJointSide ? a.bar.anchorage?.start : a.bar.anchorage?.end;
  const bFarRecord = b.endIsJointSide ? b.bar.anchorage?.start : b.bar.anchorage?.end;
  const anchorage = { ...(aFarRecord ? { start: aFarRecord } : {}), ...(bFarRecord ? { end: bFarRecord } : {}) };
  return withSegments(a.bar, segments, {
    id: `${a.bar.id}+${b.bar.id}`,
    anchorage: Object.keys(anchorage).length ? anchorage : undefined,
    // One bar through the joint resists the moment either side resists: it is a hanger only
    // where both bars it was made of were.
    purpose: a.bar.purpose === 'stirrupHanger' && b.bar.purpose === 'stirrupHanger' ? 'stirrupHanger' : undefined,
    startTreatment: a.endIsJointSide ? a.bar.startTreatment : a.bar.endTreatment,
    // The outgoing bar's FAR end: its start when its end is at the joint. This read the joint
    // side's treatment, so a bar fused through a joint lost the hook at its far support from its
    // schedule and its drawing while the segments still drew it.
    endTreatment: b.endIsJointSide ? b.bar.startTreatment : b.bar.endTreatment,
    ownerElementIds: [...new Set([...a.bar.ownerElementIds, ...b.bar.ownerElementIds])]
      .sort((x, y) => x - y),
  });
}

/** Move one terminus of a bar's body to a new along-coordinate, dropping its hook there. */
function retermine(
  ep: Endpoint, targetAlong: number, t: PlannedTransition,
  lap: { available: number; required: number },
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
  // The joint-side end is now a lap: the interval it shares with its partner, against the
  // lap length the splice class asks for.
  const lapped = { support: 'interior' as const, solution: 'lap' as const, available: lap.available, required: lap.required, rule: 'lap' as const };
  return withSegments(ep.bar, kept, {
    startTreatment: ep.endIsJointSide ? ep.bar.startTreatment : { kind: 'straight' },
    endTreatment: ep.endIsJointSide ? { kind: 'straight' } : ep.bar.endTreatment,
    anchorage: ep.endIsJointSide
      ? { ...(ep.bar.anchorage?.start ? { start: ep.bar.anchorage.start } : {}), end: lapped }
      : { start: lapped, ...(ep.bar.anchorage?.end ? { end: ep.bar.anchorage.end } : {}) },
  });
}

/** The face a generator layer id names: `e5:topJ:1` → `top`, `e5:bottom:0` → `bottom`. */
function faceKey(layerId: string): string {
  const face = layerId.split(':')[1] ?? '';
  return face.startsWith('top') ? 'top' : face;
}

/**
 * The groups of each side that meet at the joint: the same face.
 *
 * The generator names a top bar's layer by its REGION too (`topRun`, `topI`, `topJ`), and those
 * regions share one physical row; and two members meeting at a support may split one face into
 * different layer counts (a two-layer coordinated layout against a one-layer one). Grouped by the
 * full id, the continuous pair of one member and the support group of the other were different
 * "layers", matched one group at a time, so a face of three met a face of two plus one and paired
 * two bars out of three: the third stopped in the column, neither lapped nor anchored. A lap is
 * between bars of one face; which layer of it pairs with which is `pairAcross`'s to decide.
 * Bars that arrive without a declared layer fall back to elevation clusters, as before.
 */
function matchedGroups(fromEps: Endpoint[], toEps: Endpoint[]): Array<[Endpoint[], Endpoint[]]> {
  const declared = [...fromEps, ...toEps].every((e) => e.bar.layerId);
  const group = (eps: Endpoint[]) => {
    if (!declared) return clusterByLevel(eps);
    const by = new Map<string, Endpoint[]>();
    for (const e of eps) by.set(faceKey(e.bar.layerId!), [...(by.get(faceKey(e.bar.layerId!)) ?? []), e]);
    return [...by.values()].map((g) => g.sort((a, b) => a.across - b.across || a.level - b.level));
  };
  const from = group(fromEps), to = group(toEps);
  const out: Array<[Endpoint[], Endpoint[]]> = [];
  const usedTo = new Set<number>();
  // Closest pairs of groups first, so an exact layer is never taken by a near one.
  const candidates: Array<{ f: number; t: number; gap: number }> = [];
  from.forEach((fg, f) => to.forEach((tg, ti) => {
    const sameFace = !declared || faceKey(fg[0]!.bar.layerId!) === faceKey(tg[0]!.bar.layerId!);
    const gap = Math.abs(meanLevel(fg) - meanLevel(tg));
    if (sameFace && gap <= LAYER_MATCH_M) candidates.push({ f, t: ti, gap });
  }));
  candidates.sort((a, b) => a.gap - b.gap || a.f - b.f || a.t - b.t);
  const usedFrom = new Set<number>();
  for (const c of candidates) {
    if (usedFrom.has(c.f) || usedTo.has(c.t)) continue;
    usedFrom.add(c.f); usedTo.add(c.t);
    out.push([from[c.f]!, to[c.t]!]);
  }
  return out;
}

/**
 * Pair two faces' bar ends across the joint without crossing: the most pairs, then the least
 * total offset (across, and in elevation so a layer keeps to its layer), order kept on both sides
 * (`pairUp`'s rule); two ends more than one layer's height apart are not a pair. Taking the i-th
 * of each row paired a row's continuous outer bar with the other row's inner one whenever the
 * counts differed.
 */
const pairCost = (p: Endpoint, q: Endpoint) => Math.abs(p.across - q.across) + Math.abs(p.level - q.level);
function pairAcross(a: Endpoint[], b: Endpoint[]): Array<[Endpoint, Endpoint]> {
  const n = a.length, m = b.length;
  const best: Array<Array<{ pairs: number; cost: number }>> = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => ({ pairs: 0, cost: 0 })));
  const better = (p: { pairs: number; cost: number }, q: { pairs: number; cost: number }) => p.pairs > q.pairs || (p.pairs === q.pairs && p.cost < q.cost - 1e-12);
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    let v = best[i - 1]![j]!;
    if (better(best[i]![j - 1]!, v)) v = best[i]![j - 1]!;
    if (Math.abs(a[i - 1]!.level - b[j - 1]!.level) <= LAYER_MATCH_M) {
      const take = { pairs: best[i - 1]![j - 1]!.pairs + 1, cost: best[i - 1]![j - 1]!.cost + pairCost(a[i - 1]!, b[j - 1]!) };
      if (better(take, v)) v = take;
    }
    best[i]![j] = v;
  }
  const out: Array<[Endpoint, Endpoint]> = [];
  for (let i = n, j = m; i > 0 && j > 0;) {
    const here = best[i]![j]!;
    const took = best[i - 1]![j - 1]!;
    if (Math.abs(a[i - 1]!.level - b[j - 1]!.level) <= LAYER_MATCH_M
      && here.pairs === took.pairs + 1 && Math.abs(here.cost - took.cost - pairCost(a[i - 1]!, b[j - 1]!)) < 1e-12) {
      out.push([a[i - 1]!, b[j - 1]!]); i--; j--;
    } else if (best[i - 1]![j]!.pairs === here.pairs && Math.abs(best[i - 1]![j]!.cost - here.cost) < 1e-12) i--;
    else j--;
  }
  return out.reverse();
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

    let produced = 0;
    const allFrom = endpointsAt(fromBars, t, 'from'), allTo = endpointsAt(toBars, t, 'to');
    const pairedIds = new Set<string>();
    for (const [fromEps, toEps] of matchedGroups(allFrom, allTo)) {
      const matched = pairAcross(fromEps, toEps);
      for (const [a, b] of matched) { pairedIds.add(a.bar.id); pairedIds.add(b.bar.id); }
      for (let i = 0; i < matched.length; i++) {
        const [a, b] = matched[i]!;
        const pair = t.schedule.pairs[Math.min(i, t.schedule.pairs.length - 1)];
        if (!pair) continue;
        // Offset between the two bars in the section plane: across AND in elevation. Ends of
        // one face can now pair across its layers, and two bars 37 mm apart vertically are not
        // the same line, whatever their plan position says.
        const offset = Math.hypot(b.across - a.across, b.level - a.level);

        // One bar only where it is the same bar: on the same line, of the same diameter and the
        // same steel. A Ø16 meeting a Ø12 (or two steels) is lapped: fused, the through bar took
        // the incoming bar's diameter and a span was detailed with the other span's bars. The
        // joint's lap is planned at the larger bar (`run-detailing`), Class factor times its ℓd,
        // which is §25.5.2.2's larger of ℓd of the larger bar and the lap of the smaller.
        const sameBar = a.bar.diameterMm === b.bar.diameterMm && t.sameSteel !== false;
        if (sameBar && Math.abs(b.across - a.across) <= SAME_POSITION_M && Math.abs(b.level - a.level) <= SAME_LEVEL_M) {
          // Same line: one bar, not two lapped ones.
          const merged = fuse(a, b);
          // The through bar goes on with the OUTGOING member, whose next joint is the line's next
          // transition: kept with the incoming one, it was out of sight of that transition and its
          // far end stopped in the next column, a bar fused across one support and cut at the
          // next. Transitions are planned in line order, so each fusion hands it on.
          const fi = fromBars.findIndex((x) => x.id === a.bar.id);
          if (fi >= 0) fromBars.splice(fi, 1);
          const ti = toBars.findIndex((x) => x.id === b.bar.id);
          if (ti >= 0) toBars[ti] = merged;
          fused.push({
            jointId: t.jointId, keptBarId: merged.id, removedBarId: b.bar.id,
            ownerElementIds: merged.ownerElementIds,
          });
          // A lap an earlier joint built on either bar now joins `merged`: the bar it named is
          // gone. Left as it was, the lap index answered for a bar that no longer exists, the
          // classifier stopped seeing the two halves as a lap and judged the pair by §25.2.1
          // clear spacing — on the 408-member frame 117 of 544 laps had lost their bar that way.
          for (const lap of laps) {
            if (lap.fromBarId === a.bar.id || lap.fromBarId === b.bar.id) lap.fromBarId = merged.id;
            if (lap.toBarId === a.bar.id || lap.toBarId === b.bar.id) lap.toBarId = merged.id;
          }
          produced++;
          continue;
        }

        // A real lap. Confine it to the interval the class earned.
        const start = pair.overlapFrom;
        const end = pair.overlapTo;
        const lapLength = { available: end - start, required: t.schedule.lapLength };
        const extended = retermine(a, end, t, lapLength);
        const pulled = retermine(b, start, t, lapLength);
        const fi = fromBars.findIndex((x) => x.id === a.bar.id);
        if (fi >= 0) fromBars[fi] = extended;
        const ti = toBars.findIndex((x) => x.id === b.bar.id);
        if (ti >= 0) toBars[ti] = pulled;

        const d = a.bar.diameterMm / 1000;
        const kind: LapInterval['kind'] = offset <= d + 1e-9 ? 'contactLap' : 'nonContactLap';
        laps.push({
          jointId: t.jointId,
          fromElementId: t.fromElementId, toElementId: t.toElementId,
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

    // ── The bars with no partner across the joint ──
    //
    // One side carries more bars at the support than the other: the surplus has nothing to lap
    // with, and stopped at the column's far face it has the column's depth to develop in. It is
    // continued into the next span instead, until it has its development length past the face
    // it resists the moment at — the record it carries says how much that is (`pending`, set by
    // the generator: available = the column's depth, required = ld).
    for (const [ep, side] of [...allFrom.map((e) => [e, 'from'] as const), ...allTo.map((e) => [e, 'to'] as const)]) {
      if (pairedIds.has(ep.bar.id)) continue;
      const list = side === 'from' ? fromBars : toBars;
      const k = list.findIndex((x) => x.id === ep.bar.id);
      if (k < 0) continue;
      const end = ep.endIsJointSide ? 'end' : 'start';
      const rec = ep.bar.anchorage?.[end];
      if (!rec || rec.solution !== 'pending' || rec.rule !== 'ld' || rec.available >= rec.required - 1e-9) continue;
      const face = rec.available / 2;
      // Along the transition axis: the `from` bar resists at −face and runs on toward +; the
      // `to` bar resists at +face and runs back toward −.
      const target = side === 'from' ? -face + rec.required : face - rec.required;
      const seg = ep.bar.segments[ep.body]!;
      const moved = ep.endIsJointSide
        ? straightSegment(seg.start, atAlong(seg.end, target, t))
        : straightSegment(atAlong(seg.start, target, t), seg.end);
      const segments = [...ep.bar.segments];
      segments[ep.body] = moved;
      list[k] = withSegments(ep.bar, segments, {
        anchorage: { ...ep.bar.anchorage, [end]: { ...rec, solution: 'straight', available: rec.required } },
      });
      produced++;
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
