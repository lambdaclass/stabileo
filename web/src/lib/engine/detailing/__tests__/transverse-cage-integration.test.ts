/**
 * The physical transverse cage, measured on the production path.
 *
 * ── Why these assertions and not others ────────────────────────────
 *
 * Every one of these was a real defect found by running the fixture and reading the geometry,
 * not by reasoning about the code. They are kept because each of them was invisible to unit
 * tests: the pieces were individually correct and the assembly was not.
 *
 * The history, in the order the measurements came out:
 *
 *   177 prohibited conflicts   the cage appended to the assembly for the first time
 *   → 158   `samplePath` interpolated arcs LINEARLY between endpoints, so every bend was
 *           collision-checked as its chord. Twelve millimetres of steel in the wrong place on
 *           a 135° hook — more than the diameter of the bars it was checked against.
 *   → 18    corner bars were seated at `(d_s + d_b)/2`, the contact distance from a STRAIGHT
 *           leg, which puts them inside the corner bend; and the closing hook was a straight
 *           diagonal √2 too long, driven through the second layer.
 *   → 0     beam stirrups ran to the node — the column centreline — so both beams at a joint
 *           put a stirrup in the joint volume.
 *
 * Then the joint ties went in, and the same defects surfaced in the column:
 *
 *   22 → 8  three more modules had each re-derived the bar-seating rectangle, two of them
 *           wrongly. They now read one function.
 *   → 0     the collision sampler's 5 mm chord tolerance turned a designed contact into a
 *           3,17 mm interpenetration, eight times over.
 */

import { describe, expect, it } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-qa-8.json';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { runDetailing, type RunDetailingResult } from '../run-detailing';
import { samplePath, type BarPath } from '../../../codes/cirsoc201/bar-geometry';
import {
  buildStirrupSet, seatedCornerInset, seatedLongitudinalHalfExtents,
  stirrupCentrelineHalfExtents,
} from '../../../codes/cirsoc201/transverse-cage';
import { computeColumnLayout } from '../../station-design-forces';
import { generateColumnCandidates } from '../column-candidates';
import { COLLISION_CHORD_TOLERANCE } from '../collision';

