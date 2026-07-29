/**
 * Legal physical layout candidates for one member's bar group.
 *
 * ── Why a candidate, and not a nudge ───────────────────────────────
 *
 * Two attempts at post-hoc threading failed, and they failed for the same structural
 * reason: a beam spans TWO joints. Moving a straight bar sideways to clear the column at
 * one end moves it at the other end too, so resolving joints one at a time makes each
 * undo the last. Measured, the second attempt made the flagship worse — overlaps 409 → 461
 * — because packing bars into whatever channel was free clustered them, and the clustering
 * cost more in bar-to-bar clearance than it bought in column clearance.
 *
 * The fix is to stop nudging. A member's arrangement is CHOSEN ONCE, as a whole, from a set
 * of complete legal alternatives, and the choice is made against every joint the member
 * touches at the same time. This module produces those alternatives.
 *
 * ── What a candidate is ────────────────────────────────────────────
 *
 * One complete, code-legal transverse arrangement for a group of bars on one face of one
 * member: how many layers, how many bars per layer, and where each sits across the section.
 * It is valid for the member's whole length by construction, so it cannot be legal at one
 * end and illegal at the other.
 *
 * Every candidate satisfies, on its own, before any joint is considered:
 *   * cover — no bar outside the clear width between the stirrup legs;
 *   * §25.2.1 / §25.2.3 clear spacing within a layer, PLUS the placement tolerance;
 *   * §25.2.2 clear distance between layers;
 *   * the bar count and diameter the verifier certified — never changed here.
 *
 * The placement allowance is added to the nominal spacing and never subtracted from the
 * code minimum. `worstCasePlacementSpacing` states that as an invariant a test can assert.
 *
 * Pure: no store, no runes, no i18n.
 */

import { minClearBetweenLayers, minClearSpacingFor } from '../../codes/cirsoc201/spacing';
import type { ClauseRef, RegulationEdition } from '../../codes/regulation';

/** One bar's position within a candidate, relative to the section centreline. */
export interface CandidateSlot {
  /** Offset across the section, m. */
  across: number;
  /** Layer index; 0 is nearest the face. */
  layer: number;
}

export interface LayoutCandidate {
  /**
   * Deterministic identity. Built from the shape of the layout, never from a counter, so
   * the same geometry always produces the same id and a stored choice survives a re-run.
   */
  id: string;
  slots: CandidateSlot[];
  layers: number;
  /** Bars in the widest layer — the congestion measure the objective ranks on. */
  maxPerLayer: number;
  /** Smallest clear distance between any two bars in the same layer, m. */
  minClearInLayer: number;
  /** Half-width actually occupied, m. Narrower arrangements thread more easily. */
  halfSpan: number;
  refs: ClauseRef[];
  /**
   * Which stirrup bend each required seat is filled by — the §25.7.1.2 proof, carried.
   *
   * ── Why a witness and not a count ──────────────────────────────────
   *
   * "Entre los extremos anclados, cada doblez en la parte continua de los estribos en U,
   * sencillos o múltiples, y cada doblez en un estribo cerrado, debe contener una barra
   * longitudinal o cordón." The bends between the anchored ends are §25.7.1.2; the anchored
   * ends themselves are §25.7.1.3(a), "un gancho normal alrededor de la armadura
   * longitudinal". Either way every bend of a closed stirrup needs a bar in it.
   *
   * That is a statement about SPECIFIC bends and SPECIFIC bars, and it does not follow from
   * how many bars a layout has. Measured on the qa-8 fixture: the generator's own spread
   * layout satisfied all four bends, the coordination search then supplied an asymmetric
   * threading arrangement with the same bar count, and every stirrup came out restraining
   * two corners of four. A count cannot see that; a witness can.
   *
   * Empty when the caller did not state where the seats are — the candidate then makes no
   * claim, rather than an unchecked one.
   */
  bendWitnesses: BendWitness[];
}

