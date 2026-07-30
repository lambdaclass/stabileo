/**
 * Orthogonal joint-layer allocation.
 *
 * The clause finding these tests encode: §25.2.1 and §25.2.2 are written for "barras
 * PARALELAS". Nothing in §25.2 prescribes a clear distance between bars that cross. So
 * perpendicular beam bars may touch — and that is precisely why the 6,136 flagship
 * overlaps were not a spacing problem. They were centrelines passing through each other,
 * which no clause, tolerance or project decision permits.
 */

import { describe, expect, it } from 'vitest';
import {
  allocateLayers, crossingSeparation, depthAfterRaise, layerStep,
  type LineForLayering, type LineCrossing,
} from '../joint-layers';

function line(id: string, dx: number, dy: number, bar = 16, ids = [1]): LineForLayering {
  return { lineId: id, elementIds: ids, direction: { x: dx, y: dy }, maxBarMm: bar };
}

describe('what the code actually requires at a crossing', () => {
  it('two crossing bars need exactly their radii, because they may touch', () => {
    // Ø16 and Ø16: 8 + 8 = 16 mm centre to centre. Surfaces in contact, zero clear.
    expect(crossingSeparation(16, 16).separation).toBeCloseTo(0.016, 9);
  });

  it('unequal bars need the sum of their own radii, not twice the larger', () => {
    expect(crossingSeparation(20, 12).separation).toBeCloseTo(0.016, 9);
  });

  it('cites §25.2.1 as the clause it is NOT applying to the crossing', () => {
    // The provenance has to record which rule was consulted and found inapplicable,
    // or a reviewer cannot tell a considered decision from an oversight.
    expect(crossingSeparation(16, 16).refs[0].clause).toBe('25.2.1');
  });

  it('the project margin adds to the separation and is never negative', () => {
    expect(crossingSeparation(16, 16, 0.010).separation).toBeCloseTo(0.026, 9);
    expect(crossingSeparation(16, 16, -5).separation).toBeCloseTo(0.016, 9);
  });

  it('zero margin still means touching, never coincident', () => {
    expect(crossingSeparation(12, 12, 0).separation).toBeGreaterThan(0);
  });
});

describe('allocation on an orthogonal grid', () => {
  const grid = {
    lines: [line('line-000001', 1, 0), line('line-000002', 0, 1)],
    crossings: [{ a: 'line-000001', b: 'line-000002', jointId: 'n1' }] as LineCrossing[],
    edition: '2025' as const,
  };

  it('separates two crossing lines into different ranks', () => {
    const a = allocateLayers(grid);
    expect(a.byLine.get('line-000001')!.rank)
      .not.toBe(a.byLine.get('line-000002')!.rank);
  });

  it('two ranks suffice for a grid', () => {
    expect(allocateLayers(grid).ranks).toBe(2);
  });

  it('leaves nothing unresolved', () => {
    expect(allocateLayers(grid).unresolved).toEqual([]);
  });

  it('rank 0 keeps its full effective depth', () => {
    const a = allocateLayers(grid);
    const rank0 = [...a.byLine.values()].find((x) => x.rank === 0)!;
    expect(rank0.bottomRaise).toBe(0);
  });

  it('rank 1 is raised by exactly the crossing separation', () => {
    const a = allocateLayers(grid);
    const rank1 = [...a.byLine.values()].find((x) => x.rank === 1)!;
    expect(rank1.bottomRaise).toBeCloseTo(0.016, 9);
  });

  it('top bars drop by the same amount bottom bars rise', () => {
    const a = allocateLayers(grid);
    for (const v of a.byLine.values()) expect(v.topLower).toBeCloseTo(v.bottomRaise, 12);
  });

  it('parallel lines that never cross may share a rank', () => {
    // Three parallel lines, no crossings: stacking them would throw away lever arm for
    // nothing.
    const a = allocateLayers({
      lines: [line('line-000001', 1, 0), line('line-000002', 1, 0), line('line-000003', 1, 0)],
      crossings: [], edition: '2025',
    });
    expect(a.ranks).toBe(1);
    expect([...a.byLine.values()].every((v) => v.bottomRaise === 0)).toBe(true);
  });
});

