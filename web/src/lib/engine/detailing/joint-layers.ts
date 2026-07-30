/**
 * Which direction's steel sits on top, at every crossing, decided once for the floor.
 *
 * ── The clause finding ─────────────────────────────────────────────
 *
 * CIRSOC 201-2025 §25.2.1 reads "para armaduras no pretensadas PARALELAS colocadas en una
 * capa horizontal, la distancia libre mínima entre barras PARALELAS de una capa…". §25.2.2
 * is likewise explicitly about parallel bars in two or more layers. Neither clause — nor
 * anything else in §25.2 — prescribes a minimum clear distance between bars that CROSS.
 *
 * The commentary C25.2 says why: the minima exist so concrete can flow between the bars
 * without honeycombing, and to avoid concentrating bars in one plane. Crossing bars are
 * tied in contact as a matter of universal practice and the code does not forbid it.
 *
 * So: perpendicular beam bars MAY touch. That is recorded here as the answer to the
 * question, and it is what `classifyPair` already implements for `orthogonalCrossing`.
 *
 * ── Which makes the 6,136 overlaps a different problem entirely ────
 *
 * They are not spacing shortfalls. They are centrelines passing THROUGH one another: two
 * beams meeting a column from different directions put their bottom steel at the same
 * distance from the soffit, so the bars occupy the same points in space. Touching surfaces
 * is legal and free; coincident centrelines is two pieces of steel in one place, and no
 * tolerance, clause or project decision makes that buildable.
 *
 * The required vertical centre-to-centre separation is therefore (dA + dB)/2 — the two
 * radii — plus whatever the project adds. Zero CLEAR spacing means touching. It never
 * means zero SEPARATION.
 *
 * ── Why it is a line property, not a joint fix ─────────────────────
 *
 * A beam crosses several joints. Nudging its bars up at one of them and not the others is
 * not a detail, it is a bar that changes elevation in mid-air; modelling it that way makes
 * the numbers improve and the drawing lie. If the elevation really must change along a
 * line then the transition is a physical bend with a mandrel, a slope and a development
 * length, and it has to be built as such.
 *
 * So elevation rank belongs to the beam LINE, is chosen once for the whole floor, and is
 * carried into the candidate the search assigns. The choice is a graph colouring: lines
 * that cross must differ in rank. On the orthogonal grids that produce this problem two
 * ranks suffice, and greedy colouring in a deterministic order finds them.
 *
 * Pure: no store, no runes, no i18n.
 */

import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';
import { msg, round, type EngineMessage } from '../../codes/message';

/** One beam line, as the layer allocator sees it. */
export interface LineForLayering {
  lineId: string;
  /** Members on this line. */
  elementIds: readonly number[];
  /** Unit plan direction of the line. Sign is irrelevant; the allocator normalises it. */
  direction: { x: number; y: number };
  /** Largest longitudinal bar diameter on the line, mm. */
  maxBarMm: number;
  /**
   * Largest BOTTOM bar and largest TOP bar, mm.
   *
   * Kept apart because the two faces are independent problems. A line's top steel crosses
   * the other line's top steel and its bottom steel crosses the other's bottom; sizing one
   * scalar step from the larger of the two over-raises whichever face did not need it, and
   * lever arm spent for a clash that cannot happen is lever arm lost. Default to `maxBarMm`
   * when a caller does not distinguish them.
   */
  maxBottomMm?: number;
  maxTopMm?: number;
}

/** Two lines that cross, and where. */
export interface LineCrossing {
  a: string;
  b: string;
  jointId: string;
}

export interface LayerAssignment {
  lineId: string;
  /**
   * 0 is the lowest bottom layer and the highest top layer — the steel closest to each
   * face, and therefore the steel with the greatest effective depth.
   */
  rank: number;
  /**
   * How far this line's BOTTOM bars are raised above the rank-0 elevation, m.
   * Positive raises them, which REDUCES the effective depth.
   */
  bottomRaise: number;
  /** How far this line's TOP bars are lowered below the rank-0 elevation, m. */
  topLower: number;
  refs: ClauseRef[];
  derivation: EngineMessage;
}