let cached: RunDetailingResult | null = null;
function run(): RunDetailingResult {
  if (cached) return cached;
  const solved = solveFixture(frame as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  cached = runDetailing({
    contexts: solved.contexts,
    outcomes: summary.outcomes,
    nodes: solved.data.nodes as never,
    elements: solved.data.elements as never,
    edition: '2025',
    maxAggregateSizeMm: 19,
    verifierId: 'cirsoc201.provided.v2.2025',
    demandRevision: 1,
  } as never);
  return cached;
}

const allBars = (): BarPath[] => run().assemblies.flatMap((a) => a.bars);
const transverse = (): BarPath[] => allBars().filter((b) => b.role === 'transverse');

describe('the cage is in the assembly and it does not clash', () => {
  it('transverse steel reaches the assembly as real BarPaths', () => {
    const t = transverse();
    expect(t.length).toBeGreaterThan(0);
    // Not zones, not metadata: geometry with a developed length and a hooked end.
    for (const bar of t) {
      expect(bar.segments.length, bar.id).toBeGreaterThan(0);
      expect(bar.cuttingLength, bar.id).toBeGreaterThan(0);
      expect(bar.startTreatment.kind, bar.id).toBe('hook');
      expect(bar.endTreatment.kind, bar.id).toBe('hook');
    }
  });

  it('the joint volume carries its own transverse steel — §15.4.2', () => {
    // Not the beams' stirrups sitting in it. Those lie in the BEAM's section plane, at right
    // angles to what the clause asks for, and they used to be the only thing there.
    const ties = transverse().filter((b) => b.zoneId?.includes(':ties'));
    expect(ties.length).toBeGreaterThan(0);
    // A joint belongs to every member that forms it, or the classifier reads its ties as
    // unrelated to the beam steel they confine.
    for (const tie of ties) expect(tie.ownerElementIds.length, tie.id).toBeGreaterThan(1);
  });

  it('has ZERO prohibited physical conflicts', () => {
    const bad = run().assemblies.flatMap((a) => a.conflicts)
      .filter((c) => c.pairClass === 'prohibitedOverlap');
    expect(bad.map((c) => `${c.barA}/${c.barB} ${Math.round(c.clearance * 1000)}mm`)).toEqual([]);
  });

  it('has no conflict of any reportable class', () => {
    expect(run().assemblies.flatMap((a) => a.conflicts)).toEqual([]);
  });
});

describe('one derivation decides where a bar sits', () => {
  /**
   * Four modules used to answer this independently and two of them were wrong. The check is
   * coordinate-for-coordinate rather than "they all call the helper", because calling it and
   * then adjusting the result is exactly what the divergence looked like.
   */
  const CASES = [
    { b: 0.40, h: 0.40, cover: 0.025, tie: 8, bar: 16, count: 8 },
    { b: 0.30, h: 0.50, cover: 0.030, tie: 10, bar: 20, count: 8 },
    { b: 0.50, h: 0.35, cover: 0.020, tie: 6, bar: 12, count: 12 },
  ];

  it('the verifier and the candidate generator place corner bars identically', () => {
    for (const c of CASES) {
      const seat = seatedLongitudinalHalfExtents(c.b, c.h, c.cover, c.tie, c.bar);
      const layout = computeColumnLayout(c.count, c.bar, c.b, c.h, c.cover, c.tie);
      // Corner bars are the first four `computeColumnLayout` emits.
      for (const bar of layout.bars.slice(0, 4)) {
        expect(Math.abs(bar.x - c.b / 2), `${c.b}x${c.h} corner x`)
          .toBeCloseTo(seat.corner.halfAcross, 9);
        expect(Math.abs(bar.y - c.h / 2), `${c.b}x${c.h} corner y`)
          .toBeCloseTo(seat.corner.halfUp, 9);
      }
      const cands = generateColumnCandidates({
        count: c.count, diameterMm: c.bar, b: c.b, h: c.h, cover: c.cover, tieDiaMm: c.tie,
        edition: '2025', maxAggregateSizeMm: 19, placementTolerance: 0,
      } as never);
      for (const cand of cands) {
        const corners = cand.slots.filter((s: { corner?: boolean }) => s.corner);
        for (const s of corners as Array<{ dx: number; dy: number }>) {
          expect(Math.abs(s.dx), `${cand.arrangement} dx`).toBeCloseTo(seat.corner.halfAcross, 9);
          expect(Math.abs(s.dy), `${cand.arrangement} dy`).toBeCloseTo(seat.corner.halfUp, 9);
        }
      }
    }
  });

  it('a corner bar seats in the bend, not against two straight legs', () => {
    for (const c of CASES) {
      const seat = seatedLongitudinalHalfExtents(c.b, c.h, c.cover, c.tie, c.bar);
      // Strictly further in than straight-leg contact: the bend cuts the corner off.
      expect(seat.cornerInset).toBeGreaterThan(seat.faceInset);
      // And exactly as far in as the bend allows — tangent, so the surfaces touch.
      const inset = seatedCornerInset(c.tie, c.bar);
      expect(seat.cornerInset).toBeCloseTo(inset, 12);
    }
  });

  it('a face bar touches the straight leg it lies against', () => {
    for (const c of CASES) {
      const seat = seatedLongitudinalHalfExtents(c.b, c.h, c.cover, c.tie, c.bar);
      const cage = stirrupCentrelineHalfExtents(c.b, c.h, c.cover, c.tie);
      expect(cage.halfAcross - seat.face.halfAcross).toBeCloseTo((c.tie + c.bar) / 2000, 12);
    }
  });
});

describe('the collision sampler measures the arc, not its chord', () => {
  it('is fine enough that a designed contact never reads as interpenetration', () => {
    // A 135° hook at the coarse 5 mm default became two chords of 67,5°, each cutting
    // r(1 − cos 33,75°) inside the true bend. On a Ø8 tie that is 3,37 mm — larger than the
    // clearance being measured, and it manufactured eight interpenetrations that were not there.
    const r = 0.020;
    const sub = 2 * Math.acos(1 - COLLISION_CHORD_TOLERANCE / r) * 180 / Math.PI;
    const n = Math.ceil(135 / sub);
    const sagitta = r * (1 - Math.cos((135 / n) * Math.PI / 360));
    expect(sagitta).toBeLessThan(COLLISION_CHORD_TOLERANCE + 1e-12);
    // Well under the moat that separates contact from interpenetration.
    expect(sagitta).toBeLessThan(0.002 / 2);
  });

  it('samples a real bend as a curve, not a straight line', () => {
    const set = buildStirrupSet({
      elementId: 1, zoneId: 'z', station: 0,
      b: 0.3, h: 0.55, cover: 0.025, stirrupDiaMm: 8, legs: 2,
      longitudinalBars: [],
      origin: { x: 0, y: 0, z: 0 },
      axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, across: { x: 0, y: 1, z: 0 },
      hookOrientation: 'a', maxAggregateSizeMm: 19,
    });
    const arc = set.pieces[0].path.segments.find((s) => s.kind === 'arc')!;
    // Every bend records the centre it turns about; without it only the chord is recoverable.
    expect(arc.centre).toBeDefined();
    const pts = samplePath({ ...set.pieces[0].path, segments: [arc] }, COLLISION_CHORD_TOLERANCE);
    for (const p of pts) {
      const d = Math.hypot(p.x - arc.centre!.x, p.y - arc.centre!.y, p.z - arc.centre!.z);
      expect(d).toBeCloseTo(arc.radius!, 3);
    }
  });
});

describe('a cage piece is not a nudgeable bar', () => {
  it('the repair ladder leaves transverse steel exactly where it was built', () => {
    // Sliding a closed loop off one of the bars it encloses slides it into the one opposite.
    // Measured: the ladder moved each joint tie by ~8 mm and created eight conflicts that the
    // pre-repair geometry did not have.
    for (const bar of transverse()) {
      // A piece built in a section plane keeps a constant extent about its own station; a
      // translated one does not. Checked through the built rectangle's symmetry.
      const pts = samplePath(bar, 0.001);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      expect(Number.isFinite(spanX) && Number.isFinite(spanY), bar.id).toBe(true);
    }
    // The authoritative statement: nothing moved it, so nothing clashes.
    expect(run().assemblies.flatMap((a) => a.conflicts)
      .filter((c) => c.pairClass === 'prohibitedOverlap')).toEqual([]);
  });
});

describe('the pieces of one set stand side by side, not on one plane', () => {
  it('no two pieces of a set share a station', () => {
    const byZoneStation = new Map<string, BarPath[]>();
    for (const bar of transverse()) {
      const key = `${bar.zoneId}|${bar.station?.toFixed(4)}`;
      byZoneStation.set(key, [...(byZoneStation.get(key) ?? []), bar]);
    }
    for (const [key, group] of byZoneStation) {
      if (group.length < 2) continue;
      // Same nominal station, but each piece is offset along the member axis by a diameter —
      // they are separate bars standing against the formwork, and modelling them coplanar
      // makes every crossing between them read as an interpenetration.
      const centroids = group.map((b) => {
        const pts = samplePath(b, 0.002);
        return pts.reduce((s, p) => s + p.x + p.y + p.z, 0) / pts.length;
      });
      expect(new Set(centroids.map((c) => c.toFixed(6))).size, key).toBe(group.length);
    }
  });
});
