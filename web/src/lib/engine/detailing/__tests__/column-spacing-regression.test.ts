/**
 * A column cage must satisfy §25.2.3, and the generator must say so when it cannot.
 *
 * ── What this locks down ───────────────────────────────────────────
 *
 * `generateColumnStack` placed every non-corner bar on the two ±y faces and never checked
 * the resulting spacing. On the flagship that drew a 24Ø12 column as twenty bars crammed
 * onto two faces at roughly 8 mm clear, against the 40 mm the article requires — an illegal
 * cage, emitted without complaint.
 *
 * It cost more than its own correctness. Those twenty bars project onto the transverse axis
 * of every beam framing into that joint, and they are what made 120 beams report as
 * impossible to thread. A search was being handed geometry nobody would build and then
 * blamed for failing to coordinate it.
 *
 * Two guarantees here, and the second matters as much as the first: distribute the bars
 * legally when they fit, and REPORT rather than draw when they do not.
 */
import { describe, it, expect } from 'vitest';
import { generateColumnStack, type ColumnLift } from '../generate-column';
import { generateColumnCandidates } from '../column-candidates';
import { minClearSpacingColumn } from '../../../codes/cirsoc201/spacing';

function lift(count: number, diameterMm: number, size = 0.5): ColumnLift {
  return {
    elementId: 1, baseZ: 0, topZ: 3.2, b: size, h: size,
    centre: { x: 0, y: 0 }, bars: { count, diameterMm }, tieDia: 8, cover: 0.03,
  };
}

function stack(count: number, diameterMm: number, size = 0.5, positions?: Array<{ x: number; y: number }>) {
  return generateColumnStack({
    stackId: 'S', lifts: [lift(count, diameterMm, size)],
    fc: 25, fy: 420, maxAggregateSizeMm: 19, edition: '2025',
    lapSplice: () => 0.8, beamDepthAtTop: new Map(), roofTermination: true,
    barPositions: positions,
  });
}

/** Tightest clear distance between any two longitudinal bars, m. */
function tightest(bars: ReturnType<typeof stack>['bars'], diameterMm: number): number {
  const pts = bars
    .filter((b) => b.role === 'longitudinal')
    .map((b) => b.segments[0]!.start);
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    }
  }
  return min - diameterMm / 1000;
}

describe('§25.2.3 is enforced on the column cage', () => {
  it('reports the breach the two-face distribution produces, rather than drawing it', () => {
    const required = minClearSpacingColumn('2025', {
      barDiameterMm: 12, maxAggregateSizeMm: 19,
    }).minClear;
    const g = stack(24, 12);
    // The fallback distribution genuinely cannot hold 24 bars on two faces...
    expect(tightest(g.bars, 12)).toBeLessThan(required);
    // ...so it must SAY so. Silence here is what let the illegal cage through.
    expect(g.unsupported.join(' ')).toMatch(/separación libre mínima/);
  });

  it('says nothing when the cage is legal', () => {
    const g = stack(8, 20);
    expect(g.unsupported.join(' ')).not.toMatch(/separación libre mínima/);
  });

  it('the four-face cage from column-candidates IS legal where two faces are not', () => {
    const required = minClearSpacingColumn('2025', {
      barDiameterMm: 12, maxAggregateSizeMm: 19,
    }).minClear;
    const cage = generateColumnCandidates({
      count: 24, diameterMm: 12, b: 0.5, h: 0.5, cover: 0.03, tieDiaMm: 8,
      edition: '2025', maxAggregateSizeMm: 19, placementTolerance: 0.010,
    });
    expect(cage.length).toBeGreaterThan(0);
    const legal = cage[0].slots.map((s) => ({ x: s.dx, y: s.dy }));
    const g = stack(24, 12, 0.5, legal);
    expect(tightest(g.bars, 12)).toBeGreaterThanOrEqual(required - 1e-9);
    expect(g.unsupported.join(' ')).not.toMatch(/separación libre mínima/);
  });

  it('28Ø12 in a 500 mm column IS legal, and is offered', () => {
    // This assertion used to demand the opposite, and it was wrong twice over. The
    // authoritative layout places 28Ø12 at 46.9 mm clear against the 40 mm §25.2.3
    // requires. It was refused only because the candidate check used minimum-plus-
    // tolerance as a veto — so the module contradicted the certificate the verifier had
    // already issued for the same bars.
    const cage = generateColumnCandidates({
      count: 28, diameterMm: 12, b: 0.5, h: 0.5, cover: 0.03, tieDiaMm: 8,
      edition: '2025', maxAggregateSizeMm: 19, placementTolerance: 0.010,
    });
    expect(cage.length).toBeGreaterThan(0);
    const required = minClearSpacingColumn('2025', {
      barDiameterMm: 12, maxAggregateSizeMm: 19,
    }).minClear;
    for (const c of cage) expect(c.minClear).toBeGreaterThanOrEqual(required - 1e-9);
  });

  it('a count that genuinely will not fit gets no cage at all', () => {
    // 40Ø25 in a 400 mm column: no distribution of any kind satisfies §25.2.3, and the
    // honest answer is to offer nothing rather than to draw something unbuildable.
    const cage = generateColumnCandidates({
      count: 40, diameterMm: 25, b: 0.4, h: 0.4, cover: 0.03, tieDiaMm: 8,
      edition: '2025', maxAggregateSizeMm: 19, placementTolerance: 0.010,
    });
    expect(cage).toEqual([]);
  });
});
