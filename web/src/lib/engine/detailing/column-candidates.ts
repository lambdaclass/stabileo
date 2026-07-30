/**
 * Legal physical cage layouts for a column lift.
 *
 * ── Why the column has to be a variable ────────────────────────────
 *
 * With the column cage held fixed, the global search reported that no beam arrangement fits
 * — and it was right, for a reason that has nothing to do with the beams. The column
 * generator spaced intermediate face bars evenly, without regard to the beams framing in.
 * On the flagship that leaves free channels about 29–30 mm wide between column bars: a Ø25
 * beam bar threads through one, a Ø32 cannot, and the flagship's beams carry Ø32.
 *
 * A detailer facing that does not declare the frame impossible. They move the column's
 * intermediate bars — clustering them toward the corners — which merges several narrow
 * channels into one wide one and lets the beam steel through. That is a legitimate,
 * code-legal alternative arrangement of the SAME certified bar count, and it is exactly the
 * kind of choice a search should be making.
 *
 * ── What is varied, and what is not ────────────────────────────────
 *
 * Varied: where the non-corner longitudinal bars sit around the perimeter, and hence which
 * plan channels are open to beams on each axis.
 *
 * NOT varied here: the bar count or the diameter. Those are certified quantities; changing
 * one invalidates the P-M interaction the verifier signed. Alternative counts and diameters
 * enter the domain only as separate verified candidates supplied by the caller.
 *
 * Every candidate satisfies, before any joint sees it:
 *   * §25.2.3 clear spacing between longitudinal bars, plus the placement allowance;
 *   * cover to the tie, on all four faces;
 *   * §10.7.6 lateral restraint — every corner bar and every alternate bar supported by
 *     the corner of a tie or a crosstie, with the crossties generated, not assumed.
 *
 * Pure: no store, no runes, no i18n.
 */