describe('determinism', () => {
  const lines = [
    line('line-000003', 0, 1), line('line-000001', 1, 0), line('line-000002', 0, 1),
  ];
  const crossings: LineCrossing[] = [
    { a: 'line-000001', b: 'line-000003', jointId: 'n1' },
    { a: 'line-000001', b: 'line-000002', jointId: 'n2' },
  ];

  it('the same floor gives the same allocation whatever order it arrives in', () => {
    const a = allocateLayers({ lines, crossings, edition: '2025' });
    const b = allocateLayers({
      lines: [...lines].reverse(), crossings: [...crossings].reverse(), edition: '2025',
    });
    for (const [id, v] of a.byLine) {
      expect(b.byLine.get(id)!.rank).toBe(v.rank);
      expect(b.byLine.get(id)!.bottomRaise).toBeCloseTo(v.bottomRaise, 12);
    }
  });

  it('a self-crossing is ignored rather than making the graph unsatisfiable', () => {
    const a = allocateLayers({
      lines: [line('line-000001', 1, 0)],
      crossings: [{ a: 'line-000001', b: 'line-000001', jointId: 'n1' }],
      edition: '2025',
    });
    expect(a.unresolved).toEqual([]);
  });
});

describe('when the section runs out of room', () => {
  /** Four lines all crossing each other needs four ranks; cap it at two. */
  const clique = ['line-000001', 'line-000002', 'line-000003', 'line-000004'];
  const crossings: LineCrossing[] = [];
  for (let i = 0; i < clique.length; i++) {
    for (let j = i + 1; j < clique.length; j++) {
      crossings.push({ a: clique[i], b: clique[j], jointId: `n${i}${j}` });
    }
  }

  it('reports the crossings it could not separate instead of pretending', () => {
    const a = allocateLayers({
      lines: clique.map((id) => line(id, 1, 0)), crossings, edition: '2025', maxRanks: 2,
    });
    expect(a.unresolved.length).toBeGreaterThan(0);
    expect(a.unresolved[0].reason.key).toBe('detailing.layers.exhausted');
  });

  it('names the joint, so the engineer knows where to look', () => {
    const a = allocateLayers({
      lines: clique.map((id) => line(id, 1, 0)), crossings, edition: '2025', maxRanks: 2,
    });
    expect(a.unresolved[0].jointId).toMatch(/^n\d+$/);
  });
});

describe('raising steel costs lever arm', () => {
  it('the effective depth drops by exactly the raise', () => {
    expect(depthAfterRaise(0.60, 0.016)).toBeCloseTo(0.584, 9);
  });

  it('a rank-0 line loses nothing', () => {
    expect(depthAfterRaise(0.60, 0)).toBe(0.60);
  });

  it('never credits depth for a negative raise', () => {
    expect(depthAfterRaise(0.60, -0.02)).toBe(0.60);
  });
});

describe('liveness — the allocator must be reached with real crossings', () => {
  it('a grid with crossings produces at least one raised line', () => {
    // If this ever reads zero, the allocation is running on an empty crossing graph and
    // every line is silently rank 0 — which is exactly the state that produced 6,136
    // interpenetrating bars while looking like it had been coordinated.
    const a = allocateLayers({
      lines: [line('line-000001', 1, 0), line('line-000002', 0, 1)],
      crossings: [{ a: 'line-000001', b: 'line-000002', jointId: 'n1' }],
      edition: '2025',
    });
    expect([...a.byLine.values()].filter((v) => v.bottomRaise > 0).length).toBeGreaterThan(0);
  });
});

