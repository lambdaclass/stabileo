/**
 * Tests for load case combinations using linear superposition.
 *
 * Verifies that solving a structure separately per load case and then
 * linearly combining the results produces correct factored results.
 *
 * The solver is called once per case (filtering loads by caseId),
 * and results are combined with factors to verify superposition.
 */

import { describe, it, expect } from 'vitest';
import { solve } from '../solver-js';
import type { SolverInput, SolverSupport, SolverLoad, AnalysisResults } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────

function makeInput(opts: {
  nodes: Array<{ id: number; x: number; y: number }>;
  elements: Array<{ id: number; nodeI: number; nodeJ: number; type?: 'frame' | 'truss' }>;
  supports: Array<SolverSupport>;
  loads: SolverLoad[];
}): SolverInput {
  const mat = { e: 200e3, nu: 0.3 };
  const sec = { a: 0.01, iz: 0.0001 };

  return {
    nodes: new Map(opts.nodes.map(n => [n.id, n])),
    materials: new Map([[1, { id: 1, ...mat }]]),
    sections: new Map([[1, { id: 1, ...sec }]]),
    elements: new Map(opts.elements.map(e => [e.id, {
      id: e.id,
      type: e.type ?? 'frame',
      nodeI: e.nodeI,
      nodeJ: e.nodeJ,
      materialId: 1,
      sectionId: 1,
      hingeStart: false,
      hingeEnd: false,
    }])),
    supports: new Map(opts.supports.map(s => [s.id, s])),
    loads: opts.loads,
  };
}

function getReaction(results: ReturnType<typeof solve>, nodeId: number) {
  return results.reactions?.find(r => r.nodeId === nodeId);
}

function getForces(results: ReturnType<typeof solve>, elemId: number) {
  return results.elementForces?.find(f => f.elementId === elemId);
}

/**
 * Linearly combine reaction values from multiple cases.
 * factors: array of { caseId, factor }
 * perCase: map of caseId → solve results
 */
function combineReaction(
  nodeId: number,
  component: 'rx' | 'ry' | 'mz',
  factors: Array<{ caseId: number; factor: number }>,
  perCase: Map<number, ReturnType<typeof solve>>,
): number {
  let sum = 0;
  for (const { caseId, factor } of factors) {
    const caseResult = perCase.get(caseId);
    if (!caseResult) continue;
    const r = getReaction(caseResult, nodeId);
    if (r) sum += factor * r[component];
  }
  return sum;
}

// ─── Simple beam with D + L ───────────────────────────────────────────

describe('Load case combination: simple beam D + L', () => {
  // Simply supported beam, 6m span
  // D: q = -10 kN/m (uniform)
  // L: q = -5 kN/m (uniform)
  const baseOpts = {
    nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 6, y: 0 }],
    elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
    supports: [
      { id: 1, nodeId: 1, type: 'pinned' as const },
      { id: 2, nodeId: 2, type: 'rollerX' as const },
    ],
  };

  let resultD: ReturnType<typeof solve>;
  let resultL: ReturnType<typeof solve>;
  let resultAll: ReturnType<typeof solve>;

  it('solves D case independently', () => {
    const input = makeInput({
      ...baseOpts,
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    });
    resultD = solve(input);
    // Total: 10*6 = 60 kN → Ry each = 30 kN
    expect(getReaction(resultD, 1)!.ry).toBeCloseTo(30, 2);
    expect(getReaction(resultD, 2)!.ry).toBeCloseTo(30, 2);
  });

  it('solves L case independently', () => {
    const input = makeInput({
      ...baseOpts,
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -5, qJ: -5 } }],
    });
    resultL = solve(input);
    // Total: 5*6 = 30 kN → Ry each = 15 kN
    expect(getReaction(resultL, 1)!.ry).toBeCloseTo(15, 2);
    expect(getReaction(resultL, 2)!.ry).toBeCloseTo(15, 2);
  });

  it('1.2D + 1.6L combination via superposition matches direct solve', () => {
    // Combined: q = 1.2*(-10) + 1.6*(-5) = -12 - 8 = -20 kN/m
    const inputCombined = makeInput({
      ...baseOpts,
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -20, qJ: -20 } }],
    });
    resultAll = solve(inputCombined);

    const perCase = new Map<number, ReturnType<typeof solve>>();
    perCase.set(1, resultD);
    perCase.set(2, resultL);

    const factors = [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }];
    const combinedRy1 = combineReaction(1, 'ry', factors, perCase);
    const combinedRy2 = combineReaction(2, 'ry', factors, perCase);

    // Superposition: 1.2*30 + 1.6*15 = 36 + 24 = 60
    expect(combinedRy1).toBeCloseTo(60, 2);
    expect(combinedRy2).toBeCloseTo(60, 2);

    // Should match direct solve
    expect(combinedRy1).toBeCloseTo(getReaction(resultAll, 1)!.ry, 2);
    expect(combinedRy2).toBeCloseTo(getReaction(resultAll, 2)!.ry, 2);
  });

  it('1.4D combination', () => {
    const perCase = new Map<number, ReturnType<typeof solve>>();
    perCase.set(1, resultD);
    perCase.set(2, resultL);

    const factors = [{ caseId: 1, factor: 1.4 }];
    const combinedRy1 = combineReaction(1, 'ry', factors, perCase);

    // 1.4 * 30 = 42
    expect(combinedRy1).toBeCloseTo(42, 2);
  });
});

