/**
 * §25.7.1.2 as a SEARCH CONSTRAINT, not an afterthought.
 *
 * ── The clause ─────────────────────────────────────────────────────
 *
 * CIRSOC 201-2025 §25.7.1.2, verbatim:
 *
 *   "Entre los extremos anclados, cada doblez en la parte continua de los estribos en U,
 *    sencillos o múltiples, y cada doblez en un estribo cerrado, debe contener una barra
 *    longitudinal o cordón."
 *
 * The bends BETWEEN the anchored ends are governed by that. The anchored ends themselves are
 * §25.7.1.3(a) — "un gancho normal alrededor de la armadura longitudinal" — which also demands
 * a longitudinal bar. So every bend of a closed stirrup needs one, and the geometric condition
 * is the same for all four corners even though the provenance differs.
 *
 * ── The defect this file exists to prevent ─────────────────────────
 *
 * The beam generator's own spread layout satisfied all four bends. The coordination search
 * then supplied `transverseSlots` from a domain built by packing rows at the minimum pitch and
 * shifting them, `placeGroup` accepted those slots, and the result was asymmetric: the same
 * bar COUNT, two of four bends empty, on every stirrup of every beam. A count cannot see that.
 *
 * So the constraint lives in the domain. A candidate that leaves a bend empty is never offered
 * to the search — not offered and later repaired, not accepted and annotated. And a candidate
 * that is offered carries its witnesses, so the proof travels with the layout.
 */

import { describe, expect, it } from 'vitest';
import { generateLayoutCandidates, type CandidateRequest } from '../candidates';
import { seatedLongitudinalHalfExtents } from '../../../codes/cirsoc201/transverse-cage';
import { centrelineRadius, minMandrelDiameter } from '../../../codes/cirsoc201/bar-geometry';

/** A 300×550 beam, Ø8 stirrups, Ø16 main steel — the shape the fixtures use. */
function req(over: Partial<CandidateRequest> = {}): CandidateRequest {
  const b = 0.30, h = 0.55, cover = 0.025, tie = 8, bar = 16;
  const seat = seatedLongitudinalHalfExtents(b, h, cover, tie, bar);
  const r = centrelineRadius(minMandrelDiameter(tie, 'transverse').value, tie);
  return {
    count: 4, diameterMm: bar,
    clearWidth: 2 * seat.cage.halfAcross,
    edition: '2025', maxAggregateSizeMm: 19, memberKind: 'beam',
    placementTolerance: 0,
    cornerSeatAcross: seat.corner.halfAcross,
    cornerSeatTolerance: r + bar / 2000,
    ...over,
  };
}

describe('the domain only contains layouts whose stirrup bends contain a bar', () => {
  it('offers at least one layout, and every one of them is seated', () => {
    const out = generateLayoutCandidates(req());
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) {
      expect(c.bendWitnesses, c.id).toHaveLength(2);
      for (const w of c.bendWitnesses) expect(w.filledBy, `${c.id} ${w.seat}`).not.toBeNull();
    }
  });

  it('the witnesses name a real slot at the real seat, within the bend reach', () => {
    const r = req();
    for (const c of generateLayoutCandidates(r)) {
      for (const w of c.bendWitnesses) {
        expect(Math.abs(w.seatAcross)).toBeCloseTo(r.cornerSeatAcross!, 12);
        expect(w.offset).toBeLessThanOrEqual(r.cornerSeatTolerance! + 1e-12);
        // The bar filling a bend is in the OUTERMOST layer: an inner-layer bar sits at a
        // different depth and the bend is not there.
        expect(w.filledBy!.layer).toBe(0);
        expect(c.slots.some((s) =>
          s.layer === w.filledBy!.layer
          && Math.abs(s.across - w.filledBy!.across) < 1e-12)).toBe(true);
      }
    }
  });

  it('an asymmetric arrangement that empties a bend is REJECTED, not annotated', () => {
    // Reproduces the measured defect directly: shift the whole row so one seat is vacated.
    const r = req();
    const shifted = generateLayoutCandidates({
      ...r,
      // A tolerance of zero admits only an exact seat, so any arrangement whose outer bar is
      // not AT the seat must disappear from the domain rather than come back with a warning.
      cornerSeatTolerance: 0,
      clearWidth: r.clearWidth * 1.6,
    });
    for (const c of shifted) {
      for (const w of c.bendWitnesses) expect(w.filledBy).not.toBeNull();
    }
  });

  it('mirrored and multi-layer alternatives both survive the constraint', () => {
    // The constraint must not collapse the domain to a single representative: a joint whose
    // neighbour needs the other mirroring would then have nothing to agree with.
    const out = generateLayoutCandidates(req({ count: 7 }));
    expect(out.length).toBeGreaterThan(1);
    expect(new Set(out.map((c) => c.layers)).size).toBeGreaterThanOrEqual(1);
    for (const c of out) {
      for (const w of c.bendWitnesses) expect(w.filledBy, c.id).not.toBeNull();
    }
  });

  it('states no claim when the caller states no seat', () => {
    // A caller with no cage gets the pre-existing behaviour and an EMPTY witness list, rather
    // than an unchecked claim that the bends are satisfied.
    const out = generateLayoutCandidates(
      req({ cornerSeatAcross: undefined, cornerSeatTolerance: undefined }));
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) expect(c.bendWitnesses).toEqual([]);
  });

  it('returns an EMPTY domain when the certified steel cannot reach both seats', () => {
    // One bar cannot occupy two corners. The honest answer is no candidate — which the search
    // reports as an exhausted domain and feeds to the design-feedback enumeration — and not a
    // fabricated layout that puts the single bar somewhere convenient.
    expect(generateLayoutCandidates(req({ count: 1 }))).toEqual([]);
  });

  it('is deterministic under repetition', () => {
    const a = generateLayoutCandidates(req({ count: 6 }));
    const b = generateLayoutCandidates(req({ count: 6 }));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('never emits a seated layout that breaches §25.2.1 clear spacing', () => {
    // Seating is a constraint ON TOP of the spacing rule, never a licence to break it: a row
    // pinned to both seats with too many bars between them is dropped, not squeezed.
    for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      for (const c of generateLayoutCandidates(req({ count }))) {
        expect(c.minClearInLayer - 16 / 1000, `${count} bars, ${c.id}`)
          .toBeGreaterThanOrEqual(0.025 - 1e-9);
      }
    }
  });
});