/** One bend of the closed stirrup, and the bar seated in it. */
export interface BendWitness {
  /** Which seat: the two ends of the outermost row, on each face the cage encloses. */
  seat: 'acrossMin' | 'acrossMax';
  /** Where the seat is, m from the section centreline. */
  seatAcross: number;
  /** The slot filling it, or null when nothing does — which invalidates the candidate. */
  filledBy: { across: number; layer: number } | null;
  /** How far the bar centre sits from the seat, m. */
  offset: number;
}

export interface CandidateRequest {
  count: number;
  diameterMm: number;
  /** Clear width between the stirrup legs, m. */
  clearWidth: number;
  edition: RegulationEdition;
  maxAggregateSizeMm: number;
  memberKind: 'beam' | 'column' | 'wall' | 'slab';
  /**
   * Additional bar-spacing margin above the regulatory minimum, m.
   *
   * A PROJECT property, zero by default. It only ever WIDENS the drawing; it is never
   * subtracted from what the code allows, and it never vetoes a certified arrangement.
   */
  placementTolerance: number;
  /**
   * Transverse positions the user pinned. A locked bar restricts the domain — candidates
   * that do not honour it are never generated — rather than being shoved during repair.
   */
  lockedAcross?: readonly number[];
  /**
   * Obstacles the member must thread past, in its own transverse coordinate: the UNION of
   * every joint it touches.
   *
   * Supplied so the generator can offer CHANNEL-AWARE arrangements, whose bars are not
   * uniformly pitched but distributed into the free gaps between obstacles.
   *
   * This is the fix the flagship diagnosis demanded. 120 of 248 beams — every one of them
   * 8Ø12 — were stranded, and each failed at EACH END INDEPENDENTLY, so it was never the
   * two-ends problem it looked like. With column bars at ±69 mm the free space is three
   * separate ~98 mm channels: plenty of room in total, but no contiguous uniformly-pitched
   * row of four bars fits any single one of them. The generator could only draw contiguous
   * rows, so it could not express the arrangement a detailer would obviously use.
   *
   * The union of both ends, not one end at a time: a straight bar occupies the same
   * transverse position along its whole length, so an arrangement is only real if it
   * clears every joint the member passes through.
   */
  obstacles?: readonly KeepOut[];
  /**
   * Where the outermost row's bars must sit for the stirrup bends to contain them, m from
   * the section centreline — §25.7.1.2 and §25.7.1.3(a).
   *
   * Supplied by the caller from `seatedLongitudinalHalfExtents`, which is the one authority
   * on cage geometry. This module does NOT re-derive it: four subsystems deriving the same
   * rectangle independently is the defect that produced the seating errors this constraint
   * now guards, and a fifth would be no better.
   *
   * Absent, no seat is required and `bendWitnesses` stays empty — the pre-existing behaviour
   * for callers that have no cage.
   */
  cornerSeatAcross?: number;
  /**
   * How far a bar centre may sit from the seat and still be contained by the bend, m.
   *
   * A physical tolerance, not a slack knob: a bend of centreline radius `r` reaches a bar
   * whose centre lies within roughly `r + d_b/2` of the seat, and `barAtCorner` in
   * `transverse-cage` applies the same reasoning at the geometry layer. The caller states it
   * so the two cannot drift.
   */
  cornerSeatTolerance?: number;
}

/** How many bars of this diameter fit in one layer at this spacing. */
function perLayerCapacity(clearWidth: number, d: number, pitch: number): number {
  if (clearWidth < d) return 0;
  return Math.max(1, Math.floor((clearWidth - d) / pitch) + 1);
}

/**
 * Positions for `n` bars in one layer, centred, at `pitch`, shifted by `shift`.
 *
 * `shift` is what makes alternatives exist. A symmetric row is the natural first choice,
 * but it is only one of the legal arrangements, and when a column bar happens to sit on
 * the centreline it is the worst one.
 */
function row(n: number, pitch: number, shift: number): number[] {
  const span = pitch * (n - 1);
  return Array.from({ length: n }, (_, k) => -span / 2 + k * pitch + shift);
}