export interface LayerAllocation {
  byLine: Map<string, LayerAssignment>;
  /** Highest rank used. Two is the expected answer on an orthogonal grid. */
  ranks: number;
  /** Crossings the allocator could not separate, with the reason. Never silently dropped. */
  unresolved: Array<{ jointId: string; a: string; b: string; reason: EngineMessage }>;
}

/**
 * Minimum vertical centre-to-centre separation between two crossing bars.
 *
 * The bars may touch — §25.2 does not govern crossings — so the floor is exactly the sum
 * of the two radii. `extraMargin` is the project's additional bar-spacing margin, which
 * defaults to zero and is never presented as a code requirement.
 */
export function crossingSeparation(
  aMm: number, bMm: number, extraMargin = 0,
): { separation: number; refs: ClauseRef[]; derivation: EngineMessage } {
  const separation = (aMm + bMm) / 2000 + Math.max(0, extraMargin);
  return {
    separation,
    refs: [clause('cirsoc-201', '2025', '25.2.1',
      'separación mínima aplicable a barras paralelas, no a cruces')],
    derivation: msg('detailing.layers.separation', {
      a: aMm, b: bMm,
      margin: round(Math.max(0, extraMargin) * 1000, 1),
      separation: round(separation * 1000, 1),
    }),
  };
}

/**
 * How far rank k's steel must move to clear the rank below it, m.
 *
 * ── Why this is NOT the clearance ──────────────────────────────────
 *
 * The required CLEARANCE between two crossing bars is (dA + dB)/2 — the two radii. The
 * required STEP is a different number, and using the clearance as the step is what left
 * 309 pairs interpenetrating after the ranks were correctly assigned.
 *
 * Both layers are referenced from the same concrete face, and each bar's centre sits half
 * its OWN diameter inside it. So a Ø10 bar starts 11 mm nearer the face than a Ø32 bar
 * before anything moves. Solving for the raise with that head start included:
 *
 *     posA = −dA/2                    posB = −dB/2 − raise
 *     posA − posB ≥ (dA + dB)/2
 *     raise ≥ (dA + dB)/2 + dA/2 − dB/2  =  dA
 *
 * The step is the diameter of the bar it is stepping over, full stop. The dB terms cancel
 * exactly — a thinner bar in the upper rank needs MORE movement, not less, which is the
 * opposite of what the mean formula gives. The two agree only when dA = dB, which is why
 * this survived every equal-diameter test.
 *
 * On the flagship: a Ø32 rank-0 bar and a Ø10 rank-1 bar got (32+10)/2 = 22 mm of drop and
 * needed 32. The measured shortfall was 11 mm, which is exactly dA/2 − dB/2.
 */
export function layerStep(belowMaxMm: number, extraMargin = 0): number {
  return belowMaxMm / 1000 + Math.max(0, extraMargin);
}

/**
 * Assign an elevation rank to every beam line.
 *
 * Deterministic throughout: lines are coloured in sorted id order and take the lowest rank
 * not used by an already-coloured neighbour. Same input, same allocation, every run — a
 * detailing result that changes between runs is not a deliverable.
 *
 * Greedy colouring is not optimal in general. It does not need to be: it is exact on the
 * two-colourable orthogonal grids this exists for, and on anything worse it still produces
 * a valid separation, just with more layers than strictly necessary. Trading a spare layer
 * for determinism and an obvious proof of correctness is the right side of that trade.
 */