// ─── Portal frame with D + L + W ──────────────────────────────────────

describe('Load case combination: portal frame D + L + W', () => {
  //   2 ---- 3
  //   |      |
  //   1      4
  const baseOpts = {
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 0, y: 4 },
      { id: 3, x: 6, y: 4 },
      { id: 4, x: 6, y: 0 },
    ],
    elements: [
      { id: 1, nodeI: 1, nodeJ: 2 },
      { id: 2, nodeI: 2, nodeJ: 3 },
      { id: 3, nodeI: 3, nodeJ: 4 },
    ],
    supports: [
      { id: 1, nodeId: 1, type: 'fixed' as const },
      { id: 2, nodeId: 4, type: 'fixed' as const },
    ],
  };

  let resultD: ReturnType<typeof solve>;
  let resultL: ReturnType<typeof solve>;
  let resultW: ReturnType<typeof solve>;

  it('solves D (dead load on beam)', () => {
    const input = makeInput({
      ...baseOpts,
      loads: [{ type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10 } }],
    });
    resultD = solve(input);
    // Total vertical: 10*6 = 60 kN
    const totalRy = resultD.reactions!.reduce((s, r) => s + r.ry, 0);
    expect(totalRy).toBeCloseTo(60, 0);
    // Symmetric: each support takes 30 kN
    expect(getReaction(resultD, 1)!.ry).toBeCloseTo(30, 0);
    expect(getReaction(resultD, 4)!.ry).toBeCloseTo(30, 0);
  });

  it('solves L (live load on beam)', () => {
    const input = makeInput({
      ...baseOpts,
      loads: [{ type: 'distributed', data: { elementId: 2, qI: -5, qJ: -5 } }],
    });
    resultL = solve(input);
    const totalRy = resultL.reactions!.reduce((s, r) => s + r.ry, 0);
    expect(totalRy).toBeCloseTo(30, 0);
  });

  it('solves W (wind lateral load)', () => {
    const input = makeInput({
      ...baseOpts,
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 10, fy: 0, mz: 0 } }],
    });
    resultW = solve(input);
    // Horizontal equilibrium: sum Rx = -10
    const totalRx = resultW.reactions!.reduce((s, r) => s + r.rx, 0);
    expect(totalRx).toBeCloseTo(-10, 1);
  });

  it('1.2D + L + 1.6W: linear superposition is correct', () => {
    const perCase = new Map<number, ReturnType<typeof solve>>();
    perCase.set(1, resultD);
    perCase.set(2, resultL);
    perCase.set(3, resultW);

    const factors = [
      { caseId: 1, factor: 1.2 },
      { caseId: 2, factor: 1.0 },
      { caseId: 3, factor: 1.6 },
    ];

    // Vertical at node 1: 1.2*30 + 1.0*15 = 51 (W has no vertical at node 1 for symmetric)
    const ryNode1 = combineReaction(1, 'ry', factors, perCase);
    const ryNode4 = combineReaction(4, 'ry', factors, perCase);

    // Total vertical: 1.2*60 + 1.0*30 = 102 (W adds no vertical load)
    expect(ryNode1 + ryNode4).toBeCloseTo(102, 0);

    // Horizontal: 1.6 * (-10) = -16 total
    const rxNode1 = combineReaction(1, 'rx', factors, perCase);
    const rxNode4 = combineReaction(4, 'rx', factors, perCase);
    expect(rxNode1 + rxNode4).toBeCloseTo(-16, 0);
  });

  it('0.9D + 1.6W: favorable dead load', () => {
    const perCase = new Map<number, ReturnType<typeof solve>>();
    perCase.set(1, resultD);
    perCase.set(3, resultW);

    const factors = [
      { caseId: 1, factor: 0.9 },
      { caseId: 3, factor: 1.6 },
    ];

    const ryNode1 = combineReaction(1, 'ry', factors, perCase);
    const ryNode4 = combineReaction(4, 'ry', factors, perCase);

    // 0.9 * 60 = 54 total vertical
    expect(ryNode1 + ryNode4).toBeCloseTo(54, 0);
  });
});

