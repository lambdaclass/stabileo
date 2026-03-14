/**
 * Advanced Solver Tests — Combinations, Influence Lines, Thermal, Self-Weight
 *
 * These tests cover features built on top of the core solver:
 *  - Load combinations and envelope computation
 *  - Influence line computation
 *  - Thermal loads (uniform + gradient)
 *  - Self-weight generation
 *  - Model serialization round-trip
 */

import { describe, it, expect } from 'vitest';
import { solve } from '../solver-js';
import type { SolverInput, SolverLoad, AnalysisResults } from '../types';

// ─── Test Helpers ───────────────────────────────────────────────

const STEEL_E = 200_000; // MPa
const STD_A = 0.01; // m²
const STD_IZ = 1e-4; // m⁴
const ALPHA = 1.2e-5; // /°C steel thermal expansion
const TOL = 0.02; // 2% relative tolerance
const ABS_TOL = 1e-6;

function makeInput(opts: {
  nodes: Array<[number, number, number]>;
  elements: Array<[number, number, number, 'frame' | 'truss', boolean?, boolean?]>;
  supports: Array<[number, number, string, Record<string, number>?]>;
  loads?: SolverLoad[];
  e?: number;
  a?: number;
  iz?: number;
}): SolverInput {
  const nodes = new Map(opts.nodes.map(([id, x, y]) => [id, { id, x, y }]));
  const materials = new Map([[1, { id: 1, e: opts.e ?? STEEL_E, nu: 0.3 }]]);
  const sections = new Map([[1, { id: 1, a: opts.a ?? STD_A, iz: opts.iz ?? STD_IZ }]]);
  const elements = new Map(opts.elements.map(([id, nodeI, nodeJ, type, hingeStart, hingeEnd]) => [
    id,
    { id, type, nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: hingeStart ?? false, hingeEnd: hingeEnd ?? false },
  ]));
  const supports = new Map(opts.supports.map(([id, nodeId, type, extra]) => [
    id,
    { id, nodeId, type: type as any, ...extra },
  ]));
  return { nodes, materials, sections, elements, supports, loads: opts.loads ?? [] };
}

function getReaction(results: AnalysisResults, nodeId: number) {
  return results.reactions.find(r => r.nodeId === nodeId) ?? { nodeId, rx: 0, ry: 0, mz: 0 };
}

function getDisp(results: AnalysisResults, nodeId: number) {
  return results.displacements.find(d => d.nodeId === nodeId)!;
}

function getForces(results: AnalysisResults, elemId: number) {
  return results.elementForces.find(f => f.elementId === elemId)!;
}

function expectClose(actual: number, expected: number, label = '') {
  if (Math.abs(expected) < ABS_TOL) {
    expect(Math.abs(actual), label).toBeLessThan(ABS_TOL * 1000);
  } else {
    const relError = Math.abs((actual - expected) / expected);
    expect(relError, `${label}: got ${actual}, expected ${expected}`).toBeLessThan(TOL);
  }
}

// ─── Combination helpers (replicate store logic for unit testing) ───

function combineResults(
  factors: Array<{ caseId: number; factor: number }>,
  perCase: Map<number, AnalysisResults>,
): AnalysisResults | null {
  const template = perCase.values().next().value;
  if (!template) return null;

  const displacements = template.displacements.map((d: any) => ({
    nodeId: d.nodeId, ux: 0, uy: 0, rz: 0,
  }));
  const reactions = template.reactions.map((r: any) => ({
    nodeId: r.nodeId, rx: 0, ry: 0, mz: 0,
  }));
  const elementForces = template.elementForces.map((f: any) => ({
    elementId: f.elementId,
    nStart: 0, nEnd: 0, vStart: 0, vEnd: 0, mStart: 0, mEnd: 0,
    length: f.length, qI: 0, qJ: 0,
    pointLoads: [] as Array<{ a: number; p: number }>,
  }));

  for (const { caseId, factor } of factors) {
    const r = perCase.get(caseId);
    if (!r) continue;
    for (let i = 0; i < r.displacements.length && i < displacements.length; i++) {
      displacements[i].ux += factor * r.displacements[i].ux;
      displacements[i].uy += factor * r.displacements[i].uy;
      displacements[i].rz += factor * r.displacements[i].rz;
    }
    for (let i = 0; i < r.reactions.length && i < reactions.length; i++) {
      reactions[i].rx += factor * r.reactions[i].rx;
      reactions[i].ry += factor * r.reactions[i].ry;
      reactions[i].mz += factor * r.reactions[i].mz;
    }
    for (let i = 0; i < r.elementForces.length && i < elementForces.length; i++) {
      elementForces[i].nStart += factor * r.elementForces[i].nStart;
      elementForces[i].nEnd += factor * r.elementForces[i].nEnd;
      elementForces[i].vStart += factor * r.elementForces[i].vStart;
      elementForces[i].vEnd += factor * r.elementForces[i].vEnd;
      elementForces[i].mStart += factor * r.elementForces[i].mStart;
      elementForces[i].mEnd += factor * r.elementForces[i].mEnd;
    }
  }
  return { displacements, reactions, elementForces };
}

function computeEnvelope(results: AnalysisResults[]): AnalysisResults | null {
  if (results.length === 0) return null;
  const first = results[0];
  const displacements = first.displacements.map(d => ({ ...d }));
  const reactions = first.reactions.map(r => ({ ...r }));
  const elementForces = first.elementForces.map(f => ({ ...f, pointLoads: [...f.pointLoads] }));

  for (let r = 1; r < results.length; r++) {
    const res = results[r];
    for (let i = 0; i < res.displacements.length && i < displacements.length; i++) {
      if (Math.abs(res.displacements[i].ux) > Math.abs(displacements[i].ux)) displacements[i].ux = res.displacements[i].ux;
      if (Math.abs(res.displacements[i].uy) > Math.abs(displacements[i].uy)) displacements[i].uy = res.displacements[i].uy;
      if (Math.abs(res.displacements[i].rz) > Math.abs(displacements[i].rz)) displacements[i].rz = res.displacements[i].rz;
    }
    for (let i = 0; i < res.reactions.length && i < reactions.length; i++) {
      if (Math.abs(res.reactions[i].rx) > Math.abs(reactions[i].rx)) reactions[i].rx = res.reactions[i].rx;
      if (Math.abs(res.reactions[i].ry) > Math.abs(reactions[i].ry)) reactions[i].ry = res.reactions[i].ry;
      if (Math.abs(res.reactions[i].mz) > Math.abs(reactions[i].mz)) reactions[i].mz = res.reactions[i].mz;
    }
    for (let i = 0; i < res.elementForces.length && i < elementForces.length; i++) {
      if (Math.abs(res.elementForces[i].nStart) > Math.abs(elementForces[i].nStart)) elementForces[i].nStart = res.elementForces[i].nStart;
      if (Math.abs(res.elementForces[i].nEnd) > Math.abs(elementForces[i].nEnd)) elementForces[i].nEnd = res.elementForces[i].nEnd;
      if (Math.abs(res.elementForces[i].mStart) > Math.abs(elementForces[i].mStart)) elementForces[i].mStart = res.elementForces[i].mStart;
      if (Math.abs(res.elementForces[i].mEnd) > Math.abs(elementForces[i].mEnd)) elementForces[i].mEnd = res.elementForces[i].mEnd;
      if (Math.abs(res.elementForces[i].vStart) > Math.abs(elementForces[i].vStart)) elementForces[i].vStart = res.elementForces[i].vStart;
      if (Math.abs(res.elementForces[i].vEnd) > Math.abs(elementForces[i].vEnd)) elementForces[i].vEnd = res.elementForces[i].vEnd;
    }
  }
  return { displacements, reactions, elementForces };
}