import { minClearSpacingColumn } from '../../codes/cirsoc201/spacing';
import { seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';
import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';
import { computeColumnLayout } from '../station-design-forces';

/** A longitudinal bar's plan position, relative to the column centre. */
export interface ColumnBarSlot {
  dx: number;
  dy: number;
  /** True for the four corner bars, which are never moved and always tie-restrained. */
  corner: boolean;
}

/**
 * A crosstie required because a bar is not within 150 mm of a tie-restrained bar.
 *
 * Generated rather than assumed: §10.7.6.3's restraint rule is a consequence of where the
 * longitudinal bars were put, so an arrangement that needs more crossties has to say so and
 * carry them into the collision check and the schedule.
 */
export interface CrosstieSpec {
  /** The two bars it engages. */
  fromIndex: number;
  toIndex: number;
  /** Plan direction it spans, unit. */
  direction: { x: number; y: number };
}

export type ColumnArrangement =
  /** Non-corner bars spread evenly along the faces. The usual drawing. */
  | 'even'
  /** Non-corner bars pulled toward the corners, opening a wide central channel. */
  | 'clustered'
  /** Only the four corners, when the count allows it. */
  | 'cornersOnly';

export interface ColumnLayoutCandidate {
  id: string;
  arrangement: ColumnArrangement;
  slots: ColumnBarSlot[];
  crossties: CrosstieSpec[];
  /** Widest free gap on each principal axis, m — what a beam bar has to fit through. */
  widestChannelX: number;
  widestChannelY: number;
  /** Smallest clear distance between adjacent longitudinal bars, m. */
  minClear: number;
  refs: ClauseRef[];
}

export interface ColumnCandidateRequest {
  /** Certified bar count. Never changed here. */
  count: number;
  /** Certified diameter. Never changed here. */
  diameterMm: number;
  /** Section dimensions, m. */
  b: number;
  h: number;
  cover: number;
  tieDiaMm: number;
  edition: RegulationEdition;
  maxAggregateSizeMm: number;
  placementTolerance: number;
  /** A pinned cage fixes the domain to itself. */
  locked?: readonly ColumnBarSlot[];
}

/** §10.7.6.3: a longitudinal bar further than this from a restrained bar needs a crosstie. */
export const RESTRAINT_REACH_M = 0.150;

/**
 * Distribute `n` bars along a face between the two corners at `∓half`.
 *
 * `even` is the usual drawing. `clustered` packs them against the corners at the MINIMUM
 * legal pitch, which is the point of the arrangement: every millimetre saved at the ends
 * is a millimetre added to the central channel a beam bar has to pass through. Packing at
 * an arbitrary fraction of the half-width instead simply breaches §25.2.3 and gets the
 * candidate rejected, which is what a first attempt at this did.
 */
function alongFace(
  n: number, half: number, mode: ColumnArrangement, pitch: number,
): number[] {
  if (n <= 0) return [];
  if (mode === 'clustered') {
    const out: number[] = [];
    const perSide = Math.ceil(n / 2);
    for (let k = 0; k < perSide; k++) out.push(-half + pitch * (k + 1));
    for (let k = 0; k < n - perSide; k++) out.push(half - pitch * (k + 1));
    return out.sort((p, q) => p - q);
  }
  return Array.from({ length: n }, (_, k) => -half + (2 * half * (k + 1)) / (n + 1));
}

/** Widest gap between sorted obstacle coordinates inside ±half. */
function widestGap(positions: readonly number[], half: number, barHalf: number): number {
  const blocked = [...positions].sort((a, b) => a - b);
  let widest = 0;
  let cursor = -half;
  for (const p of blocked) {
    widest = Math.max(widest, (p - barHalf) - cursor);
    cursor = Math.max(cursor, p + barHalf);
  }
  return Math.max(widest, half - cursor);
}

/**
 * Crossties implied by an arrangement.
 *
 * A bar is restrained when it is a corner bar, or within the reach of one that is. Every
 * other bar is paired with the nearest restrained bar across the section.
 */
function crosstiesFor(slots: readonly ColumnBarSlot[]): CrosstieSpec[] {
  const out: CrosstieSpec[] = [];
  const restrained = slots.map((s) => s.corner);

  // A bar adjacent to a restrained bar along its own face is itself restrained by the
  // same tie corner, up to the reach limit. Sweep until nothing more becomes restrained.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < slots.length; i++) {
      if (restrained[i]) continue;
      for (let j = 0; j < slots.length; j++) {
        if (!restrained[j] || i === j) continue;
        const d = Math.hypot(slots[i].dx - slots[j].dx, slots[i].dy - slots[j].dy);
        if (d <= RESTRAINT_REACH_M) { restrained[i] = true; changed = true; break; }
      }
    }
  }

  for (let i = 0; i < slots.length; i++) {
    if (restrained[i]) continue;
    // Tie it across to the opposite face: the shortest legal crosstie.
    let bestJ = -1;
    let bestD = Infinity;
    for (let j = 0; j < slots.length; j++) {
      if (j === i || !restrained[j]) continue;
      const d = Math.hypot(slots[i].dx - slots[j].dx, slots[i].dy - slots[j].dy);
      if (d < bestD) { bestD = d; bestJ = j; }
    }
    if (bestJ < 0) continue;
    const dx = slots[bestJ].dx - slots[i].dx;
    const dy = slots[bestJ].dy - slots[i].dy;
    const L = Math.hypot(dx, dy) || 1;
    out.push({ fromIndex: i, toIndex: bestJ, direction: { x: dx / L, y: dy / L } });
  }
  return out;
}

/**
 * Generate the legal cage arrangements for one lift, best-first.
 *
 * Deterministic: the list depends only on the request, ordered by arrangement then by id.
 */
