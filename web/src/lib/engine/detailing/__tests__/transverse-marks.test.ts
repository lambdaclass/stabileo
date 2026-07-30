/**
 * Fabrication data for the transverse cage — what the bender and the schedule receive.
 *
 * `assignMarks` groups by (diameter, cutting length, shape code) over the assembly's whole bar
 * list, so appending the cage put it into the marking pipeline automatically. That is worth
 * asserting rather than assuming: "it should be included because the list includes it" is the
 * same reasoning that had the cage detached for four sessions.
 */

import { describe, expect, it } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import { solveFixture } from '../../design/__tests__/helpers';
import { runDesign } from '../../design/candidate-search';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { runDetailing, type RunDetailingResult } from '../run-detailing';
import { developedLength, samplePath } from '../../../codes/cirsoc201/bar-geometry';

let cached: RunDetailingResult | null = null;
function run(): RunDetailingResult {
  if (cached) return cached;
  const solved = solveFixture(qa8 as never);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  cached = runDetailing({
    contexts: solved.contexts, outcomes: summary.outcomes,
    nodes: solved.data.nodes as never, elements: solved.data.elements as never,
    edition: '2025', maxAggregateSizeMm: 19,
    verifierId: 'cirsoc201.provided.v2.2025', demandRevision: 1,
  } as never);
  return cached;
}

describe('every fabricated transverse piece carries its fabrication data', () => {
  it('is marked, and the mark reconciles with the assembly bar list', () => {
    for (const a of run().assemblies) {
      const transverse = a.bars.filter((b) => b.role === 'transverse');
      expect(transverse.length).toBeGreaterThan(0);
      const marked = new Set(a.marks.flatMap((m) => m.barIds));
      // Reconciled against the paths, not regenerated from the zones: a schedule that counts
      // its own pieces can agree with itself while disagreeing with the steel.
      for (const bar of transverse) expect(marked.has(bar.id), bar.id).toBe(true);
      const total = a.marks.reduce((n, m) => n + m.barIds.length, 0);
      expect(total).toBe(a.bars.length);
    }
  });

  it('carries id, zone, station, diameter, shape and clause provenance', () => {
    for (const bar of run().assemblies.flatMap((a) => a.bars)) {
      if (bar.role !== 'transverse') continue;
      expect(bar.id, 'id').toMatch(/\S/);
      expect(bar.zoneId, `${bar.id} zone`).toBeTruthy();
      expect(bar.station, `${bar.id} station`).toBeTypeOf('number');
      expect(bar.cageId, `${bar.id} cage`).toBeTruthy();
      expect(bar.diameterMm, `${bar.id} diameter`).toBeGreaterThan(0);
      expect(bar.ownerElementIds.length, `${bar.id} owner`).toBeGreaterThan(0);
      expect(bar.refs.length, `${bar.id} clauses`).toBeGreaterThan(0);
      // A bend with a mandrel behind it, not a polyline.
      expect(bar.segments.some((s) => s.kind === 'arc'), `${bar.id} bends`).toBe(true);
      for (const s of bar.segments) {
        if (s.kind !== 'arc') continue;
        expect(s.radius, `${bar.id} radius`).toBeGreaterThan(0);
        expect(s.centre, `${bar.id} arc centre`).toBeDefined();
      }
    }
  });

  it('the cutting length is the developed centreline of the path it was built from', () => {
    // Not the zone's nominal perimeter. A schedule that orders the nominal under-orders every
    // piece by its bends.
    for (const bar of run().assemblies.flatMap((a) => a.bars)) {
      if (bar.role !== 'transverse') continue;
      expect(bar.cuttingLength).toBeCloseTo(developedLength(bar.segments), 9);
      // And it exceeds the straight-line span, because the bends and hooks are in it.
      const pts = samplePath(bar, 0.002);
      const chord = Math.hypot(
        pts[pts.length - 1].x - pts[0].x,
        pts[pts.length - 1].y - pts[0].y,
        pts[pts.length - 1].z - pts[0].z);
      expect(bar.cuttingLength).toBeGreaterThan(chord);
    }
  });

  it('identical shapes share a mark and different ones do not', () => {
    for (const a of run().assemblies) {
      const byId = new Map(a.bars.map((b) => [b.id, b]));
      for (const mark of a.marks) {
        const bars = mark.barIds.map((id) => byId.get(id)!).filter(Boolean);
        if (bars.length < 2) continue;
        // A mark is a fabrication instruction: everything under it must be the same item.
        const dia = new Set(bars.map((b) => b.diameterMm));
        const cut = new Set(bars.map((b) => b.cuttingLength.toFixed(3)));
        expect(dia.size, `${mark.mark} diameters`).toBe(1);
        expect(cut.size, `${mark.mark} cutting lengths`).toBe(1);
      }
      // And a stirrup never shares a mark with a crosstie: different pieces, different
      // cutting lengths, different bends.
      for (const mark of a.marks) {
        const kinds = new Set(mark.barIds.map((id) => byId.get(id)?.role ?? '?'));
        expect(kinds.size, `${mark.mark} mixes roles`).toBe(1);
      }
    }
  });

  it('is deterministic: two runs agree mark for mark', () => {
    const solved = solveFixture(qa8 as never);
    const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
    const second = runDetailing({
      contexts: solved.contexts, outcomes: summary.outcomes,
      nodes: solved.data.nodes as never, elements: solved.data.elements as never,
      edition: '2025', maxAggregateSizeMm: 19,
      verifierId: 'cirsoc201.provided.v2.2025', demandRevision: 1,
    } as never);
    const shape = (r: RunDetailingResult) => r.assemblies.map((a) => ({
      id: a.id,
      marks: a.marks.map((m) => `${m.mark}|${m.barIds.length}`),
    }));
    expect(shape(second)).toEqual(shape(run()));
  });
});