// ─── Envelope (max/min across combinations) ───────────────────────────

describe('Envelope: max/min across combinations', () => {

  it('envelope captures correct extremes from multiple combos', () => {
    // Simply supported beam: D=q=-10, L=q=-5
    const baseOpts = {
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 6, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' as const },
        { id: 2, nodeId: 2, type: 'rollerX' as const },
      ],
    };

    const resultD = solve(makeInput({
      ...baseOpts,
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    }));

    const resultL = solve(makeInput({
      ...baseOpts,
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -5, qJ: -5 } }],
    }));

    const perCase = new Map<number, ReturnType<typeof solve>>();
    perCase.set(1, resultD);
    perCase.set(2, resultL);

    // Combination 1: 1.4D → Ry1 = 1.4*30 = 42
    const combo1Ry = combineReaction(1, 'ry', [{ caseId: 1, factor: 1.4 }], perCase);
    // Combination 2: 1.2D + 1.6L → Ry1 = 1.2*30 + 1.6*15 = 60
    const combo2Ry = combineReaction(1, 'ry', [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }], perCase);
    // Combination 3: 0.9D → Ry1 = 0.9*30 = 27
    const combo3Ry = combineReaction(1, 'ry', [{ caseId: 1, factor: 0.9 }], perCase);

    // Envelope max = 60 (combo 2), min = 27 (combo 3)
    const allRy = [combo1Ry, combo2Ry, combo3Ry];
    expect(Math.max(...allRy)).toBeCloseTo(60, 0);
    expect(Math.min(...allRy)).toBeCloseTo(27, 0);
  });
});

// ─── Multiple loads on same element, different cases ──────────────────

describe('Multiple loads on same element, different cases', () => {

  it('two distributed loads on same element with different caseIds solve independently', () => {
    const baseOpts = {
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 6, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' as const },
        { id: 2, nodeId: 2, type: 'rollerX' as const },
      ],
    };

    // Solve D case (only D loads)
    const resultD = solve(makeInput({
      ...baseOpts,
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    }));

    // Solve L case (only L loads)
    const resultL = solve(makeInput({
      ...baseOpts,
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -5, qJ: -5 } }],
    }));

    // Solve both together (what you'd get without filtering by case)
    const resultBoth = solve(makeInput({
      ...baseOpts,
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } },
        { type: 'distributed', data: { elementId: 1, qI: -5, qJ: -5 } },
      ],
    }));

    // D+L direct = 15 kN/m → Ry1 = 45
    expect(getReaction(resultBoth, 1)!.ry).toBeCloseTo(45, 2);

    // Superposition: D Ry1 + L Ry1 = 30 + 15 = 45
    expect(getReaction(resultD, 1)!.ry + getReaction(resultL, 1)!.ry).toBeCloseTo(45, 2);

    // Superposition equals direct solve
    expect(
      getReaction(resultD, 1)!.ry + getReaction(resultL, 1)!.ry
    ).toBeCloseTo(
      getReaction(resultBoth, 1)!.ry, 4
    );
  });

  it('nodal + distributed on same structure, different cases', () => {
    const baseOpts = {
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 6, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' as const },
        { id: 2, nodeId: 2, type: 'rollerX' as const },
      ],
    };

    // D: distributed load
    const resultD = solve(makeInput({
      ...baseOpts,
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    }));

    // E: point load at midspan
    const resultE = solve(makeInput({
      ...baseOpts,
      loads: [{ type: 'pointOnElement', data: { elementId: 1, a: 3, p: -20 } }],
    }));

    // D reactions: 30, 30
    // E reactions: 10, 10
    expect(getReaction(resultD, 1)!.ry).toBeCloseTo(30, 2);
    expect(getReaction(resultE, 1)!.ry).toBeCloseTo(10, 2);

    // 1.2D + E: Ry1 = 1.2*30 + 1.0*10 = 46
    const perCase = new Map<number, ReturnType<typeof solve>>();
    perCase.set(1, resultD);
    perCase.set(4, resultE);

    const combined = combineReaction(1, 'ry',
      [{ caseId: 1, factor: 1.2 }, { caseId: 4, factor: 1.0 }],
      perCase
    );
    expect(combined).toBeCloseTo(46, 2);
  });
});