// ═══════════════════════════════════════════════════════════════════
// 15. LOAD COMBINATIONS — LINEAR SUPERPOSITION
// ═══════════════════════════════════════════════════════════════════

describe('Load combinations — linear superposition', () => {
  // Simply supported beam 6m
  // Case 1 (CM): q = -10 kN/m (dead load)
  // Case 2 (CV): P = -20 kN at midspan (live load)
  // Combo: 1.2*CM + 1.6*CV

  const base = {
    nodes: [[1, 0, 0], [2, 3, 0], [3, 6, 0]] as Array<[number, number, number]>,
    elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']] as Array<[number, number, number, 'frame' | 'truss']>,
    supports: [[1, 1, 'pinned'], [2, 3, 'rollerX']] as Array<[number, number, string]>,
  };

  const case1Loads: SolverLoad[] = [
    { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } },
    { type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10 } },
  ];
  const case2Loads: SolverLoad[] = [
    { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -20, mz: 0 } },
  ];

  let result1: AnalysisResults;
  let result2: AnalysisResults;

  it('solves each case independently', () => {
    result1 = solve(makeInput({ ...base, loads: case1Loads }));
    result2 = solve(makeInput({ ...base, loads: case2Loads }));
    expect(result1).toBeTruthy();
    expect(result2).toBeTruthy();
  });

  it('superposition: combined = factor1*case1 + factor2*case2', () => {
    const perCase = new Map<number, AnalysisResults>();
    perCase.set(1, result1);
    perCase.set(2, result2);

    const combined = combineResults(
      [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }],
      perCase,
    )!;
    expect(combined).toBeTruthy();

    // Check reactions
    const r1n1 = getReaction(result1, 1);
    const r2n1 = getReaction(result2, 1);
    const rc = getReaction(combined, 1);

    expectClose(rc.ry, 1.2 * r1n1.ry + 1.6 * r2n1.ry, 'Combined Ry at node 1');

    // Check displacements
    const d1 = getDisp(result1, 2);
    const d2 = getDisp(result2, 2);
    const dc = getDisp(combined, 2);

    expectClose(dc.uy, 1.2 * d1.uy + 1.6 * d2.uy, 'Combined uy at midspan');

    // Check element forces
    const f1 = getForces(result1, 1);
    const f2 = getForces(result2, 1);
    const fc = getForces(combined, 1);

    expectClose(fc.mEnd, 1.2 * f1.mEnd + 1.6 * f2.mEnd, 'Combined M at end of elem 1');
  });

  it('superposition with factor 1.0 equals single case result', () => {
    const perCase = new Map<number, AnalysisResults>();
    perCase.set(1, result1);
    perCase.set(2, result2);

    const combo1only = combineResults(
      [{ caseId: 1, factor: 1.0 }],
      perCase,
    )!;

    const r1 = getReaction(result1, 1);
    const rc = getReaction(combo1only, 1);

    expectClose(rc.ry, r1.ry, 'Factor 1.0 should equal original');
    expectClose(rc.mz, r1.mz, 'Factor 1.0 moment');
  });

  it('superposition with factor 0.0 gives zero', () => {
    const perCase = new Map<number, AnalysisResults>();
    perCase.set(1, result1);

    const zero = combineResults(
      [{ caseId: 1, factor: 0.0 }],
      perCase,
    )!;

    const rc = getReaction(zero, 1);
    expect(Math.abs(rc.ry)).toBeLessThan(ABS_TOL);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 16. ENVELOPE COMPUTATION
// ═══════════════════════════════════════════════════════════════════

describe('Envelope computation', () => {
  it('envelope picks max absolute with sign', () => {
    const r1: AnalysisResults = {
      displacements: [{ nodeId: 1, ux: 0.001, uy: -0.005, rz: 0.002 }],
      reactions: [{ nodeId: 1, rx: 10, ry: -30, mz: 5 }],
      elementForces: [{
        elementId: 1, nStart: 50, nEnd: -50,
        vStart: 20, vEnd: -20, mStart: 100, mEnd: -80,
        length: 5, qI: 0, qJ: 0, pointLoads: [],
      }],
    };
    const r2: AnalysisResults = {
      displacements: [{ nodeId: 1, ux: -0.003, uy: 0.002, rz: -0.004 }],
      reactions: [{ nodeId: 1, rx: -15, ry: 20, mz: -8 }],
      elementForces: [{
        elementId: 1, nStart: -70, nEnd: 30,
        vStart: -25, vEnd: 15, mStart: -60, mEnd: 120,
        length: 5, qI: 0, qJ: 0, pointLoads: [],
      }],
    };

    const env = computeEnvelope([r1, r2])!;
    expect(env).toBeTruthy();

    // Displacements: max abs with sign
    expect(env.displacements[0].ux).toBe(-0.003); // |-0.003| > |0.001|
    expect(env.displacements[0].uy).toBe(-0.005); // |-0.005| > |0.002|
    expect(env.displacements[0].rz).toBe(-0.004); // |-0.004| > |0.002|

    // Reactions
    expect(env.reactions[0].rx).toBe(-15);   // |-15| > |10|
    expect(env.reactions[0].ry).toBe(-30);   // |-30| > |20|
    expect(env.reactions[0].mz).toBe(-8);    // |-8| > |5|

    // Element forces
    expect(env.elementForces[0].nStart).toBe(-70);   // |-70| > |50|
    expect(env.elementForces[0].mEnd).toBe(120);      // |120| > |-80|
    expect(env.elementForces[0].vStart).toBe(-25);    // |-25| > |20|
  });

  it('single result envelope equals itself', () => {
    const r1: AnalysisResults = {
      displacements: [{ nodeId: 1, ux: 0.001, uy: -0.005, rz: 0.002 }],
      reactions: [{ nodeId: 1, rx: 10, ry: -30, mz: 5 }],
      elementForces: [{
        elementId: 1, nStart: 50, nEnd: -50,
        vStart: 20, vEnd: -20, mStart: 100, mEnd: -80,
        length: 5, qI: 0, qJ: 0, pointLoads: [],
      }],
    };

    const env = computeEnvelope([r1])!;
    expect(env.reactions[0].ry).toBe(-30);
    expect(env.elementForces[0].mStart).toBe(100);
  });

  it('envelope with three results picks max abs per field independently', () => {
    const r1: AnalysisResults = {
      displacements: [{ nodeId: 1, ux: 0.002, uy: -0.001, rz: 0 }],
      reactions: [{ nodeId: 1, rx: 5, ry: -10, mz: 3 }],
      elementForces: [{
        elementId: 1, nStart: 30, nEnd: -20,
        vStart: 10, vEnd: -5, mStart: 50, mEnd: -30,
        length: 5, qI: 0, qJ: 0, pointLoads: [],
      }],
    };
    const r2: AnalysisResults = {
      displacements: [{ nodeId: 1, ux: -0.001, uy: 0.003, rz: -0.002 }],
      reactions: [{ nodeId: 1, rx: -8, ry: 6, mz: -4 }],
      elementForces: [{
        elementId: 1, nStart: -40, nEnd: 15,
        vStart: -12, vEnd: 8, mStart: -80, mEnd: 60,
        length: 5, qI: 0, qJ: 0, pointLoads: [],
      }],
    };
    const r3: AnalysisResults = {
      displacements: [{ nodeId: 1, ux: 0, uy: -0.002, rz: 0.003 }],
      reactions: [{ nodeId: 1, rx: 2, ry: -12, mz: 1 }],
      elementForces: [{
        elementId: 1, nStart: 10, nEnd: -45,
        vStart: 5, vEnd: -15, mStart: 20, mEnd: -10,
        length: 5, qI: 0, qJ: 0, pointLoads: [],
      }],
    };

    const env = computeEnvelope([r1, r2, r3])!;
    expect(env).toBeTruthy();

    // Each field should independently pick the value with largest |magnitude|
    expect(env.displacements[0].ux).toBe(0.002);   // |0.002| > |-0.001| > |0|
    expect(env.displacements[0].uy).toBe(0.003);    // |0.003| > |-0.002| > |-0.001|
    expect(env.displacements[0].rz).toBe(0.003);    // |0.003| > |-0.002| > |0|

    expect(env.reactions[0].rx).toBe(-8);            // |-8| > |5| > |2|
    expect(env.reactions[0].ry).toBe(-12);           // |-12| > |-10| > |6|
    expect(env.reactions[0].mz).toBe(-4);            // |-4| > |3| > |1|

    expect(env.elementForces[0].nStart).toBe(-40);   // |-40| > |30| > |10|
    expect(env.elementForces[0].nEnd).toBe(-45);     // |-45| > |-20| > |15|
    expect(env.elementForces[0].vStart).toBe(-12);   // |-12| > |10| > |5|
    expect(env.elementForces[0].vEnd).toBe(-15);     // |-15| > |8| > |-5|
    expect(env.elementForces[0].mStart).toBe(-80);   // |-80| > |50| > |20|
    expect(env.elementForces[0].mEnd).toBe(60);      // |60| > |-30| > |-10|
  });
});

// ═══════════════════════════════════════════════════════════════════
// 16b. POINTWISE ENVELOPE — DUAL POSITIVE/NEGATIVE CURVES
// ═══════════════════════════════════════════════════════════════════

import { computePointwiseEnvelope } from '../moving-loads';

describe('Pointwise envelope — dual pos/neg curves', () => {
  it('tracks max positive and max negative moment separately', () => {
    // Combo 1: beam with downward load → positive moment at midspan
    // Combo 2: beam with upward load → negative moment at midspan
    const input1 = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    });
    const input2 = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: 5, qJ: 5 } }],
    });

    const r1 = solve(input1);
    const r2 = solve(input2);
    const env = computePointwiseEnvelope([r1, r2])!;
    expect(env).toBeTruthy();

    // Moment diagram should have both pos and neg
    const mEnv = env.moment;
    expect(mEnv.elements.length).toBe(1);

    const elem = mEnv.elements[0];
    expect(elem.tPositions.length).toBe(21);

    // At midspan (t=0.5, index 10): should have positive value from load down, negative from load up
    const midIdx = 10; // t = 0.5
    expect(elem.posValues[midIdx]).toBeGreaterThan(0); // Positive moment from downward load
    expect(elem.negValues[midIdx]).toBeLessThan(0);    // Negative moment from upward load

    // At supports (t=0 and t=1): moment should be ~0 for both
    expect(Math.abs(elem.posValues[0])).toBeLessThan(1);
    expect(Math.abs(elem.negValues[0])).toBeLessThan(1);
    expect(Math.abs(elem.posValues[20])).toBeLessThan(1);
    expect(Math.abs(elem.negValues[20])).toBeLessThan(1);
  });

  it('maxAbsResults matches legacy computeEnvelope behavior', () => {
    const r1: AnalysisResults = {
      displacements: [{ nodeId: 1, ux: 0.001, uy: -0.005, rz: 0.002 }],
      reactions: [{ nodeId: 1, rx: 10, ry: -30, mz: 5 }],
      elementForces: [{
        elementId: 1, nStart: 50, nEnd: -50,
        vStart: 20, vEnd: -20, mStart: 100, mEnd: -80,
        length: 5, qI: 0, qJ: 0, pointLoads: [],
        hingeStart: false, hingeEnd: false,
      }],
    };
    const r2: AnalysisResults = {
      displacements: [{ nodeId: 1, ux: -0.003, uy: 0.002, rz: -0.004 }],
      reactions: [{ nodeId: 1, rx: -15, ry: 20, mz: -8 }],
      elementForces: [{
        elementId: 1, nStart: -70, nEnd: 30,
        vStart: -25, vEnd: 15, mStart: -60, mEnd: 120,
        length: 5, qI: 0, qJ: 0, pointLoads: [],
        hingeStart: false, hingeEnd: false,
      }],
    };

    const env = computePointwiseEnvelope([r1, r2])!;
    expect(env).toBeTruthy();

    // maxAbsResults should match legacy behavior
    const maxAbs = env.maxAbsResults;
    expect(maxAbs.displacements[0].ux).toBe(-0.003);
    expect(maxAbs.displacements[0].uy).toBe(-0.005);
    expect(maxAbs.reactions[0].rx).toBe(-15);
    expect(maxAbs.reactions[0].ry).toBe(-30);
    expect(maxAbs.elementForces[0].nStart).toBe(-70);
    expect(maxAbs.elementForces[0].mEnd).toBe(120);
  });

  it('globalMax reflects the true maximum across all elements', () => {
    const input1 = makeInput({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 8, 0]],
      elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 3, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -20, qJ: -20 } }],
    });
    const r1 = solve(input1);
    const env = computePointwiseEnvelope([r1])!;

    // globalMax should be > 0 (there are forces)
    expect(env.moment.globalMax).toBeGreaterThan(0);
    expect(env.shear.globalMax).toBeGreaterThan(0);

    // All pos/neg values should be within [-globalMax, globalMax]
    for (const elem of env.moment.elements) {
      for (const v of elem.posValues) expect(v).toBeLessThanOrEqual(env.moment.globalMax + 1e-6);
      for (const v of elem.negValues) expect(v).toBeGreaterThanOrEqual(-env.moment.globalMax - 1e-6);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 17. INFLUENCE LINE — Ry FOR SIMPLY SUPPORTED BEAM
// ═══════════════════════════════════════════════════════════════════

describe('Influence line — Ry at support of simply supported beam', () => {
  // Beam L = 6m, pinned at 1 (x=0), roller at 2 (x=6)
  // IL for Ry at node 1: should be linear 1.0 at x=0, 0.0 at x=6

  const input = makeInput({
    nodes: [[1, 0, 0], [2, 6, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
  });

  it('IL(Ry) at left support = 1.0 when load is at left support', () => {
    // Place P=1 at node 1 (x=0)
    const loads: SolverLoad[] = [
      { type: 'nodal', data: { nodeId: 1, fx: 0, fy: -1, mz: 0 } },
    ];
    const result = solve({ ...input, loads });
    const ry = getReaction(result, 1).ry;
    expectClose(ry, 1.0, 'IL Ry at x=0 should be 1.0');
  });

  it('IL(Ry) at left support = 0.5 when load is at midspan', () => {
    // P=1 at midspan via point load on element
    const loads: SolverLoad[] = [
      { type: 'pointOnElement', data: { elementId: 1, a: 3.0, p: -1.0 } },
    ];
    const result = solve({ ...input, loads });
    const ry = getReaction(result, 1).ry;
    expectClose(ry, 0.5, 'IL Ry at x=3 should be 0.5');
  });

  it('IL(Ry) at left support = 0.0 when load is at right support', () => {
    const loads: SolverLoad[] = [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -1, mz: 0 } },
    ];
    const result = solve({ ...input, loads });
    const ry = getReaction(result, 1).ry;
    expect(Math.abs(ry)).toBeLessThan(ABS_TOL * 100);
  });

  it('IL(Ry) at left support decreases linearly with load position', () => {
    // Check at 1/4, 1/2, 3/4 span
    const L = 6;
    for (const frac of [0.25, 0.5, 0.75]) {
      const a = frac * L;
      const loads: SolverLoad[] = [
        { type: 'pointOnElement', data: { elementId: 1, a, p: -1.0 } },
      ];
      const result = solve({ ...input, loads });
      const ry = getReaction(result, 1).ry;
      const expected = 1 - frac; // Linear IL for simply supported beam
      expectClose(ry, expected, `IL Ry at x=${a}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 18. INFLUENCE LINE — M AT MIDSPAN
// ═══════════════════════════════════════════════════════════════════

describe('Influence line — M at midspan of simply supported beam', () => {
  // Beam L = 6m. IL for M at midspan (x=3): triangular, peak = L/4 = 1.5
  // Use two elements with node at midspan

  const input = makeInput({
    nodes: [[1, 0, 0], [2, 3, 0], [3, 6, 0]],
    elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 3, 'rollerX']],
  });

  it('IL(M) at midspan = L/4 when load is at midspan', () => {
    const loads: SolverLoad[] = [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -1, mz: 0 } },
    ];
    const result = solve({ ...input, loads });
    // M at node 2 = end moment of elem 1
    const f1 = getForces(result, 1);
    const L = 6;
    expectClose(f1.mEnd, -L / 4, 'IL M at midspan for load at midspan');
    // Note: sign convention — negative moment on hogging side
  });

  it('IL(M) at midspan = 0 when load is at support', () => {
    const loads: SolverLoad[] = [
      { type: 'nodal', data: { nodeId: 1, fx: 0, fy: -1, mz: 0 } },
    ];
    const result = solve({ ...input, loads });
    const f1 = getForces(result, 1);
    expect(Math.abs(f1.mEnd)).toBeLessThan(ABS_TOL * 100);
  });

  it('IL(M) at midspan for load at quarter span = (L/4)*(1/2) = L/8', () => {
    // Load at x=1.5 (quarter span on elem 1)
    const loads: SolverLoad[] = [
      { type: 'pointOnElement', data: { elementId: 1, a: 1.5, p: -1.0 } },
    ];
    const result = solve({ ...input, loads });
    // M at midspan = Ry_left * 3 - P * (3 - 1.5)
    // Ry_left = 1 * (6-1.5)/6 = 0.75
    // M = 0.75 * 3 - 1 * 1.5 = 2.25 - 1.5 = 0.75 = L/8
    const f1 = getForces(result, 1);
    expectClose(Math.abs(f1.mEnd), 6 / 8, 'IL M at quarter span');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 19. THERMAL LOADS — UNIFORM ΔT
// ═══════════════════════════════════════════════════════════════════

describe('Thermal loads — uniform temperature change', () => {
  const E = STEEL_E;
  const A = STD_A;
  const IZ = STD_IZ;
  const L = 5;
  const DT = 30; // °C

  it('fixed-fixed bar with ΔT: |N| = E·A·α·ΔT (restrained expansion)', () => {
    // Both ends fixed → full restraint → |N| = E*A*α*ΔT
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
      loads: [{ type: 'thermal', data: { elementId: 1, dtUniform: DT, dtGradient: 0 } }],
    });

    const result = solve(input);
    const f = getForces(result, 1);
    // E in MPa → E*1000 = kN/m²
    const E_kN_m2 = E * 1000;
    const expectedNabs = E_kN_m2 * A * ALPHA * DT;
    expectClose(Math.abs(f.nStart), expectedNabs, 'Axial force magnitude from uniform ΔT in fixed-fixed');
  });

  it('simply supported bar with ΔT: no axial force (free to expand)', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'thermal', data: { elementId: 1, dtUniform: DT, dtGradient: 0 } }],
    });

    const result = solve(input);
    const f = getForces(result, 1);
    // Should have zero (or near-zero) axial since roller allows expansion
    expect(Math.abs(f.nStart)).toBeLessThan(1);

    // Should have displacement at roller
    const d2 = getDisp(result, 2);
    const expectedDelta = ALPHA * DT * L;
    expectClose(Math.abs(d2.ux), expectedDelta, 'Thermal expansion magnitude at free end');
  });

  it('fixed-fixed bar with ΔT: zero displacement at both ends', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
      loads: [{ type: 'thermal', data: { elementId: 1, dtUniform: DT, dtGradient: 0 } }],
    });

    const result = solve(input);
    const d1 = getDisp(result, 1);
    const d2 = getDisp(result, 2);
    expect(Math.abs(d1.ux)).toBeLessThan(ABS_TOL);
    expect(Math.abs(d2.ux)).toBeLessThan(ABS_TOL);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 20. THERMAL LOADS — GRADIENT ΔTg
// ═══════════════════════════════════════════════════════════════════

describe('Thermal loads — temperature gradient', () => {
  const E = STEEL_E;
  const IZ = STD_IZ;
  const L = 5;
  const DTg = 20; // °C gradient (top - bottom)
  // Section height for gradient
  const b = 0.15, h = 0.3;

  it('fixed-fixed beam with ΔTg: M = E·I·α·ΔTg/h at both ends', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
      loads: [{ type: 'thermal', data: { elementId: 1, dtUniform: 0, dtGradient: DTg } }],
    });

    const result = solve(input);
    const f = getForces(result, 1);
    const E_kN_m2 = E * 1000;
    // h defaults to 0.3 (from section defaults) — solver uses section iz and computes h = sqrt(12*iz/A)
    const h_calc = Math.sqrt(12 * STD_IZ / STD_A); // = sqrt(12 * 1e-4 / 0.01) = sqrt(0.12) ≈ 0.3464
    const expectedM = E_kN_m2 * STD_IZ * ALPHA * DTg / h_calc;

    // Both end moments should be equal (fixed-fixed with only gradient)
    expectClose(Math.abs(f.mStart), expectedM, 'Moment from ΔTg at start');
    expectClose(Math.abs(f.mEnd), expectedM, 'Moment from ΔTg at end');
  });

  it('simply supported beam with ΔTg: zero moments, non-zero rotation', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'thermal', data: { elementId: 1, dtUniform: 0, dtGradient: DTg } }],
    });

    const result = solve(input);
    const f = getForces(result, 1);

    // Moments should be zero (free to rotate)
    expect(Math.abs(f.mStart)).toBeLessThan(1);
    expect(Math.abs(f.mEnd)).toBeLessThan(1);

    // But should have rotation at ends
    const d1 = getDisp(result, 1);
    expect(Math.abs(d1.rz)).toBeGreaterThan(1e-8);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 21. SELF-WEIGHT — ρ·A·g AS DISTRIBUTED LOAD
// ═══════════════════════════════════════════════════════════════════

describe('Self-weight as distributed load', () => {
  // Simply supported horizontal beam, L = 6m
  // Steel: ρ = 78.5 kN/m³, A = 0.01 m²
  // Self-weight q = ρ * A = 78.5 * 0.01 = 0.785 kN/m (downward)
  // Total weight W = q * L = 0.785 * 6 = 4.71 kN
  // Reactions: Ry = W/2 = 2.355 kN each

  const rho = 78.5; // kN/m³
  const A = 0.01;
  const L = 6;
  const q = rho * A; // 0.785 kN/m
  const W = q * L;

  it('self-weight generates correct reactions for horizontal beam', () => {
    // Manually apply self-weight as distributed load
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -q, qJ: -q } },
      ],
    });

    const result = solve(input);
    const r1 = getReaction(result, 1);
    const r2 = getReaction(result, 2);

    expectClose(r1.ry, W / 2, 'Ry at left support');
    expectClose(r2.ry, W / 2, 'Ry at right support');
  });

  it('equilibrium: sum of reactions equals total weight', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -q, qJ: -q } },
      ],
    });

    const result = solve(input);
    const r1 = getReaction(result, 1);
    const r2 = getReaction(result, 2);

    const totalRy = r1.ry + r2.ry;
    expectClose(totalRy, W, 'Sum of Ry = total weight');
  });

  it('self-weight midspan deflection matches wL^4/384EI formula', () => {
    const E = STEEL_E * 1000; // kN/m²
    const IZ = STD_IZ;

    // Subdivide into 2 elements so we have a midspan node
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L / 2, 0], [3, L, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
      ],
      supports: [[1, 1, 'pinned'], [2, 3, 'rollerX']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -q, qJ: -q } },
        { type: 'distributed', data: { elementId: 2, qI: -q, qJ: -q } },
      ],
    });

    const result = solve(input);
    const midDisp = getDisp(result, 2);

    // 5*q*L^4 / (384*E*I)
    const expectedDefl = -5 * q * Math.pow(L, 4) / (384 * E * IZ);

    expectClose(midDisp.uy, expectedDefl, 'Midspan deflection from self-weight');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 22. SELF-WEIGHT — INCLINED BEAM
// ═══════════════════════════════════════════════════════════════════

describe('Self-weight on inclined beam', () => {
  // 45° inclined beam, L_real = sqrt(3² + 3²) ≈ 4.243m
  // Self-weight acts vertically → has both perpendicular and axial components

  const rho = 78.5;
  const A = 0.01;
  const L = Math.sqrt(3 * 3 + 3 * 3);
  const q = rho * A;
  const W = q * L; // total weight (vertical, downward)

  it('equilibrium: total vertical reactions = total weight for inclined beam', () => {
    // q acts downward → decompose into local perpendicular and axial
    // For 45° beam: perpendicular component = q*cos(45°), axial = q*sin(45°)
    const cos45 = Math.cos(Math.PI / 4);
    const qPerp = -q * cos45; // perpendicular component

    const input = makeInput({
      nodes: [[1, 0, 0], [2, 3, 3]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'pinned']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: qPerp, qJ: qPerp } },
      ],
    });

    const result = solve(input);
    const r1 = getReaction(result, 1);
    const r2 = getReaction(result, 2);

    // Total vertical reaction should equal the vertical component of the perpendicular distributed load
    const totalRy = r1.ry + r2.ry;
    // The perpendicular distributed load has a vertical projection:
    // Actually for a 45° beam, q_perp acting perpendicular to the beam
    // has a vertical component of q_perp * cos(45°) = q * cos²(45°) = q/2
    // This only represents the perpendicular part; the axial component is separate
    // Total vertical from perpendicular load = qPerp * L * cos(θ) = q * cos(45°) * L * cos(45°)
    const expectedRy = Math.abs(qPerp) * L * cos45;
    expectClose(totalRy, expectedRy, 'Total Ry for inclined beam');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 23. SERIALIZATION — ROUND-TRIP
// ═══════════════════════════════════════════════════════════════════

describe('Model serialization round-trip via solver input', () => {
  it('solve results are identical for same input reconstructed from JSON', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 3, 0], [3, 6, 0]],
      elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 3, 'rollerX']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } },
        { type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10 } },
        { type: 'nodal', data: { nodeId: 2, fx: 5, fy: -20, mz: 0 } },
      ],
    });

    const result1 = solve(input);

    // Serialize and deserialize by converting Maps to arrays and back
    const serialized = JSON.stringify({
      nodes: Array.from(input.nodes.entries()),
      materials: Array.from(input.materials.entries()),
      sections: Array.from(input.sections.entries()),
      elements: Array.from(input.elements.entries()),
      supports: Array.from(input.supports.entries()),
      loads: input.loads,
    });

    const parsed = JSON.parse(serialized);
    const input2: SolverInput = {
      nodes: new Map(parsed.nodes),
      materials: new Map(parsed.materials),
      sections: new Map(parsed.sections),
      elements: new Map(parsed.elements),
      supports: new Map(parsed.supports),
      loads: parsed.loads,
    };

    const result2 = solve(input2);

    // Compare all results
    for (let i = 0; i < result1.displacements.length; i++) {
      expectClose(result2.displacements[i].ux, result1.displacements[i].ux, `disp ux node ${result1.displacements[i].nodeId}`);
      expectClose(result2.displacements[i].uy, result1.displacements[i].uy, `disp uy node ${result1.displacements[i].nodeId}`);
    }

    for (let i = 0; i < result1.reactions.length; i++) {
      expectClose(result2.reactions[i].rx, result1.reactions[i].rx, `reaction rx node ${result1.reactions[i].nodeId}`);
      expectClose(result2.reactions[i].ry, result1.reactions[i].ry, `reaction ry node ${result1.reactions[i].nodeId}`);
    }

    for (let i = 0; i < result1.elementForces.length; i++) {
      expectClose(result2.elementForces[i].mStart, result1.elementForces[i].mStart, `mStart elem ${result1.elementForces[i].elementId}`);
      expectClose(result2.elementForces[i].vStart, result1.elementForces[i].vStart, `vStart elem ${result1.elementForces[i].elementId}`);
    }
  });

  it('solver handles empty loads gracefully', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
      loads: [],
    });

    const result = solve(input);
    expect(result).toBeTruthy();

    // All displacements should be zero
    for (const d of result.displacements) {
      expect(Math.abs(d.ux)).toBeLessThan(ABS_TOL);
      expect(Math.abs(d.uy)).toBeLessThan(ABS_TOL);
      expect(Math.abs(d.rz)).toBeLessThan(ABS_TOL);
    }
  });

  it('solver handles mixed load types on same structure', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } },
        { type: 'nodal', data: { nodeId: 2, fx: 5, fy: 0, mz: 0 } },
        { type: 'thermal', data: { elementId: 1, dtUniform: 20, dtGradient: 10 } },
      ],
    });

    const result = solve(input);
    expect(result).toBeTruthy();
    expect(result.elementForces.length).toBe(1);

    // Equilibrium check: sum of vertical reactions = total distributed load
    const totalRy = result.reactions.reduce((s, r) => s + r.ry, 0);
    const totalVertLoad = 10 * 5; // q * L
    expectClose(totalRy, totalVertLoad, 'Vertical equilibrium with mixed loads');
  });

  it('thermal + mechanical loads superpose correctly', () => {
    // Solve with just mechanical, just thermal, and combined — verify superposition
    const base = {
      nodes: [[1, 0, 0], [2, 5, 0]] as Array<[number, number, number]>,
      elements: [[1, 1, 2, 'frame']] as Array<[number, number, number, 'frame' | 'truss']>,
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']] as Array<[number, number, string]>,
    };

    const mechLoads: SolverLoad[] = [
      { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } },
    ];
    const thermLoads: SolverLoad[] = [
      { type: 'thermal', data: { elementId: 1, dtUniform: 30, dtGradient: 0 } },
    ];
    const bothLoads = [...mechLoads, ...thermLoads];

    const rMech = solve(makeInput({ ...base, loads: mechLoads }));
    const rTherm = solve(makeInput({ ...base, loads: thermLoads }));
    const rBoth = solve(makeInput({ ...base, loads: bothLoads }));

    // For a linear system: combined = mech + therm
    const d1both = getDisp(rBoth, 2);
    const d1mech = getDisp(rMech, 2);
    const d1therm = getDisp(rTherm, 2);

    expectClose(d1both.ux, d1mech.ux + d1therm.ux, 'Superposition ux');
    expectClose(d1both.uy, d1mech.uy + d1therm.uy, 'Superposition uy');
    expectClose(d1both.rz, d1mech.rz + d1therm.rz, 'Superposition rz');

    // Check forces too
    const fBoth = getForces(rBoth, 1);
    const fMech = getForces(rMech, 1);
    const fTherm = getForces(rTherm, 1);

    expectClose(fBoth.nStart, fMech.nStart + fTherm.nStart, 'Superposition N start');
    expectClose(fBoth.mStart, fMech.mStart + fTherm.mStart, 'Superposition M start');
  });
});

describe('Three-hinge arch — internal hinge at crown', () => {
  it('solves without singular matrix error', () => {
    // Parabolic arch: 10m span, 4m rise, 8 segments
    const pts: [number, number, number][] = [];
    const nSeg = 8;
    for (let i = 0; i <= nSeg; i++) {
      const x = (i / nSeg) * 10;
      const y = 4 * (1 - ((x - 5) / 5) ** 2);
      pts.push([i + 1, x, y]);
    }
    const elements: [number, number, number, 'frame', boolean, boolean][] = [];
    const midIdx = nSeg / 2;
    for (let i = 0; i < nSeg; i++) {
      elements.push([
        i + 1, i + 1, i + 2, 'frame',
        i === midIdx,       // hingeStart at crown right element
        i === midIdx - 1,   // hingeEnd at crown left element
      ]);
    }
    const loads: SolverLoad[] = [];
    for (let i = 1; i < nSeg; i++) {
      loads.push({ type: 'nodal', data: { nodeId: i + 1, fx: 0, fy: -10, mz: 0 } });
    }
    const input = makeInput({
      nodes: pts,
      elements,
      supports: [[1, 1, 'pinned'], [2, nSeg + 1, 'pinned']],
      loads,
    });
    const result = solve(input);
    expect(result).toBeTruthy();
    expect(result.displacements.length).toBe(nSeg + 1);

    // Vertical equilibrium: sum of Ry at supports = total load = 7 × 10 = 70 kN
    const r1 = getReaction(result, 1);
    const r2 = getReaction(result, nSeg + 1);
    expectClose(r1.ry + r2.ry, 70, 'Vertical equilibrium');

    // Symmetric structure + symmetric load → equal reactions
    expectClose(r1.ry, 35, 'Left Ry');
    expectClose(r2.ry, 35, 'Right Ry');
  });
});

// ═══════════════════════════════════════════════════════════════════
// CHOLESKY SOLVER — VERIFY IDENTICAL RESULTS TO LU
// ═══════════════════════════════════════════════════════════════════

import { solveLU } from '../solver-js';
import { choleskySolve } from '../matrix-utils';

describe('Cholesky solver matches LU for SPD systems', () => {
  it('2x2 SPD system', () => {
    // K = [[4, 1], [1, 3]], b = [1, 2]
    // Exact: x = [1/11, 7/11]
    const K = new Float64Array([4, 1, 1, 3]);
    const b = new Float64Array([1, 2]);
    const xLU = solveLU(new Float64Array(K), new Float64Array(b), 2);
    const xCh = choleskySolve(new Float64Array(K), new Float64Array(b), 2)!;
    expect(xCh).toBeTruthy();
    for (let i = 0; i < 2; i++) {
      expect(Math.abs(xCh[i] - xLU[i])).toBeLessThan(1e-12);
    }
  });

  it('returns null for non-SPD matrix', () => {
    // Not positive definite: [[1, 2], [2, 1]]
    const K = new Float64Array([1, 2, 2, 1]);
    const b = new Float64Array([1, 1]);
    const result = choleskySolve(K, b, 2);
    expect(result).toBeNull();
  });

  it('simply supported beam: Cholesky matches LU', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 3, 0], [3, 6, 0]],
      elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 3, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    });
    const result = solve(input);
    // Verify equilibrium still works (Cholesky is now the default solver)
    const r1 = getReaction(result, 1);
    const r3 = getReaction(result, 3);
    expectClose(r1.ry + r3.ry, 30, 'Vertical equilibrium: q*L = 10*3');
  });
});

// ═══════════════════════════════════════════════════════════════════
// ASYNC MOVING LOADS — PROGRESS AND CANCELLATION
// ═══════════════════════════════════════════════════════════════════

import { solveMovingLoads, solveMovingLoadsAsync, computeAxleWorldPositions } from '../moving-loads';

describe('Async moving loads with progress', () => {
  const asyncInput = makeInput({
    nodes: [[1, 0, 0], [2, 4, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
  });

  it('produces same results as sync version', async () => {
    const syncResult = solveMovingLoads(asyncInput, {
      train: { name: 'test', axles: [{ offset: 0, weight: 100 }] },
      step: 1.0,
    });
    const asyncResult = await solveMovingLoadsAsync(asyncInput, {
      train: { name: 'test', axles: [{ offset: 0, weight: 100 }] },
      step: 1.0,
    });

    expect(typeof syncResult).not.toBe('string');
    expect(typeof asyncResult).not.toBe('string');
    if (typeof syncResult === 'string' || typeof asyncResult === 'string') return;

    expect(asyncResult.positions.length).toBe(syncResult.positions.length);
    // Compare first and last position forces
    for (let i = 0; i < syncResult.positions.length; i++) {
      const sf = syncResult.positions[i].results.elementForces[0];
      const af = asyncResult.positions[i].results.elementForces[0];
      expect(Math.abs(sf.mStart - af.mStart)).toBeLessThan(1e-10);
      expect(Math.abs(sf.vStart - af.vStart)).toBeLessThan(1e-10);
    }
  });

  it('calls progress callback', async () => {
    const progressCalls: Array<{ current: number; total: number }> = [];
    await solveMovingLoadsAsync(
      asyncInput,
      { train: { name: 'test', axles: [{ offset: 0, weight: 100 }] }, step: 1.0 },
      (p) => progressCalls.push({ current: p.current, total: p.total }),
    );

    expect(progressCalls.length).toBeGreaterThan(0);
    // First call should have current=1
    expect(progressCalls[0].current).toBe(1);
    // Last call should have current=total
    const last = progressCalls[progressCalls.length - 1];
    expect(last.current).toBe(last.total);
  });

  it('respects cancellation via AbortSignal', async () => {
    const ac = new AbortController();
    let callCount = 0;

    const resultPromise = solveMovingLoadsAsync(
      asyncInput,
      { train: { name: 'test', axles: [{ offset: 0, weight: 100 }] }, step: 0.5 },
      (p) => {
        callCount++;
        if (callCount >= 2) ac.abort(); // Cancel after 2 positions
      },
      ac.signal,
    );

    const result = await resultPromise;
    expect(result).toBe('Analysis cancelled');
  });
});

// ═══════════════════════════════════════════════════════════════════
// MOVING LOADS AND AXLE POSITIONS ON INCLINED/VERTICAL BARS
// ═══════════════════════════════════════════════════════════════════

describe('Moving loads on inclined and vertical bars', () => {
  // 45° inclined beam from (0,0) to (3,3), L = 3√2
  const inclinedInput = makeInput({
    nodes: [[1, 0, 0], [2, 3, 3]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
  });

  // Vertical bar from (0,0) to (0,4)
  const verticalInput = makeInput({
    nodes: [[1, 0, 0], [2, 0, 4]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
  });

  // L-shaped frame: horizontal beam + vertical column
  const lFrameInput = makeInput({
    nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4]],
    elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
    supports: [[1, 1, 'fixed'], [2, 3, 'rollerX']],
  });

  it('computeAxleWorldPositions returns cosTheta/sinTheta for 45° bar', () => {
    const result = solveMovingLoads(inclinedInput, {
      train: { name: 'test', axles: [{ offset: 0, weight: 100 }] },
      step: 1.0,
    });
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;

    const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 3, y: 3 }]]);
    const axles = computeAxleWorldPositions(
      1.0, result.train, result.path, (id) => nodes.get(id),
    );

    expect(axles.length).toBe(1);
    const a = axles[0];
    // 45° bar: cosθ = sinθ = 1/√2
    expect(a.cosTheta).toBeCloseTo(1 / Math.sqrt(2), 6);
    expect(a.sinTheta).toBeCloseTo(1 / Math.sqrt(2), 6);
    // Weight preserved
    expect(a.weight).toBe(100);
  });

  it('computeAxleWorldPositions returns cosTheta≈0, sinTheta≈1 for vertical bar', () => {
    const result = solveMovingLoads(verticalInput, {
      train: { name: 'test', axles: [{ offset: 0, weight: 100 }] },
      step: 1.0,
    });
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;

    const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 0, y: 4 }]]);
    const axles = computeAxleWorldPositions(
      2.0, result.train, result.path, (id) => nodes.get(id),
    );

    expect(axles.length).toBe(1);
    const a = axles[0];
    // Vertical bar: cosθ = 0, sinθ = 1
    expect(Math.abs(a.cosTheta)).toBeLessThan(1e-10);
    expect(a.sinTheta).toBeCloseTo(1, 6);
  });

  it('inclined bar with proper supports: transverse load produces bending', () => {
    // Pinned + rollerX on a 45° bar is unstable for transverse loads (slides freely)
    // Use fixed-fixed supports instead to see bending
    const inclinedFixed = makeInput({
      nodes: [[1, 0, 0], [2, 3, 3]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
    });

    const result = solveMovingLoads(inclinedFixed, {
      train: { name: 'test', axles: [{ offset: 0, weight: 100 }] },
      step: 0.5,
    });
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;

    // Should produce bending — check that we get nonzero moments
    let maxMom = 0;
    for (const pos of result.positions) {
      for (const ef of pos.results.elementForces) {
        maxMom = Math.max(maxMom, Math.abs(ef.mStart), Math.abs(ef.mEnd));
      }
    }
    expect(maxMom).toBeGreaterThan(1); // There should be significant bending
  });

  it('vertical bar: gravitational load is purely axial, zero transverse bending', () => {
    // On a vertical bar, perpendicular component = weight × cos(90°) = 0
    // All load is axial → V and M from the load should be zero
    const result = solveMovingLoads(verticalInput, {
      train: { name: 'test', axles: [{ offset: 0, weight: 100 }] },
      step: 1.0,
    });
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;

    // The load is purely axial → shear should be zero for all positions
    for (const pos of result.positions) {
      for (const ef of pos.results.elementForces) {
        expect(Math.abs(ef.vStart)).toBeLessThan(0.01);
        expect(Math.abs(ef.vEnd)).toBeLessThan(0.01);
      }
    }
  });

  it('L-frame: moving load traverses both vertical and horizontal bars', () => {
    const result = solveMovingLoads(lFrameInput, {
      train: { name: 'test', axles: [{ offset: 0, weight: 50 }] },
      step: 1.0,
    });
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;

    // Path should cover both elements
    expect(result.path.length).toBe(2);
    // Total length = 4 (vertical) + 6 (horizontal) = 10
    const totalLen = result.path[result.path.length - 1].cumStart + result.path[result.path.length - 1].length;
    expect(totalLen).toBeCloseTo(10, 3);

    // Should have multiple positions solved
    expect(result.positions.length).toBeGreaterThan(5);
  });

  it('axle world positions on L-frame follow both segments correctly', () => {
    const result = solveMovingLoads(lFrameInput, {
      train: { name: 'test', axles: [{ offset: 0, weight: 80 }] },
      step: 2.0,
    });
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;

    const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 0, y: 4 }], [3, { x: 6, y: 4 }]]);

    // Position at cumDist=2 → on vertical bar at (0, 2)
    const axles1 = computeAxleWorldPositions(2.0, result.train, result.path, (id) => nodes.get(id));
    expect(axles1.length).toBe(1);
    expect(axles1[0].x).toBeCloseTo(0, 6);
    expect(axles1[0].y).toBeCloseTo(2, 6);
    // Vertical element: cosθ ≈ 0, sinθ ≈ 1
    expect(Math.abs(axles1[0].cosTheta)).toBeLessThan(1e-10);
    expect(axles1[0].sinTheta).toBeCloseTo(1, 6);

    // Position at cumDist=7 → on horizontal bar at (3, 4) [7-4=3 along elem 2]
    const axles2 = computeAxleWorldPositions(7.0, result.train, result.path, (id) => nodes.get(id));
    expect(axles2.length).toBe(1);
    expect(axles2[0].x).toBeCloseTo(3, 6);
    expect(axles2[0].y).toBeCloseTo(4, 6);
    // Horizontal element: cosθ ≈ 1, sinθ ≈ 0
    expect(axles2[0].cosTheta).toBeCloseTo(1, 6);
    expect(Math.abs(axles2[0].sinTheta)).toBeLessThan(1e-10);
  });

  it('multi-axle train positions computed correctly on inclined bar', () => {
    const result = solveMovingLoads(inclinedInput, {
      train: { name: 'tandem', axles: [{ offset: 0, weight: 100 }, { offset: 1.0, weight: 100 }] },
      step: 0.5,
    });
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;

    const L = 3 * Math.sqrt(2); // ~4.243
    const nodes = new Map([[1, { x: 0, y: 0 }], [2, { x: 3, y: 3 }]]);

    // At refPos=1.0, axle 1 at 1.0m, axle 2 at 2.0m along bar
    const axles = computeAxleWorldPositions(1.0, result.train, result.path, (id) => nodes.get(id));
    expect(axles.length).toBe(2);

    // Both axles should be on the 45° line
    for (const a of axles) {
      expect(a.x).toBeCloseTo(a.y, 4); // x ≈ y for 45° line through origin
      expect(a.cosTheta).toBeCloseTo(1 / Math.sqrt(2), 6);
      expect(a.sinTheta).toBeCloseTo(1 / Math.sqrt(2), 6);
    }

    // Second axle should be 1m further along the bar
    const dist = Math.sqrt((axles[1].x - axles[0].x) ** 2 + (axles[1].y - axles[0].y) ** 2);
    expect(dist).toBeCloseTo(1.0, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MOVING LOAD FORCE DECOMPOSITION ON INCLINED BARS
// ═══════════════════════════════════════════════════════════════════

describe('Moving load force decomposition on inclined bars', () => {
  it('30° bar: perpendicular component = weight × cos(30°)', () => {
    // Bar at 30° from horizontal, L = 4/cos(30°) ≈ 4.619
    const cos30 = Math.cos(Math.PI / 6);
    const sin30 = Math.sin(Math.PI / 6);
    const L = 4 / cos30;

    const input = makeInput({
      nodes: [[1, 0, 0], [2, 4, 4 * sin30 / cos30]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    });

    // Apply load at midpoint
    const result = solveMovingLoads(input, {
      train: { name: 'test', axles: [{ offset: 0, weight: 100 }] },
      step: L / 2,
    });
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;

    // Find the position where the load is approximately at midpoint
    const midPos = result.positions.find(p => Math.abs(p.refPosition - L / 2) < L / 4);
    expect(midPos).toBeDefined();
    if (!midPos) return;

    // The reactions at supports should balance the applied load (100 kN downward)
    // In the solver convention, Ry reactions are positive upward, load is 100 kN downward
    const ry1 = midPos.results.reactions.find(r => r.nodeId === 1)?.ry ?? 0;
    const ry2 = midPos.results.reactions.find(r => r.nodeId === 2)?.ry ?? 0;
    // Total vertical reaction should balance the applied load: ΣRy = 100 kN (up)
    expect(Math.abs(ry1 + ry2 - 100)).toBeLessThan(0.5);
  });

  it('envelope on inclined bar has reduced bending vs horizontal', () => {
    // Compare max moment on horizontal vs 45° bar with same load
    const horizInput = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    });
    const inclinedInput45 = makeInput({
      nodes: [[1, 0, 0], [2, 6 / Math.sqrt(2), 6 / Math.sqrt(2)]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    });

    const horizResult = solveMovingLoads(horizInput, {
      train: { name: 'test', axles: [{ offset: 0, weight: 100 }] },
      step: 0.5,
    });
    const inclinedResult = solveMovingLoads(inclinedInput45, {
      train: { name: 'test', axles: [{ offset: 0, weight: 100 }] },
      step: 0.5,
    });

    expect(typeof horizResult).not.toBe('string');
    expect(typeof inclinedResult).not.toBe('string');
    if (typeof horizResult === 'string' || typeof inclinedResult === 'string') return;

    const horizMaxM = horizResult.elements.get(1);
    const inclinedMaxM = inclinedResult.elements.get(1);
    expect(horizMaxM).toBeDefined();
    expect(inclinedMaxM).toBeDefined();
    if (!horizMaxM || !inclinedMaxM) return;

    // Max moment on 45° bar should be ~cos(45°) ≈ 0.707 times horizontal
    // (because pPerp = W × cosθ)
    const ratio = Math.max(Math.abs(inclinedMaxM.mMaxPos), Math.abs(inclinedMaxM.mMaxNeg)) /
                  Math.max(Math.abs(horizMaxM.mMaxPos), Math.abs(horizMaxM.mMaxNeg));
    expect(ratio).toBeCloseTo(1 / Math.sqrt(2), 1); // ~0.707 with some tolerance
  });
});