export function allocateLayers(input: {
  lines: readonly LineForLayering[];
  crossings: readonly LineCrossing[];
  edition: RegulationEdition;
  /** Project margin above the regulatory minimum, m. Zero by default. */
  extraMargin?: number;
  /** Refuse to stack more than this many layers; beyond it the section runs out of depth. */
  maxRanks?: number;
}): LayerAllocation {
  const margin = Math.max(0, input.extraMargin ?? 0);
  const maxRanks = Math.max(1, input.maxRanks ?? 3);

  const byId = new Map(input.lines.map((l) => [l.lineId, l]));
  const neighbours = new Map<string, Set<string>>();
  for (const l of input.lines) neighbours.set(l.lineId, new Set());
  for (const c of input.crossings) {
    if (!byId.has(c.a) || !byId.has(c.b) || c.a === c.b) continue;
    neighbours.get(c.a)!.add(c.b);
    neighbours.get(c.b)!.add(c.a);
  }

  const rankOf = new Map<string, number>();
  const unresolved: LayerAllocation['unresolved'] = [];

  // Deterministic order. Most-constrained-first would colour with fewer ranks on awkward
  // graphs, but sorted order is reproducible without a tiebreak policy and the graphs this
  // sees are grids.
  const ordered = [...input.lines].sort((a, b) => a.lineId.localeCompare(b.lineId));
  for (const line of ordered) {
    const taken = new Set<number>();
    for (const n of neighbours.get(line.lineId)!) {
      const r = rankOf.get(n);
      if (r !== undefined) taken.add(r);
    }
    let rank = 0;
    while (taken.has(rank) && rank < maxRanks) rank++;
    rankOf.set(line.lineId, rank);
  }

  // Report every crossing the colouring failed to separate, rather than assuming success.
  for (const c of input.crossings) {
    // A line does not cross itself. Such an entry is skipped when the graph is built, so
    // skipping it here too keeps the two passes agreeing; otherwise every self-reference
    // reports as an unresolvable crossing against its own rank.
    if (c.a === c.b) continue;
    const ra = rankOf.get(c.a);
    const rb = rankOf.get(c.b);
    if (ra === undefined || rb === undefined || ra !== rb) continue;
    unresolved.push({
      jointId: c.jointId, a: c.a, b: c.b,
      reason: msg('detailing.layers.exhausted', { rank: ra, maxRanks }),
    });
  }

  // Elevation. Rank k sits above every rank below it, each by the crossing separation for
  // the largest bar involved — using the largest is what guarantees the clearance holds
  // for every actual pair on the line, not just the average one.
  const step = (
    rank: number, line: LineForLayering, face: 'bottom' | 'top',
  ): number => {
    const dia = (l: LineForLayering) =>
      (face === 'bottom' ? l.maxBottomMm : l.maxTopMm) ?? l.maxBarMm;
    let z = 0;
    for (let r = 0; r < rank; r++) {
      // Only the lines this one actually CROSSES constrain it. A line on the far side of
      // the floor sharing a rank is irrelevant, and charging its bar diameter would throw
      // away lever arm for a clash that cannot happen.
      const below = ordered.filter((l) =>
        rankOf.get(l.lineId) === r && neighbours.get(line.lineId)!.has(l.lineId));
      if (below.length === 0) continue;
      const biggest = below.reduce((m, l) => Math.max(m, dia(l)), 0);
      z += layerStep(biggest, margin);
    }
    return z;
  };

  const byLine = new Map<string, LayerAssignment>();
  for (const line of ordered) {
    const rank = rankOf.get(line.lineId)!;
    const raise = step(rank, line, 'bottom');
    const drop = step(rank, line, 'top');
    byLine.set(line.lineId, {
      lineId: line.lineId, rank,
      bottomRaise: raise,
      topLower: drop,
      refs: crossingSeparation(line.maxBarMm, line.maxBarMm, margin).refs,
      derivation: msg('detailing.layers.assigned', {
        rank, raise: round(Math.max(raise, drop) * 1000, 1), line: line.lineId,
      }),
    });
  }

  return {
    byLine,
    ranks: Math.max(1, ...[...rankOf.values()].map((r) => r + 1)),
    unresolved,
  };
}

/**
 * The effective depth a raised bottom layer actually has, before tolerances.
 *
 * Raising the steel is not free and this is where the cost shows up. A rank-1 line on
 * Ø16 bars loses 16 mm of lever arm, and on a shallow member that is the difference
 * between passing flexure and not. Every line whose rank is non-zero must be reverified
 * against THIS depth, not the one it was designed with.
 */
export function depthAfterRaise(nominalD: number, raise: number): number {
  return nominalD - Math.max(0, raise);
}