export function generateColumnCandidates(
  req: ColumnCandidateRequest,
): ColumnLayoutCandidate[] {
  const d = req.diameterMm / 1000;
  // Where the bars sit is decided ONCE, by `seatedLongitudinalHalfExtents`.
  //
  // This module computed `cover + d_tie + d_b/2` in place — the third subsystem to derive the
  // same rectangle, and the second to get it wrong. That is the contact distance from a
  // STRAIGHT leg; at a corner the bend cuts the corner off and a bar pushed that far in sits
  // inside the arc. Measured on `rc-design-qa-8`: every column corner bar interpenetrated the
  // tie above it. `liftBarPositions` had the identical expression, and the beam generator had
  // a third spelling of it, which is why the derivation now lives in one place.
  const seat = seatedLongitudinalHalfExtents(
    req.b, req.h, req.cover, req.tieDiaMm, req.diameterMm);
  // Corner bars govern the perimeter these candidates are built on; the face bars an
  // arrangement puts between them are placed against the straight leg, below.
  const halfB = seat.corner.halfAcross;
  const halfH = seat.corner.halfUp;
  if (halfB <= 0 || halfH <= 0 || req.count < 4) return [];

  const spacing = minClearSpacingColumn(req.edition, {
    barDiameterMm: req.diameterMm, maxAggregateSizeMm: req.maxAggregateSizeMm,
  });
  const refs = [
    ...spacing.refs,
    clause('cirsoc-201', req.edition, req.edition === '2025' ? '10.7.6.3' : '7.10.5.3',
      'restricción lateral de barras longitudinales'),
  ];
  /**
   * Two different numbers, and conflating them was a defect.
   *
   * `codeMinClear` is the HARD constraint: §25.2.3, and nothing may be drawn below it.
   * `targetClear` adds the placement allowance and is what a new arrangement AIMS for, so
   * the built cage still complies after the bars drift.
   *
   * Using the target as the rejection threshold rejected code-legal arrangements — and
   * flatly contradicted the certificate. The verifier certifies 28Ø12 in a 500 mm column
   * at 46.9 mm clear against the 40 mm required; this module was refusing to offer any cage
   * for it, because 46.9 < 40 + 10. A tolerance may widen what we draw. It may never
   * narrow what the code allows, and it may never veto what the verifier signed.
   */
  const codeMinClear = spacing.minClear;
  const targetClear = spacing.minClear + req.placementTolerance;

  // A pinned cage is the whole domain.
  if (req.locked && req.locked.length > 0) {
    const slots = [...req.locked];
    return [finish('locked' as ColumnArrangement, slots, d, halfB, halfH, codeMinClear, refs)]
      .filter((c): c is ColumnLayoutCandidate => c !== null);
  }

  const corners: ColumnBarSlot[] = [
    { dx: -halfB, dy: -halfH, corner: true }, { dx: halfB, dy: -halfH, corner: true },
    { dx: halfB, dy: halfH, corner: true }, { dx: -halfB, dy: halfH, corner: true },
  ];
  const extra = req.count - 4;
  const out: ColumnLayoutCandidate[] = [];

  // ── 'even': the AUTHORITATIVE layout, delegated rather than reimplemented ──
  //
  // `computeColumnLayout` is what the verifier uses to place bars and certify the section.
  // Reimplementing the same distribution here produced a cage that disagreed with the
  // certificate: this module spread the extras along a whole axis and then alternated them
  // between opposite faces, so the gap from a corner to the first face bar carried the
  // pitch for twice as many bars as the face actually holds.
  //
  // One primitive. Verification, candidate generation, physical detailing, collision
  // checking and drawings must read the same coordinates, or they describe different
  // columns.
  const authoritative = computeColumnLayout(
    req.count, req.diameterMm, req.b, req.h, req.cover, req.tieDiaMm, undefined,
    { edition: req.edition, maxAggregateSizeMm: req.maxAggregateSizeMm } as never,
  );
  if (authoritative.bars.length === req.count) {
    const slots: ColumnBarSlot[] = authoritative.bars.map((bar, i) => ({
      dx: bar.x - req.b / 2, dy: bar.y - req.h / 2, corner: i < 4,
    }));
    const c = finish('even', slots, d, halfB, halfH, codeMinClear, refs);
    if (c) out.push(c);
  }

  // ── The alternatives ──
  const alternatives: ColumnArrangement[] = extra === 0 ? ['cornersOnly'] : ['clustered'];
  for (const arrangement of alternatives) {
    const slots = [...corners];
    if (extra > 0) {
      // PER FACE, matching how the authoritative layout apportions them. Splitting per AXIS
      // and alternating faces is what produced the wrong corner gap.
      const perFace = Math.floor(extra / 4);
      const rem = extra - perFace * 4;
      const counts = [
        perFace + (rem > 0 ? 1 : 0), perFace + (rem > 1 ? 1 : 0),
        perFace + (rem > 2 ? 1 : 0), perFace,
      ];
      const faces: Array<[number, 'x' | 'y', number]> = [
        [-halfH, 'x', counts[0]], [halfB, 'y', counts[1]],
        [halfH, 'x', counts[2]], [-halfB, 'y', counts[3]],
      ];
      for (const [fixed, vary, n] of faces) {
        const half = vary === 'x' ? halfB : halfH;
        // Clustered packs at the TARGET pitch: a NEW arrangement should be robust to
        // placement drift, even though an existing one is judged against the code minimum.
        for (const v of alongFace(n, half, arrangement, d + targetClear)) {
          slots.push(vary === 'x'
            ? { dx: v, dy: fixed, corner: false }
            : { dx: fixed, dy: v, corner: false });
        }
      }
    }
    const c = finish(arrangement, slots, d, halfB, halfH, codeMinClear, refs);
    if (c) out.push(c);
  }

  return out.sort((a, b) =>
    // Widest usable channel first: that is the property a congested joint needs, and it is
    // the whole reason the clustered arrangement exists.
    (b.widestChannelX + b.widestChannelY) - (a.widestChannelX + a.widestChannelY)
    || a.id.localeCompare(b.id));
}