describe('the step is the diameter it steps over, not the mean clearance', () => {
  /**
   * The 309 pairs that survived correct rank assignment.
   *
   * Required CLEARANCE between crossing bars is (dA + dB)/2 — the two radii. The required
   * STEP is a different number, because both layers are referenced from the same face and
   * each bar's centre sits half its OWN diameter inside it. A Ø10 bar starts 11 mm nearer
   * the face than a Ø32 one before anything moves:
   *
   *     posA = −dA/2,  posB = −dB/2 − raise,  posA − posB ≥ (dA + dB)/2
   *     ⇒ raise ≥ (dA + dB)/2 + dA/2 − dB/2 = dA
   *
   * The dB terms cancel exactly. A THINNER bar in the upper rank needs MORE movement, not
   * less, which is the opposite of what the mean gives. The two agree only when the
   * diameters are equal — which is why every equal-diameter test passed.
   */
  it('steps by the lower layer’s diameter', () => {
    expect(layerStep(32)).toBeCloseTo(0.032, 9);
    expect(layerStep(10)).toBeCloseTo(0.010, 9);
  });

  it('a Ø32 under a Ø10 needs 32 mm, and the mean would have given 22', () => {
    const step = layerStep(32);
    const clearance = crossingSeparation(32, 10).separation;
    expect(step).toBeCloseTo(0.032, 9);
    expect(clearance).toBeCloseTo(0.021, 9);
    // The flagship's measured shortfall was exactly this difference.
    expect(step - clearance).toBeCloseTo(0.011, 9);
  });

  it('the step really does deliver the required clearance', () => {
    for (const [dA, dB] of [[32, 10], [10, 32], [16, 16], [25, 12], [8, 40]]) {
      const posA = -dA / 2000;
      const posB = -dB / 2000 - layerStep(dA);
      const centreDistance = posA - posB;
      expect(centreDistance, `Ø${dA} over Ø${dB}`)
        .toBeGreaterThanOrEqual(crossingSeparation(dA, dB).separation - 1e-12);
    }
  });

  it('agrees with the mean only when the diameters are equal', () => {
    expect(layerStep(16)).toBeCloseTo(crossingSeparation(16, 16).separation, 9);
    expect(layerStep(32)).not.toBeCloseTo(crossingSeparation(32, 10).separation, 9);
  });

  it('the project margin adds to the step', () => {
    expect(layerStep(20, 0.005)).toBeCloseTo(0.025, 9);
  });
});

describe('top and bottom faces are sized independently', () => {
  it('a line whose top steel is thin does not pay for its thick bottom steel', () => {
    const a = allocateLayers({
      lines: [
        { lineId: 'line-000001', elementIds: [1], direction: { x: 1, y: 0 },
          maxBarMm: 32, maxBottomMm: 12, maxTopMm: 32 },
        { lineId: 'line-000002', elementIds: [2], direction: { x: 0, y: 1 },
          maxBarMm: 12, maxBottomMm: 12, maxTopMm: 10 },
      ],
      crossings: [{ a: 'line-000001', b: 'line-000002', jointId: 'n1' }],
      edition: '2025',
    });
    const upper = a.byLine.get('line-000002')!;
    expect(upper.rank).toBe(1);
    // Top steps over a Ø32; bottom only over a Ø12. One scalar would have charged 32 to
    // both and spent 20 mm of lever arm on a clash that cannot happen.
    expect(upper.topLower).toBeCloseTo(0.032, 9);
    expect(upper.bottomRaise).toBeCloseTo(0.012, 9);
  });

  it('falls back to maxBarMm when a caller does not distinguish the faces', () => {
    const a = allocateLayers({
      lines: [
        { lineId: 'line-000001', elementIds: [1], direction: { x: 1, y: 0 }, maxBarMm: 20 },
        { lineId: 'line-000002', elementIds: [2], direction: { x: 0, y: 1 }, maxBarMm: 20 },
      ],
      crossings: [{ a: 'line-000001', b: 'line-000002', jointId: 'n1' }],
      edition: '2025',
    });
    const upper = a.byLine.get('line-000002')!;
    expect(upper.topLower).toBeCloseTo(0.020, 9);
    expect(upper.bottomRaise).toBeCloseTo(0.020, 9);
  });

  it('only lines it actually crosses constrain a line', () => {
    // Three lines: 1 and 2 cross; 3 shares rank 0 with 1 but is on the far side of the
    // floor. Line 3's Ø40 bars must not cost line 2 anything.
    const a = allocateLayers({
      lines: [
        { lineId: 'line-000001', elementIds: [1], direction: { x: 1, y: 0 }, maxBarMm: 12 },
        { lineId: 'line-000002', elementIds: [2], direction: { x: 0, y: 1 }, maxBarMm: 12 },
        { lineId: 'line-000003', elementIds: [3], direction: { x: 1, y: 0 }, maxBarMm: 40 },
      ],
      crossings: [{ a: 'line-000001', b: 'line-000002', jointId: 'n1' }],
      edition: '2025',
    });
    expect(a.byLine.get('line-000002')!.bottomRaise).toBeCloseTo(0.012, 9);
  });
});
