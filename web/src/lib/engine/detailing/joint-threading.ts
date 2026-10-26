/**
 * Whether a beam's bars can pass the column bars at a joint: one reading for the design and the
 * detailing.
 *
 * The detailing coordinates every beam's bar positions across the section against the columns'
 * bars at both its joints (`run-detailing` `coordinateBeamLayouts`, `coordination-search`): a
 * beam none of whose layouts clears a joint's cage keeps the least-bad one, and its bars cross
 * the column's. The design read nothing of the cage, so it verified beams whose bars could not
 * pass — the same incoherence as an anchorage the column could not hold. Both now ask here:
 *
 *   - the beam's slots: as many as its widest group has bars, laid at that group's bar, its
 *     outer bars seated in the stirrup's bends (`beamRow`, `beamLayoutDomain`);
 *   - the column's bars: its designed count and diameter in the arrangement the detailing
 *     builds (`columnBarPositions`), projected across the beam (`columnKeepOuts`);
 *   - a joint is passed when one of the layouts the coordination would consider clears its cage
 *     (`threadsJoint`, `candidateClears`, the search's own domain bound).
 *
 * Pure.
 */
import { generateLayoutCandidates, candidateClears, type KeepOut, type LayoutCandidate } from './candidates';
import { cornerSeatHold, seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';
import { columnBarPositions } from './generate-column';
import { centrelineRadius, minMandrelDiameter, standardHook } from '../../codes/cirsoc201/bar-geometry';
import { yieldsTo } from './support-anchorage';
export { yieldsTo };
import { DEFAULT_LIMITS } from './coordination-search';
import type { RegulationEdition } from '../../codes/regulation';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';

/** A designed column's longitudinal bars: how many and of what, as the detailing lays them. */
export function columnBarsOf(accepted: ProvidedReinforcement | undefined): { count: number; diameterMm: number } | null {
  if (!accepted) return null;
  const c = accepted.column as unknown as { totalBars?: number; diameter?: number; barDiameter?: number } | undefined;
  if (c && typeof c.totalBars === 'number') {
    const d = c.diameter ?? c.barDiameter;
    if (c.totalBars > 0 && d) return { count: c.totalBars, diameterMm: d };
  }
  const l = accepted.longitudinal;
  if (l && l.count > 0) return { count: l.count, diameterMm: l.diameter };
  return null;
}

/** The member's row of slots: how many, at which bar, and its largest bar. */
export interface BeamRow {
  /** Slots: the widest group's bar count. */
  count: number;
  /** The widest group's bar, mm: the slots are laid at it. */
  rowDia: number;
  /** The member's largest longitudinal bar, mm: the clearances are read at it. */
  dia: number;
}

/** The row from the member's three groups (`beam-groups.ts` `beamGroups`). */
export function beamRow(groups: { bottom: { count: number; diameterMm: number }; topStart: { count: number; diameterMm: number }; topEnd: { count: number; diameterMm: number } }): BeamRow {
  const gs = [groups.bottom, groups.topStart, groups.topEnd];
  const count = Math.max(...gs.map((g) => g.count));
  return {
    count,
    rowDia: Math.max(...gs.filter((g) => g.count === count).map((g) => g.diameterMm)),
    dia: Math.max(...gs.map((g) => g.diameterMm)),
  };
}

/** Where a row's outer bars seat: the stirrup's bends, and how far from them a bar is still held. */
export function beamSeat(section: { b: number; h: number }, cover: number, stirrupDiaMm: number, barDiaMm: number) {
  const seat = seatedLongitudinalHalfExtents(section.b, section.h, cover, stirrupDiaMm, barDiaMm);
  // As far as the cage's own bend holds a bar (`cornerSeatHold`). It was the bend radius plus
  // half the bar, which let a row leave a bar 21 mm off its seat where the cage holds 13 mm: the
  // bend then gripped nothing (§25.7.1.2) and the member could not be built.
  return { cornerSeatAcross: seat.corner.halfAcross, cornerSeatTolerance: cornerSeatHold(stirrupDiaMm, barDiaMm) };
}

/**
 * The layouts the coordination offers a beam: every legal row of its slots, against the cages of
 * both its joints (a straight bar holds one position along its whole length), with no more top
 * layers than its anchorage allows (`endSupportPlan.maxTopLayers`).
 */
export function beamLayoutDomain(o: {
  row: BeamRow; section: { b: number; h: number }; cover: number; stirrupDiaMm: number;
  edition: RegulationEdition; maxAggregateSizeMm: number; placement: number;
  obstacles: readonly KeepOut[]; maxTopLayers?: number; lockedAcross?: number[];
}): LayoutCandidate[] {
  const clearWidth = Math.max(0.02, o.section.b - 2 * (o.cover + o.stirrupDiaMm / 1000));
  // The channel rows read only what bars every layer; a keep-out of one layer is threaded per layer.
  const every = o.obstacles.filter((k) => !k.layers);
  return generateLayoutCandidates({
    count: o.row.count, diameterMm: o.row.rowDia, clearWidth, edition: o.edition,
    maxAggregateSizeMm: o.maxAggregateSizeMm, memberKind: 'beam', placementTolerance: o.placement,
    lockedAcross: o.lockedAcross && o.lockedAcross.length > 0 ? o.lockedAcross : undefined,
    obstacles: o.obstacles.length > 0 ? [...o.obstacles] : undefined,
    channelObstacles: every, obstacleDiameterMm: o.row.dia,
    ...beamSeat(o.section, o.cover, o.stirrupDiaMm, o.row.rowDia),
  }).filter((c) => c.layers <= (o.maxTopLayers ?? Number.POSITIVE_INFINITY));
}

/** One row of a beam's hook tails at a joint: how far past the node, its bar and its layer. */
export interface TailRow {
  at: number; diameterMm: number; row: number; position: 'top' | 'bottom';
  /** The row's bars, where known: a first bottom row of two stands on its corner seats alone (`crossingTailPosts`). */
  count?: number;
}

/**
 * A crossing beam's hook tails as keep-outs across a beam at the joint they share, for the
 * design's threading check and the detailing's coordination alike.
 *
 *   - Every tail stands vertical on the crossing beam's tail plane, `at·k` across this beam: this
 *     beam's horizontal bars cross it, in contact, so it bars its own diameter. A bottom tail,
 *     turned up, crosses this beam's top bars only where it reaches up to them, which depends on
 *     how the two mats are ranked (`joint-layers`); where this beam's bottom bars at the joint
 *     stand on their corner seats alone (`ourBottomSeated`) it bars no slot until then, and is
 *     read with the ranks, layer by layer (`run-detailing`, as the bends of the mats above).
 *     Read as a keep-out of every layer, measured on the span fixture's 40×40 corners with the
 *     hooks taking ψcc (§25.4.3.2, tried and withdrawn): the bottom tails of the beams along y,
 *     17 mm past the node and 150 mm below the top bars of the beams along x, barred those
 *     beams' middle top bar from the one slot the column's centre bar and the joint's crosstie
 *     leave it, and the coordination laid it through the crosstie.
 *   - Where this beam ends here too its tails stand beside the crossing beam's of the same face
 *     (`besideTailPosts`).
 */
export function crossingTailPosts(o: {
  theirs: readonly TailRow[]; k: number; theirSeat: number;
  ours?: readonly TailRow[]; ourSeat: number; gives: boolean;
  clear: number; placement: number;
  /** The bar the slots are cleared at (`candidateClears`), mm: the member's largest. */
  clearedAtMm: number;
  /** This beam's top bar, mm: the one that crosses the tails. */
  ourTopMm: number;
  /** This beam's bottom bars at the joint are its first row of two, on the corner seats. */
  ourBottomSeated?: boolean;
}): KeepOut[] {
  const out: KeepOut[] = [];
  // The tails cross this beam's top bars: cleared at that bar, not the member's largest.
  for (const t of o.theirs) {
    if (t.position === 'bottom' && o.ourBottomSeated) continue;
    out.push({ at: t.at * o.k, halfWidth: t.diameterMm / 2000 + o.ourTopMm / 2000 - o.clearedAtMm / 2000 + o.placement });
  }
  out.push(...besideTailPosts({ ...o, beside: (r, t) => r.position === t.position }));
  return out;
}

/**
 * Where this beam ends at the joint too, its tails beside the crossing beam's: the rows `beside`
 * pairs (the same face, or a top and a bottom row whose tails meet in height, `postsMeet`).
 *
 * Parallel, the two need the clear distance between them (§25.2.1). In plan they are points: this
 * beam's row at its plane `P` along this beam and the bars of its layer across it, the crossing
 * row at its plane `T` across this beam and its bars along it. Two come within the clear only if
 * a bar of each stands within it of the other's plane, so of each pair of rows one keeps its
 * layer off the other's plane and the other is free: the one that can (a first layer keeps its
 * corner seat, so it cannot clear a plane within the clear of that seat), and of two that can,
 * the one facing the outer plane, which costs it only bars near its corner; of two at one plane,
 * the one that gives way (`yieldsTo`). Read for every row of both, a corner of two beams ending
 * kept each one's bars off the other's planes twice over: qa-8's 300 mm beams kept four slots of
 * the six their rows fit, both layers full on the corners.
 */
export function besideTailPosts(o: {
  theirs: readonly TailRow[]; k: number; theirSeat: number;
  ours?: readonly TailRow[]; ourSeat: number; gives: boolean;
  clear: number; placement: number; clearedAtMm: number;
  beside: (ours: TailRow, theirs: TailRow) => boolean;
  /**
   * Each row's own corner seat, m, where known: a bottom row's bars seat as its own face's do,
   * not as the top row's (`theirSeat`, `ourSeat`). A top tail beside a bottom one is read so.
   */
  seatOf?: { ours: (r: TailRow) => number; theirs: (t: TailRow) => number };
}): KeepOut[] {
  const out: KeepOut[] = [];
  const eps = 1e-6;
  for (const r of o.ours ?? []) {
    // A first bottom row of two bars stands on its corner seats, whatever the slots (the
    // continuing bars take the outermost, `generate-beam` `botSlots`): keeping the row's slots
    // off a plane moves none of its tails. The corners are the planes' to clear (`planSupportEnd`,
    // the yielding beam's tail off the other's corner by the parallel clear). Read as a slot
    // keep-out, it barred the layer's middle slots, which carry top bars there, and on the span
    // fixture at 40×40 (undeclared) left no layout through six corner joints of the half-metre mesh.
    if (r.position === 'bottom' && r.row === 0 && r.count !== undefined && r.count <= 2) continue;
    for (const t of o.theirs) {
      if (!o.beside(r, t)) continue;
      const R = r.diameterMm / 2000 + t.diameterMm / 2000 + o.clear;
      const ourSeat = o.seatOf ? o.seatOf.ours(r) : o.ourSeat, theirSeat = o.seatOf ? o.seatOf.theirs(t) : o.theirSeat;
      // No bar of either reaches within the clear of the other's plane: nothing to keep.
      if (!(r.at < theirSeat + R - eps && t.at < ourSeat + R - eps)) continue;
      const weCan = !(r.row === 0 && Math.abs(ourSeat - t.at) < R - eps);
      const theyCan = !(t.row === 0 && Math.abs(theirSeat - r.at) < R - eps);
      const weKeep = weCan && (!theyCan || t.at > r.at + 1e-4 || (Math.abs(t.at - r.at) <= 1e-4 && o.gives));
      // The clear is the row's own: `candidateClears` adds the member's largest bar, so it is taken off.
      if (weKeep) out.push({ at: t.at * o.k, halfWidth: R - o.clearedAtMm / 2000 + o.placement, layers: [r.row] });
    }
  }
  return out;
}

/**
 * A hook's tail as a vertical post: from its tip to where its bend turns it (the straight
 * extension, Tabla 25.3.1), for a bar whose centre lies at `z` in its mat, in the same frame.
 */
export function tailPost(z: number, diameterMm: number, position: 'top' | 'bottom'): { lo: number; hi: number } {
  const h = standardHook(diameterMm, 90, 'longitudinal');
  return position === 'top'
    ? { lo: z - h.centrelineRadius - h.extension, hi: z - h.centrelineRadius }
    : { lo: z + h.centrelineRadius, hi: z + h.centrelineRadius + h.extension };
}

/**
 * Whether two tails stand beside each other in height: unless one stops short of the other by
 * the clear between parallel bars, tip to tip (`besideTailPosts`, read in `run-detailing` with
 * the mats' ranks).
 */
export function postsMeet(a: { lo: number; hi: number }, b: { lo: number; hi: number }, clear: number): boolean {
  return Math.max(a.lo - b.hi, b.lo - a.hi) < clear - 1e-9;
}

/**
 * Where a bar lying `delta` below a hooked bar's run crosses its 90° bend or its tail, across:
 * the bend is a quarter circle of centreline radius `r` from `tail − r` (where the run turns) to
 * the tail at `tail`, and two bars clash where their centres come within `rho` (the two radii).
 * Measured from the node along the hooked bar; null where the lower bar passes clear.
 */
export function bendCrossing(tail: number, r: number, rho: number, delta: number): { lo: number; hi: number } | null {
  const cx = tail - r;
  // The arc: centre (cx, run − r); the lower bar at (s, run − delta).
  const dz = r - delta;
  const inner = (r - rho) ** 2 - dz ** 2, outer = (r + rho) ** 2 - dz ** 2;
  const out: Array<{ lo: number; hi: number }> = [];
  if (delta < r + rho && outer > 0) {
    const lo = cx + Math.sqrt(Math.max(0, inner));
    const hi = cx + Math.min(r, Math.sqrt(outer));
    if (hi > lo) out.push({ lo, hi });
  }
  // The tail, vertical below the arc's end.
  if (delta >= r - rho) out.push({ lo: tail - rho, hi: tail + rho });
  if (out.length === 0) return null;
  return { lo: Math.min(...out.map((x) => x.lo)), hi: Math.max(...out.map((x) => x.hi)) };
}

/**
 * The column's bars as keep-outs for a beam's own hook tails where it ends at the joint.
 *
 * A tail turned down (or up) into the joint stands vertical beside the column's bars, parallel,
 * so it keeps the clear distance between a column's bars (§25.2.3) from each, in plan: the tail of
 * row `r` stands at its plane `at` past the node along the beam, so a column bar `along` from the
 * node bars that row's layer across the beam only as far as the clear reaches at that distance.
 * Crossing the column's bars the beam's runs only touch them (`columnKeepOuts`); measured on qa-8
 * with the column's bars running up through the roof joint, a corner tail stood 34 mm from the
 * column's face bar where 40 mm were due.
 *
 * And the joint's ties: every interior line of the cage carries a crosstie (`buildColumnTieSet`,
 * framed on the global axes at the joint), its shaft beside the line's bars on the side toward
 * the column's centre, one bend radius off (`crosstieShafts`); on the centreline, on the side the
 * joint passes it (`centreSide`, `crosstieCentreSides`). The one along this beam runs through the
 * band the tails stand in, and they cross it, in contact: they keep off its shaft. Measured on
 * qa-8, a tail beside the face bar ran through it by 2 mm. Read on both sides of the bar, it
 * barred a 20 cm beam's middle bar from the one gap the column's centre bar leaves it.
 */
export function columnTailPosts(o: {
  bars: ReadonlyArray<{ along: number; across: number; diameterMm: number }>;
  /** The same bars in plan about the node, on the global axes, for the joint's crossties. */
  plan: ReadonlyArray<{ x: number; y: number; diameterMm: number }>;
  /** This beam's plan axis and transverse axis. */
  u: { x: number; y: number }; t: { x: number; y: number };
  ours: readonly TailRow[]; clear: (diameterMm: number) => number; placement: number;
  /** The joint ties' bar, mm. */
  tieDiaMm: number;
  /** The bar the slots are cleared at (`candidateClears`), mm: the member's largest. */
  clearedAtMm: number;
  /**
   * The side of its line the centreline crosstie along this beam passes on (`crosstieCentreSides`).
   * Absent: the positive one, the tie set's own default.
   */
  centreSide?: 1 | -1;
}): KeepOut[] {
  const out: KeepOut[] = [];
  // The crossties along this beam: along global x for a beam nearer x, along y otherwise.
  const alongX = Math.abs(o.u.x) >= Math.abs(o.u.y);
  for (const { shaft } of crosstieShafts(o.plan, alongX, o.tieDiaMm, o.centreSide ?? 1)) {
    const across = alongX ? shaft * o.t.y : shaft * o.t.x;
    for (const row of o.ours) out.push({ at: across, halfWidth: o.tieDiaMm / 2000 + row.diameterMm / 2000 - o.clearedAtMm / 2000 + o.placement, layers: [row.row] });
  }
  for (const bar of o.bars) {
    for (const r of o.ours) {
      const R = bar.diameterMm / 2000 + r.diameterMm / 2000 + o.clear(Math.max(bar.diameterMm, r.diameterMm));
      const dl = bar.along - r.at;
      if (Math.abs(dl) >= R) continue;
      out.push({ at: bar.across, halfWidth: Math.sqrt(R * R - dl * dl) - o.clearedAtMm / 2000 + o.placement, layers: [r.row] });
    }
  }
  return out;
}

/**
 * The joint's crossties along global x (`alongX`, their shafts at a y) or along y (at an x), in
 * plan about the node: one through every interior line of the cage that carries a bar on both
 * faces it spans (`buildColumnTieSet`), its shaft beside the line's bars on the side toward the
 * column's centre, one bend radius off; the centreline's (`centre`) on `centreSide`. The joint's
 * ties are framed on the global axes, as the tie set builds them.
 */
export function crosstieShafts(
  plan: ReadonlyArray<{ x: number; y: number; diameterMm: number }>, alongX: boolean, tieDiaMm: number, centreSide: 1 | -1,
): Array<{ shaft: number; centre: boolean }> {
  const r = centrelineRadius(minMandrelDiameter(tieDiaMm, 'transverse').value, tieDiaMm);
  const lineOf = (p: { x: number; y: number }) => (alongX ? p.y : p.x);
  const spanOf = (p: { x: number; y: number }) => (alongX ? p.x : p.y);
  const maxLine = Math.max(0, ...plan.map((p) => Math.abs(lineOf(p))));
  const maxSpan = Math.max(0, ...plan.map((p) => Math.abs(spanOf(p))));
  const lines = new Map<string, { at: number; diameterMm: number }>();
  for (const p of plan) {
    const a = lineOf(p);
    // A face line, corners included: the corner bars sit a few mm in from the face bars, in the
    // ties' bends. Interior lines stand well inside.
    if (Math.abs(a) >= maxLine - 0.03) continue;
    const both = [1, -1].every((side) => plan.some((q) => Math.abs(lineOf(q) - a) <= 0.006 && Math.sign(spanOf(q)) === side && Math.abs(spanOf(q)) >= maxSpan - 0.03));
    if (both) lines.set(a.toFixed(4), { at: a, diameterMm: Math.max(p.diameterMm, lines.get(a.toFixed(4))?.diameterMm ?? 0) });
  }
  return [...lines.values()].map((line) => {
    const centre = Math.abs(line.at) <= 1e-9;
    const side = line.at > 1e-9 ? -1 : centre ? centreSide : 1;
    return { shaft: line.at + side * Math.max(line.diameterMm / 2000 + tieDiaMm / 2000, r), centre };
  });
}

/**
 * The side of its line each centreline crosstie of a joint passes on: `alongX` the one along
 * global x (+1: at +y), `alongY` the one along y (+1: at +x).
 *
 * The one free choice of the joint's ties (`StirrupSetInput.centreSides`), and two readers need
 * it: the coordination keeps the beams' bars off the crosstie along them (`columnTailPosts`) and
 * the tie set lays it. The coordination read it on the positive side and the tie set took the
 * other wherever the positive one ran through a hook tail, so a beam's bar laid on the negative
 * side, clear of where the crosstie was read, had it run through its tail: measured on the span
 * fixture at 40×40, undeclared, with the hooks taking ψcc (§25.4.3.2, tried and withdrawn), the
 * bottom tails of the beams along y stood 17 mm past the node, on the positive line, and the crosstie moved onto the middle
 * top bar of the beam along x (8 mm into it at two corners). Decided here, once, from what fixes
 * it before any bar is laid: the hook tails of the beams ending at the joint, each a row of posts
 * on a plane across the crosstie that no slot moves (`TailRow.at` along the beam's outward
 * direction `out`). The positive side unless it runs through more of them than the other.
 */
export function crosstieCentreSides(o: {
  plan: ReadonlyArray<{ x: number; y: number; diameterMm: number }>;
  tieDiaMm: number;
  tails: ReadonlyArray<{ out: { x: number; y: number }; rows: readonly TailRow[] }>;
}): { alongX: 1 | -1; alongY: 1 | -1 } {
  const sideOf = (alongX: boolean): 1 | -1 => {
    const hits = (side: 1 | -1) => {
      let n = 0;
      for (const { shaft, centre } of crosstieShafts(o.plan, alongX, o.tieDiaMm, side)) {
        if (!centre) continue;
        for (const beam of o.tails) {
          // The tails across this crosstie: a beam framing in along the other axis.
          const k = alongX ? beam.out.y : beam.out.x;
          if (Math.abs(k) <= Math.abs(alongX ? beam.out.x : beam.out.y)) continue;
          for (const row of beam.rows) {
            // In contact, a millimetre clear, as `planSupportEnd` keeps a tail off a bar it crosses.
            if (Math.abs(row.at * k - shaft) < o.tieDiaMm / 2000 + row.diameterMm / 2000 + 0.001) n += row.count ?? 1;
          }
        }
      }
      return n;
    };
    return hits(1) > hits(-1) ? -1 : 1;
  };
  return { alongX: sideOf(true), alongY: sideOf(false) };
}

/** Whether one of the layouts the search would consider clears a joint's cage, and by how much the best misses. */
export function threadsJoint(domain: readonly LayoutCandidate[], diaMm: number, keepOuts: readonly KeepOut[]): { ok: boolean; worstOverlap: number } {
  let best = Number.NEGATIVE_INFINITY;
  for (const c of domain.slice(0, DEFAULT_LIMITS.maxDomain)) {
    const r = candidateClears(c, diaMm, keepOuts);
    if (r.ok) return { ok: true, worstOverlap: 0 };
    best = Math.max(best, r.worstOverlap);
  }
  return { ok: false, worstOverlap: Number.isFinite(best) ? best : 0 };
}

/**
 * A column's longitudinal bars as the detailing lays them (`columnBarPositions`, the arrangement
 * `generate-column` builds for a rectangular lift), across a beam at the node: `t` the beam's
 * transverse axis in plan. Bars of two columns at one position are one obstacle, the larger.
 */
export function columnKeepOuts(
  columns: ReadonlyArray<{ b: number; h: number; cover: number; tieDiaMm: number; count: number; diameterMm: number; shift?: { x: number; y: number } }>,
  t: { x: number; y: number }, placement: number,
): KeepOut[] {
  return columnPlan(columns).map((k) => ({ at: k.x * t.x + k.y * t.y, halfWidth: k.diameterMm / 2000 + placement }));
}

/**
 * The columns' bars in plan about the beam's axis at the joint, one per position (the larger
 * bar). `shift` is where a column's axis stands off it — the column's declared insertion less the
 * beam's (`memberOffsetAt`); absent, both are on the node, as in every model that declares none.
 */
export function columnPlan(
  columns: ReadonlyArray<{ b: number; h: number; cover: number; tieDiaMm: number; count: number; diameterMm: number; shift?: { x: number; y: number } }>,
): Array<{ x: number; y: number; diameterMm: number }> {
  const byPosition = new Map<string, { x: number; y: number; diameterMm: number }>();
  for (const c of columns) {
    for (const p0 of columnBarPositions(c.b, c.h, c.cover, c.tieDiaMm, c.diameterMm, c.count)) {
      const p = c.shift ? { x: p0.x + c.shift.x, y: p0.y + c.shift.y } : p0;
      const key = `${Math.round(p.x * 1000)}:${Math.round(p.y * 1000)}`;
      const seen = byPosition.get(key);
      if (!seen || c.diameterMm > seen.diameterMm) byPosition.set(key, { x: p.x, y: p.y, diameterMm: c.diameterMm });
    }
  }
  return [...byPosition.values()];
}