function finish(
  arrangement: ColumnArrangement, slots: ColumnBarSlot[], d: number,
  halfB: number, halfH: number, codeMinClear: number, refs: ClauseRef[],
): ColumnLayoutCandidate | null {
  // §25.2.3 between every pair. The CODE minimum, not the placement target: see above.
  let minClear = Infinity;
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const gap = Math.hypot(slots[i].dx - slots[j].dx, slots[i].dy - slots[j].dy) - d;
      minClear = Math.min(minClear, gap);
    }
  }
  if (!Number.isFinite(minClear)) minClear = codeMinClear;
  if (minClear < codeMinClear - 1e-9) return null;

  const barHalf = d / 2;
  const id = `${arrangement}:${slots.map((s) =>
    `${Math.round(s.dx * 10000)},${Math.round(s.dy * 10000)}`).join('|')}`;

  return {
    id, arrangement, slots, crossties: crosstiesFor(slots),
    widestChannelX: widestGap(slots.map((s) => s.dx), halfB, barHalf),
    widestChannelY: widestGap(slots.map((s) => s.dy), halfH, barHalf),
    minClear, refs,
  };
}

/**
 * Keep-out bands this cage imposes on a beam whose transverse axis is `t`.
 *
 * The same projection the search uses, exposed so a caller cannot derive it a second,
 * subtly different way — a search stricter than the check it feeds is exactly the bug that
 * made the first wiring report the flagship infeasible.
 */
export function cageKeepOuts(
  candidate: ColumnLayoutCandidate, diameterMm: number,
  t: { x: number; y: number }, placementTolerance: number,
): Array<{ at: number; halfWidth: number }> {
  return candidate.slots.map((s) => ({
    at: s.dx * t.x + s.dy * t.y,
    // A beam bar CROSSES a column bar; §25.2.3 governs the column's own longitudinals.
    // What a crossing owes is not to interpenetrate, with placement as the guard.
    halfWidth: diameterMm / 2000 + placementTolerance,
  }));
}
