import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEIGHTS, TARGET_UTILIZATION, applyLock, coordinateLine, junctionCost,
  spanCost, type CoordinationWeights, type LayoutCandidate, type SpanInput,
} from '../coordinate-line';

/** A candidate whose steel area is derived from count and diameter, so costs are real. */
function cand(
  barCount: number, diameterMm: number, utilization: number,
  over: Partial<LayoutCandidate> = {},
): LayoutCandidate {
  const area = barCount * Math.PI * (diameterMm / 2000) ** 2;
  return {
    id: `${barCount}x${diameterMm}`,
    diameterMm, barCount, layers: 1, areaProvided: area,
    utilization, feasible: true, payload: null, ...over,
  };
}

function span(elementId: number, candidates: LayoutCandidate[], length = 6): SpanInput {
  return { elementId, length, locked: false, candidates };
}

describe('coordination DP — feasibility comes first', () => {
  it('reports EMPTY for no spans rather than pretending success', () => {
    expect(coordinateLine([]).status).toBe('EMPTY');
  });

  it('never selects an infeasible candidate, however cheap', () => {
    // The 2Ø12 is far cheaper on steel but fails; the DP must not reach for it.
    const r = coordinateLine([span(1, [
      cand(2, 12, 1.4, { feasible: false, infeasibleReason: 'flexión insuficiente' }),
      cand(5, 20, 0.88),
    ])]);
    expect(r.status).toBe('COORDINATED');
    if (r.status !== 'COORDINATED') return;
    expect(r.spans[0].chosen.id).toBe('5x20');
  });

  it('rejects a candidate with utilization above 1,00 even when marked feasible', () => {
    // Belt and braces: `feasible` is the generator's claim, utilization is measured.
    const r = coordinateLine([span(1, [cand(3, 12, 1.02)])]);
    expect(r.status).toBe('INFEASIBLE');
  });

  it('returns INFEASIBLE naming the span, instead of filling in the least-bad option', () => {
    const r = coordinateLine([
      span(1, [cand(4, 16, 0.8)]),
      span(2, [cand(2, 10, 1.6, { feasible: false, infeasibleReason: 'sección insuficiente' })]),
      span(3, [cand(4, 16, 0.8)]),
    ]);
    expect(r.status).toBe('INFEASIBLE');
    if (r.status !== 'INFEASIBLE') return;
    expect(r.infeasible).toHaveLength(1);
    expect(r.infeasible[0].elementId).toBe(2);
    expect(r.infeasible[0].reasons).toContain('sección insuficiente');
  });

  it('surfaces the measured utilization when the generator gave no reason', () => {
    const r = coordinateLine([span(1, [cand(3, 12, 1.30)])]);
    if (r.status !== 'INFEASIBLE') throw new Error('expected INFEASIBLE');
    expect(r.infeasible[0].reasons[0]).toMatch(/1,30|1\.30/);
  });
});