/**
 * The worst clear spacing a candidate can present once every bar has drifted by the
 * placement tolerance in the least helpful direction.
 *
 * Exported so a gate can assert the thing that must never be true: that the tolerance was
 * used to EXCUSE a spacing shortfall rather than to guard against one. Two adjacent bars
 * can each move by half the tolerance toward the other, so the nominal pitch has to carry
 * the full allowance for the worst case still to be code-legal.
 */
export function worstCasePlacementSpacing(
  candidate: LayoutCandidate, diameterMm: number, placementTolerance: number,
): number {
  return candidate.minClearInLayer - diameterMm / 1000 - placementTolerance;
}

/**
 * Generate the legal alternatives, best-first.
 *
 * Deterministic: the candidate list depends only on the request, and the order is fixed by
 * (layers, congestion, |shift|, span). No counters, no clocks, no input ordering.
 */
export function generateLayoutCandidates(req: CandidateRequest): LayoutCandidate[] {
  const d = req.diameterMm / 1000;
  const spacing = minClearSpacingFor(req.edition, req.memberKind, {
    barDiameterMm: req.diameterMm, maxAggregateSizeMm: req.maxAggregateSizeMm,
  });
  const layerRule = minClearBetweenLayers(req.edition);
  const refs = [...spacing.refs, ...layerRule.refs];

  // The nominal pitch carries the code minimum PLUS the placement allowance. The allowance
  // only ever widens the drawing; it can never narrow what the code demands.
  const nominalClear = spacing.minClear + req.placementTolerance;
  const pitch = d + nominalClear;

  const capacity = perLayerCapacity(req.clearWidth, d, pitch);
  if (capacity === 0 || req.count === 0) return [];

  const out: LayoutCandidate[] = [];
  const seen = new Set<string>();

  // Layer counts worth trying: the fewest that fit, and one more. Splitting into an extra
  // layer frees plan width, which is exactly the trade a congested joint needs — but it
  // costs effective depth, so it is never the first choice.
  const minLayers = Math.ceil(req.count / capacity);
  const layerOptions = [minLayers, minLayers + 1]
    .filter((n) => n >= 1 && n <= req.count);

  for (const layers of layerOptions) {
    const base = Math.ceil(req.count / layers);
    if (base > capacity) continue;

    // Lateral shifts. Zero first (symmetric is the natural arrangement), then progressively
    // offset rows, each still fully inside the clear width.
    const span = pitch * (base - 1);
    const room = (req.clearWidth - d) / 2 - span / 2;
    const shifts = [0];
    for (const frac of [0.5, 1.0]) {
      const s = room * frac;
      if (s > 1e-4) shifts.push(s, -s);
    }
    // A quarter-pitch stagger breaks alignment with a column bar sitting on the centreline
    // without moving the group off centre.
    if (room > pitch / 4) shifts.push(pitch / 4, -pitch / 4);

    for (const shift of shifts) {
      const slots: CandidateSlot[] = [];
      let placed = 0;
      for (let layer = 0; layer < layers; layer++) {
        const inThis = Math.min(base, req.count - placed);
        if (inThis <= 0) break;
        for (const across of row(inThis, pitch, shift)) slots.push({ across, layer });
        placed += inThis;
      }
      if (slots.length !== req.count) continue;

      // Locked bars restrict the domain: a candidate that does not place a bar where the
      // user pinned one is not offered at all.
      if (req.lockedAcross && req.lockedAcross.length > 0) {
        const honours = req.lockedAcross.every((lock) =>
          slots.some((s) => Math.abs(s.across - lock) < 1e-6));
        if (!honours) continue;
      }

      const c = finalise(slots, d, req, spacing.minClear, layers, refs, '');
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }

  // ── Seated arrangements: the outer bars pinned to the stirrup bends ──
  //
  // Generated FIRST, because they are the ones §25.7.1.2 allows, and the contiguous rows
  // above only survive `finalise` when a shift happens to land a bar on each seat.
  //
  // Layer 0 spans seat to seat with its remaining bars evenly divided between them, which is
  // the arrangement the beam generator already draws when nothing overrides it — spreading
  // only ever widens clear spacing, so §25.2.1 is satisfied more comfortably than by a packed
  // row. Upper layers take a CENTRED SUBSET of layer 0's positions, per §25.2.2's requirement
  // that upper-layer bars sit directly above lower ones.
  //
  // Both mirrorings are offered where they differ, so the search keeps a genuine choice: a
  // seated arrangement is not one layout, it is a family, and collapsing it to a single
  // representative is what leaves a joint with an empty domain.
  if (req.cornerSeatAcross !== undefined && req.cornerSeatAcross > 0) {
    const seat = req.cornerSeatAcross;
    for (const layers of layerOptions) {
      const inFirst = Math.min(Math.ceil(req.count / layers), req.count);
      if (inFirst < 2) continue;
      const seatPitch = (2 * seat) / (inFirst - 1);
      // The seats are fixed by the cage, so a row that cannot hold this many bars between
      // them at the code minimum is simply not available at this layer count.
      if (seatPitch - d < spacing.minClear - 1e-9) continue;
      const base = Array.from({ length: inFirst }, (_, k) => -seat + k * seatPitch);

      // Which of layer 0's positions the upper layers reuse. Centred, and offered in both
      // orientations when the subset is not symmetric.
      const remaining = req.count - inFirst;
      const perUpper = layers > 1 ? Math.ceil(remaining / (layers - 1)) : 0;
      for (const bias of [0, 1]) {
        const slots: CandidateSlot[] = base.map((across) => ({ across, layer: 0 }));
        let placed = inFirst;
        for (let layer = 1; layer < layers && placed < req.count; layer++) {
          const take = Math.min(perUpper, req.count - placed);
          if (take <= 0) break;
          const start = Math.floor((inFirst - take) / 2) + (bias && (inFirst - take) % 2 ? 1 : 0);
          for (let k = 0; k < take; k++) {
            slots.push({ across: base[start + k], layer });
          }
          placed += take;
        }
        if (slots.length !== req.count) continue;
        const c = finalise(slots, d, req, spacing.minClear, layers, refs, 'seat');
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
      }
    }
  }

  // ── Channel-aware arrangements ──
  //
  // Added last so the contiguous rows above stay preferred: a uniformly-pitched row is the
  // simpler drawing and the easier cage to build. But when obstacles split the section into
  // separate gaps, a contiguous row can be impossible while the section has ample room, and
  // the only arrangement that works is one distributed across the gaps.
  if (req.obstacles && req.obstacles.length > 0) {
    const channels = freeChannelsOf(req.clearWidth / 2, req.obstacles);
    for (const layers of layerOptions) {
      const base = Math.ceil(req.count / layers);
      const positions = placeAcrossChannels(channels, base, d, pitch);
      if (positions === null) continue;

      const slots: CandidateSlot[] = [];
      let placed = 0;
      for (let layer = 0; layer < layers; layer++) {
        const inThis = Math.min(base, req.count - placed);
        if (inThis <= 0) break;
        // Each layer takes the first `inThis` positions, so a partly-filled final layer
        // sits under the bars above it rather than somewhere new.
        for (const across of positions.slice(0, inThis)) slots.push({ across, layer });
        placed += inThis;
      }
      if (slots.length !== req.count) continue;

      const c = finalise(slots, d, req, spacing.minClear, layers, refs, 'ch');
      if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
    }
  }

  // Best-first and fully deterministic: fewest layers, then least congested, then most
  // centred, then narrowest, then id.
  return out.sort((a, b) =>
    a.layers - b.layers
    || a.maxPerLayer - b.maxPerLayer
    || centrality(a) - centrality(b)
    || a.halfSpan - b.halfSpan
    || a.id.localeCompare(b.id));
}


/**
 * Validate and measure a slot set, or reject it.
 *
 * One place, used by both the contiguous and the channel-aware paths, so an arrangement
 * cannot reach the domain through a route that skips a check.
 */
/**
 * Which slot fills each required bend seat.
 *
 * Only the OUTERMOST row is asked: a closed stirrup's bends are at the four corners of its
 * perimeter, and the bars that can occupy them are the extremes of the row nearest each face.
 * An inner-layer bar cannot stand in for a corner — it is at a different depth, and the bend
 * is not there.
 */
function witnessSeats(
  slots: readonly CandidateSlot[], req: CandidateRequest,
): BendWitness[] {
  const seat = req.cornerSeatAcross;
  if (seat === undefined) return [];
  const tol = req.cornerSeatTolerance ?? 0;
  // Layer 0 is the row against the face the cage bends around.
  const outer = slots.filter((s) => s.layer === 0);
  const find = (target: number) => {
    let best: { slot: CandidateSlot; offset: number } | null = null;
    for (const s of outer) {
      const offset = Math.abs(s.across - target);
      if (offset > tol + 1e-12) continue;
      if (best === null || offset < best.offset) best = { slot: s, offset };
    }
    return best;
  };
  return ([['acrossMin', -seat], ['acrossMax', seat]] as const).map(([name, target]) => {
    const hit = find(target);
    return {
      seat: name,
      seatAcross: target,
      filledBy: hit ? { across: hit.slot.across, layer: hit.slot.layer } : null,
      offset: hit ? hit.offset : Number.POSITIVE_INFINITY,
    };
  });
}

function finalise(
  slots: CandidateSlot[], d: number, req: CandidateRequest,
  codeMinClear: number, layers: number, refs: ClauseRef[], tag: string,
): LayoutCandidate | null {
  // Cover: every bar inside the clear width.
  const halfSpan = Math.max(...slots.map((s) => Math.abs(s.across))) + d / 2;
  if (halfSpan > req.clearWidth / 2 + 1e-9) return null;

  // Locked bars restrict the domain rather than being moved later.
  if (req.lockedAcross && req.lockedAcross.length > 0) {
    const honours = req.lockedAcross.every((lock) =>
      slots.some((s) => Math.abs(s.across - lock) < 1e-6));
    if (!honours) return null;
  }

  const byLayer = new Map<number, number[]>();
  for (const s of slots) byLayer.set(s.layer, [...(byLayer.get(s.layer) ?? []), s.across]);
  let minClearInLayer = Infinity;
  for (const [, xs] of byLayer) {
    const sorted = [...xs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      minClearInLayer = Math.min(minClearInLayer, sorted[i] - sorted[i - 1]);
    }
  }
  if (!Number.isFinite(minClearInLayer)) minClearInLayer = req.clearWidth;
  // Never emit a candidate that breaches the code minimum, tolerance aside.
  if (minClearInLayer - d < codeMinClear - 1e-9) return null;

  // ── §25.7.1.2 / §25.7.1.3(a): every bend must contain a bar ──
  //
  // Checked HERE, at the one place every generation path funnels through, so a family added
  // later cannot bypass it. A candidate that leaves a bend empty is not offered to the search
  // at all — it is not a layout to be repaired afterward, it is a layout the code forbids.
  const bendWitnesses = witnessSeats(slots, req);
  if (bendWitnesses.some((w) => w.filledBy === null)) return null;

  return {
    bendWitnesses,
    id: `${tag}L${layers}:${slots.map((s) =>
      `${s.layer}@${Math.round(s.across * 10000)}`).join(',')}`,
    slots, layers,
    maxPerLayer: Math.max(...[...byLayer.values()].map((v) => v.length)),
    minClearInLayer, halfSpan, refs,
  };
}

/** How far off centre a candidate sits. Zero for a symmetric arrangement. */
function centrality(c: LayoutCandidate): number {
  const mean = c.slots.reduce((s, x) => s + x.across, 0) / Math.max(1, c.slots.length);
  return Math.round(Math.abs(mean) * 1e6) / 1e6;
}

/**
 * Keep-out bands a candidate must avoid at a joint, in the member's transverse coordinate.
 *
 * Returned rather than applied: the search asks "is this candidate compatible here?", and
 * the answer has to be computable without moving anything.
 */
export interface KeepOut {
  at: number;
  halfWidth: number;
}

/** A free gap between obstacles, in the member's transverse coordinate. */
interface Channel { lo: number; hi: number }

/**
 * The gaps left INSIDE ±half once every keep-out is removed and overlaps merged.
 *
 * Every channel is clipped to the section. Without the clip, an obstacle beyond the section
 * — a column corner bar sitting outside the beam's width, which is the ordinary case —
 * leaves a "gap" running from the last obstacle inside the section all the way out to that
 * far one. Bars then get placed in concrete that is not there, and `finalise` throws the
 * whole candidate away on a cover violation it never needed to have.
 *
 * Measured on the flagship: a 350 mm beam with a 142 mm half-width was offered a channel
 * reaching to 175 mm, and NOT ONE channel-aware candidate survived. The entire arrangement
 * class was silently absent from every domain — which is why adding it changed nothing.
 */
function freeChannelsOf(half: number, obstacles: readonly KeepOut[]): Channel[] {
  const blocked = obstacles
    .map((o) => ({ lo: o.at - o.halfWidth, hi: o.at + o.halfWidth }))
    .sort((a, b) => a.lo - b.lo);
  const merged: Channel[] = [];
  for (const b of blocked) {
    const last = merged[merged.length - 1];
    if (last && b.lo <= last.hi) last.hi = Math.max(last.hi, b.hi);
    else merged.push({ ...b });
  }
  const out: Channel[] = [];
  let cursor = -half;
  for (const b of merged) {
    if (b.lo > cursor) out.push({ lo: cursor, hi: b.lo });
    cursor = Math.max(cursor, b.hi);
  }
  if (cursor < half) out.push({ lo: cursor, hi: half });
  return out
    .map((c) => ({ lo: Math.max(c.lo, -half), hi: Math.min(c.hi, half) }))
    .filter((c) => c.hi > c.lo);
}

/**
 * Distribute `count` bars across the free channels, widest first, centred within each.
 *
 * Returns null when the channels genuinely cannot hold them at the required pitch — which
 * is a real inadequacy and must not be papered over by squeezing the pitch.
 */
function placeAcrossChannels(
  channels: readonly Channel[], count: number, d: number, pitch: number,
): number[] | null {
  const capacity = (c: Channel) => {
    const w = c.hi - c.lo;
    return w < d ? 0 : Math.floor((w - d) / pitch) + 1;
  };
  const ordered = [...channels]
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo) || a.lo - b.lo || a.i - b.i);
  if (ordered.reduce((n, c) => n + capacity(c), 0) < count) return null;

  const out: number[] = [];
  let left = count;
  for (const c of ordered) {
    if (left === 0) break;
    const take = Math.min(left, capacity(c));
    if (take === 0) continue;
    const mid = (c.lo + c.hi) / 2;
    const span = pitch * (take - 1);
    for (let k = 0; k < take; k++) out.push(mid - span / 2 + k * pitch);
    left -= take;
  }
  return out.sort((a, b) => a - b);
}

/** Does every bar in this candidate clear every keep-out band? */
export function candidateClears(
  candidate: LayoutCandidate, diameterMm: number, keepOuts: readonly KeepOut[],
): { ok: boolean; worstOverlap: number } {
  const half = diameterMm / 2000;
  let worst = 0;
  for (const slot of candidate.slots) {
    for (const k of keepOuts) {
      const gap = Math.abs(slot.across - k.at) - half - k.halfWidth;
      if (gap < 0) worst = Math.min(worst, gap);
    }
  }
  return { ok: worst >= 0, worstOverlap: worst };
}