describe('coordination DP — the point of the exercise', () => {
  it('prefers one mark across three spans over three individually optimal ones', () => {
    // Each span, alone, would pick the smallest adequate layout. Together they should
    // converge, because two extra marks and two transitions cost more than the steel.
    const shared = cand(5, 16, 0.86);
    const r = coordinateLine([
      span(1, [cand(4, 16, 0.98), shared]),
      span(2, [cand(5, 16, 0.90), cand(6, 16, 0.80)]),
      span(3, [cand(4, 16, 0.96), cand(5, 16, 0.84)]),
    ]);
    expect(r.status).toBe('COORDINATED');
    if (r.status !== 'COORDINATED') return;
    expect(r.uniqueMarks).toBe(1);
    expect(r.transitions).toBe(0);
    expect(r.spans.map((s) => s.chosen.id)).toEqual(['5x16', '5x16', '5x16']);
  });

  it('does accept a transition when the demand genuinely requires one', () => {
    // Span 2 cannot be done with 5Ø16 at all, so a transition is unavoidable.
    const r = coordinateLine([
      span(1, [cand(5, 16, 0.85)]),
      span(2, [cand(5, 16, 1.30, { feasible: false, infeasibleReason: 'flexión' }), cand(6, 25, 0.90)]),
      span(3, [cand(5, 16, 0.85)]),
    ]);
    expect(r.status).toBe('COORDINATED');
    if (r.status !== 'COORDINATED') return;
    expect(r.spans[1].chosen.id).toBe('6x25');
    expect(r.transitions).toBe(2);
  });

  it('beats greedy left-to-right on a case built to trap it', () => {
    // Greedy picks the locally cheapest 4Ø16 for span 1, then pays two transitions.
    // The DP sees that starting on 6Ø20 costs a little more once and nothing after.
    const spans = [
      span(1, [cand(4, 16, 0.70), cand(6, 20, 0.45)]),
      span(2, [cand(6, 20, 0.95)]),
      span(3, [cand(6, 20, 0.95)]),
    ];
    const r = coordinateLine(spans);
    if (r.status !== 'COORDINATED') throw new Error('expected COORDINATED');

    const greedyFirst = spans[0].candidates
      .slice()
      .sort((a, b) => spanCost(a, spans[0], DEFAULT_WEIGHTS) - spanCost(b, spans[0], DEFAULT_WEIGHTS))[0];
    expect(greedyFirst.id).toBe('4x16');
    // The optimum does not start where greedy would.
    expect(r.spans[0].chosen.id).toBe('6x20');
    expect(r.transitions).toBe(0);
  });

  it('is exactly optimal — it matches brute force on a small line', () => {
    const spans = [
      span(1, [cand(4, 16, 0.90), cand(5, 16, 0.80), cand(4, 20, 0.60)]),
      span(2, [cand(5, 16, 0.95), cand(6, 16, 0.85), cand(4, 20, 0.70)]),
      span(3, [cand(4, 16, 0.92), cand(5, 20, 0.55), cand(4, 20, 0.75)]),
    ];
    const w = DEFAULT_WEIGHTS;

    let brute = Infinity;
    for (const a of spans[0].candidates) {
      for (const b of spans[1].candidates) {
        for (const c of spans[2].candidates) {
          const total =
            spanCost(a, spans[0], w) + spanCost(b, spans[1], w) + spanCost(c, spans[2], w)
            + junctionCost(a, b, w) + junctionCost(b, c, w);
          if (total < brute) brute = total;
        }
      }
    }

    const r = coordinateLine(spans, w);
    if (r.status !== 'COORDINATED') throw new Error('expected COORDINATED');
    expect(r.totalCost).toBeCloseTo(brute, 6);
  });

  it('penalises extra layers', () => {
    const oneLayer = cand(6, 16, 0.90);
    const twoLayers = cand(6, 16, 0.90, { id: 'stacked', layers: 2 });
    const s = span(1, [twoLayers, oneLayer]);
    expect(spanCost(twoLayers, s, DEFAULT_WEIGHTS))
      .toBeGreaterThan(spanCost(oneLayer, s, DEFAULT_WEIGHTS));
  });

  it('penalises a layout that sits far below the utilization target', () => {
    const lazy = cand(10, 25, 0.30, { id: 'lazy' });
    const tight = cand(10, 25, TARGET_UTILIZATION, { id: 'tight' });
    const s = span(1, [lazy, tight]);
    expect(spanCost(lazy, s, DEFAULT_WEIGHTS)).toBeGreaterThan(spanCost(tight, s, DEFAULT_WEIGHTS));
  });

  it('weights steel by span length, so a long span is worth optimising harder', () => {
    const c = cand(6, 20, 0.85);
    expect(spanCost(c, span(1, [c], 12), DEFAULT_WEIGHTS))
      .toBeGreaterThan(spanCost(c, span(1, [c], 3), DEFAULT_WEIGHTS));
  });

  it('lets a caller reweight so steel dominates continuity', () => {
    // Proves the weights are a real policy, not decoration.
    const steelFirst: CoordinationWeights = {
      ...DEFAULT_WEIGHTS, diameterChange: 0, countChange: 0, markChange: 0,
    };
    const spans = [
      span(1, [cand(4, 16, 0.98), cand(5, 16, 0.86)]),
      span(2, [cand(5, 16, 0.90)]),
    ];
    const balanced = coordinateLine(spans);
    const lean = coordinateLine(spans, steelFirst);
    if (balanced.status !== 'COORDINATED' || lean.status !== 'COORDINATED') throw new Error();
    expect(balanced.spans[0].chosen.id).toBe('5x16');
    expect(lean.spans[0].chosen.id).toBe('4x16');
  });
});

describe('determinism and explainability', () => {
  it('gives an identical result for identical input', () => {
    const build = () => [
      span(1, [cand(4, 16, 0.90), cand(5, 16, 0.80)]),
      span(2, [cand(5, 16, 0.95), cand(6, 16, 0.85)]),
    ];
    expect(JSON.stringify(coordinateLine(build()))).toBe(JSON.stringify(coordinateLine(build())));
  });

  it('does not depend on the order the generator emitted candidates', () => {
    const a = [cand(4, 16, 0.90), cand(5, 16, 0.80), cand(4, 20, 0.62)];
    const r1 = coordinateLine([span(1, a), span(2, a)]);
    const r2 = coordinateLine([span(1, [...a].reverse()), span(2, [...a].reverse())]);
    if (r1.status !== 'COORDINATED' || r2.status !== 'COORDINATED') throw new Error();
    expect(r1.spans.map((s) => s.chosen.id)).toEqual(r2.spans.map((s) => s.chosen.id));
  });

  it('emits a trace that names what was chosen and what it cost', () => {
    const r = coordinateLine([span(1, [cand(5, 16, 0.86)]), span(2, [cand(5, 16, 0.90)])]);
    if (r.status !== 'COORDINATED') throw new Error();
    expect(r.trace.join('\n')).toMatch(/5Ø16 \| 5Ø16/);
    expect(r.trace.join('\n')).toMatch(/1 unique mark/);
  });

  it('attributes cost per span and per junction', () => {
    const r = coordinateLine([
      span(1, [cand(4, 16, 0.90)]),
      span(2, [cand(6, 20, 0.85)]),
    ]);
    if (r.status !== 'COORDINATED') throw new Error();
    expect(r.spans[0].junctionCost).toBe(0);
    // Diameter AND count both change here.
    expect(r.spans[1].junctionCost).toBe(
      DEFAULT_WEIGHTS.diameterChange + DEFAULT_WEIGHTS.countChange + DEFAULT_WEIGHTS.markChange);
  });
});

describe('locked spans are hard constraints', () => {
  it('reduces a locked span to its pinned layout and pulls the line onto it', () => {
    const choices = [cand(4, 16, 0.90), cand(5, 16, 0.86)];
    const spans: SpanInput[] = [
      applyLock(span(1, choices), '5x16'),
      span(2, choices),
      span(3, choices),
    ];
    const r = coordinateLine(spans);
    if (r.status !== 'COORDINATED') throw new Error();
    // The pin holds...
    expect(r.spans[0].chosen.id).toBe('5x16');
    expect(r.spans[0].locked).toBe(true);
    // ...and the free spans follow it, because matching is cheaper than transitioning.
    expect(r.uniqueMarks).toBe(1);
  });

  it('does not force the whole line onto a heavily over-provisioned pin', () => {
    // A lock is a constraint on ITS span, not a decree over the line. When the pinned
    // layout is far more steel than the neighbours need, the DP correctly pays for one
    // transition rather than over-reinforcing every remaining span.
    const choices = [cand(4, 16, 0.90), cand(8, 25, 0.30)];
    const r = coordinateLine([
      applyLock(span(1, choices), '8x25'),
      span(2, choices),
      span(3, choices),
    ]);
    if (r.status !== 'COORDINATED') throw new Error();
    expect(r.spans[0].chosen.id).toBe('8x25');
    expect(r.spans[1].chosen.id).toBe('4x16');
    expect(r.transitions).toBe(1);
  });

  it('does not let a lock override feasibility of OTHER spans', () => {
    const r = coordinateLine([
      applyLock(span(1, [cand(4, 16, 0.9)]), '4x16'),
      span(2, [cand(4, 16, 1.5, { feasible: false, infeasibleReason: 'corte' })]),
    ]);
    expect(r.status).toBe('INFEASIBLE');
  });

  it('reports a stale pin instead of silently unpinning it', () => {
    // The usual cause is that demands changed and the pinned layout no longer qualifies.
    const locked = applyLock(span(1, [cand(4, 16, 0.9)]), '8x25');
    const r = coordinateLine([locked]);
    expect(r.status).toBe('INFEASIBLE');
    if (r.status !== 'INFEASIBLE') return;
    expect(r.infeasible[0].reasons[0]).toMatch(/ya no figura entre las alternativas/);
  });
});

describe('scale', () => {
  it('handles a long line with many candidates in O(n·k²)', () => {
    const candidates = [4, 5, 6, 7, 8].flatMap((n) =>
      [12, 16, 20, 25].map((d) => cand(n, d, 0.6 + (n % 3) * 0.1)));
    const spans = Array.from({ length: 40 }, (_, i) => span(i + 1, candidates));
    const t0 = performance.now();
    const r = coordinateLine(spans);
    const ms = performance.now() - t0;
    expect(r.status).toBe('COORDINATED');
    // 40 spans × 20² transitions is 16 000 evaluations; anything near a second would
    // mean the DP had accidentally become exponential.
    expect(ms).toBeLessThan(250);
    if (r.status !== 'COORDINATED') return;
    expect(r.spans).toHaveLength(40);
    expect(r.uniqueMarks).toBe(1);
  });
});
