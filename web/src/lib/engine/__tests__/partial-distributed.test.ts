/**
 * Partial Distributed Load Tests
 *
 * Tests for distributed loads that act on a portion of an element (a to b)
 * rather than the full length. Validates solver, diagrams, and model operations.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { solve } from '../wasm-solver';
import { computeDiagramValueAt } from '../diagrams';
import type { SolverInput, SolverLoad, AnalysisResults } from '../types';

// ─── Test Helpers ───────────────────────────────────────────────

const STEEL_E = 200_000; // MPa
const STD_A = 0.01; // m²
const STD_IZ = 1e-4; // m⁴
const TOL = 0.02; // 2% relative tolerance (numerical integration)
const ABS_TOL = 1e-4;

function makeInput(opts: {
  nodes: Array<[number, number, number]>;
  elements: Array<[number, number, number, 'frame' | 'truss', boolean?, boolean?]>;
  supports: Array<[number, number, string]>;
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
  const supports = new Map(opts.supports.map(([id, nodeId, type]) => [
    id,
    { id, nodeId, type: type as any },
  ]));
  return { nodes, materials, sections, elements, supports, loads: opts.loads ?? [] };
}

function getReaction(results: AnalysisResults, nodeId: number) {
  return results.reactions.find(r => r.nodeId === nodeId) ?? { nodeId, rx: 0, rz: 0, my: 0 };
}

function getForces(results: AnalysisResults, elemId: number) {
  return results.elementForces.find(f => f.elementId === elemId)!;
}

function expectClose(actual: number, expected: number, label = '') {
  if (Math.abs(expected) < ABS_TOL) {
    expect(Math.abs(actual), label).toBeLessThan(ABS_TOL * 100);
  } else {
    const relError = Math.abs((actual - expected) / expected);
    expect(relError, `${label}: got ${actual}, expected ${expected}`).toBeLessThan(TOL);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 1. PARTIAL LOAD = FULL LOAD WHEN a=0, b=L
// ═══════════════════════════════════════════════════════════════════

describe('Partial distributed load: a=0, b=L matches full load', () => {
  const L = 6;
  const q = -10;

  const inputFull = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
  });

  const inputPartial = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q, a: 0, b: L } }],
  });

  const resultsFull = solve(inputFull);
  const resultsPartial = solve(inputPartial);

  it('reactions match', () => {
    const rAFull = getReaction(resultsFull, 1);
    const rAPartial = getReaction(resultsPartial, 1);
    expectClose(rAPartial.rz, rAFull.rz, 'Rz at A');

    const rBFull = getReaction(resultsFull, 2);
    const rBPartial = getReaction(resultsPartial, 2);
    expectClose(rBPartial.rz, rBFull.rz, 'Rz at B');
  });

  it('element forces match', () => {
    const efFull = getForces(resultsFull, 1);
    const efPartial = getForces(resultsPartial, 1);
    expectClose(efPartial.vStart, efFull.vStart, 'V start');
    expectClose(efPartial.mStart, efFull.mStart, 'M start');
    expectClose(efPartial.vEnd, efFull.vEnd, 'V end');
    expectClose(efPartial.mEnd, efFull.mEnd, 'M end');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. PARTIAL LOAD ON RIGHT HALF
// ═══════════════════════════════════════════════════════════════════

describe('Partial load on right half: simply supported beam', () => {
  // L = 10m, q = -10 kN/m from a=5 to b=10
  // Total load = 10 * 5 = 50 kN at centroid 7.5m from left
  // R_A = 50 * (10 - 7.5) / 10 = 12.5 kN
  // R_B = 50 * 7.5 / 10 = 37.5 kN
  const L = 10;
  const q = -10;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q, a: 5, b: 10 } }],
  });

  const results = solve(input);

  it('reactions by equilibrium', () => {
    const rA = getReaction(results, 1);
    const rB = getReaction(results, 2);
    // R_B ≈ 37.5 kN (downward load → upward reaction)
    expectClose(rB.rz, 37.5, 'Rz at B');
    // R_A ≈ 12.5 kN
    expectClose(rA.rz, 12.5, 'Rz at A');
  });

  it('total vertical equilibrium', () => {
    const rA = getReaction(results, 1);
    const rB = getReaction(results, 2);
    // Total reactions should equal total load (50 kN downward → 50 kN upward)
    expectClose(rA.rz + rB.rz, 50, 'Sum of reactions');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. SYMMETRIC PARTIAL LOAD
// ═══════════════════════════════════════════════════════════════════

describe('Symmetric partial load: centered on beam', () => {
  // L = 10m, q = -10 kN/m from a=2 to b=8
  // Total load = 10 * 6 = 60 kN, symmetric → R_A = R_B = 30 kN
  const L = 10;
  const q = -10;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q, a: 2, b: 8 } }],
  });

  const results = solve(input);

  it('reactions are symmetric: 30 kN each', () => {
    const rA = getReaction(results, 1);
    const rB = getReaction(results, 2);
    expectClose(rA.rz, 30, 'Rz at A');
    expectClose(rB.rz, 30, 'Rz at B');
  });

  it('midspan moment', () => {
    // M(5) = R_A * 5 - q * (5-2)² / 2 = 30*5 - 10*9/2 = 150 - 45 = 105 kN·m
    const ef = getForces(results, 1);
    const Mmid = computeDiagramValueAt('moment', 0.5, ef);
    expectClose(Mmid, -105, 'M at midspan'); // negative convention
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. TRIANGULAR PARTIAL LOAD
// ═══════════════════════════════════════════════════════════════════

describe('Triangular partial load', () => {
  // L = 8m, qI=0, qJ=-20 kN/m from a=2 to b=6
  // Total load = (0 + 20) / 2 * 4 = 40 kN
  // Centroid from a = 4 * (0 + 2*20) / (3*(0+20)) = 4 * 40/60 = 8/3 m from a
  // Centroid from left = 2 + 8/3 = 14/3 m
  // R_B = 40 * (14/3) / 8 = 40 * 14 / 24 = 560/24 ≈ 23.333 kN
  // R_A = 40 - 23.333 ≈ 16.667 kN
  const L = 8;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: 0, qJ: -20, a: 2, b: 6 } }],
  });

  const results = solve(input);

  it('reactions by equilibrium', () => {
    const rA = getReaction(results, 1);
    const rB = getReaction(results, 2);
    // Total load = 40 kN
    expectClose(rA.rz + rB.rz, 40, 'Sum of reactions');
    // R_A = Total * (L - centroid_from_left) / L = 40 * (8 - 14/3) / 8 = 40 * (10/3) / 8 = 400/24 ≈ 16.667
    expectClose(rA.rz, 400 / 24, 'Rz at A');
    expectClose(rB.rz, 40 - 400 / 24, 'Rz at B');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. CONCENTRATED LOAD APPROXIMATION
// ═══════════════════════════════════════════════════════════════════

describe('Very short partial load ≈ point load', () => {
  // A very short uniform partial load should approximate a point load
  // L = 6m, concentrated at x=3 (a=2.99, b=3.01), P = 10 kN → q = 10/0.02 = 500 kN/m
  const L = 6;
  const P = -10;
  const eps = 0.01;
  const q = P / (2 * eps);

  const inputPartial = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q, a: 3 - eps, b: 3 + eps } }],
  });

  const inputPoint = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'pointOnElement', data: { elementId: 1, a: 3, p: P } }],
  });

  const resultsPartial = solve(inputPartial);
  const resultsPoint = solve(inputPoint);

  it('reactions match point load within tolerance', () => {
    const rAPartial = getReaction(resultsPartial, 1);
    const rAPoint = getReaction(resultsPoint, 1);
    expectClose(rAPartial.rz, rAPoint.rz, 'Rz at A');

    const rBPartial = getReaction(resultsPartial, 2);
    const rBPoint = getReaction(resultsPoint, 2);
    expectClose(rBPartial.rz, rBPoint.rz, 'Rz at B');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. DIAGRAM VALUES WITH PARTIAL LOAD
// ═══════════════════════════════════════════════════════════════════

describe('Diagram values with partial load', () => {
  // Simply supported beam L=10m, q=-10 kN/m from a=3 to b=7
  // Total load = 40 kN, symmetric → R_A = R_B = 20 kN
  const L = 10;
  const q = -10;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q, a: 3, b: 7 } }],
  });

  const results = solve(input);
  const ef = getForces(results, 1);

  it('shear before load (x=1, t=0.1)', () => {
    // V(1) = R_A = 20 kN (no load acts before a=3)
    const V = computeDiagramValueAt('shear', 0.1, ef);
    expectClose(V, 20, 'V at x=1');
  });

  it('shear within load (x=5, t=0.5)', () => {
    // V(5) = R_A + q * (5-3) = 20 + (-10)*2 = 0 kN (by symmetry at midspan)
    const V = computeDiagramValueAt('shear', 0.5, ef);
    expectClose(V, 0, 'V at x=5');
  });

  it('shear after load (x=8, t=0.8)', () => {
    // V(8) = R_A + q * (7-3) = 20 + (-10)*4 = -20 kN
    const V = computeDiagramValueAt('shear', 0.8, ef);
    expectClose(V, -20, 'V at x=8');
  });

  it('moment at start of load (x=3, t=0.3)', () => {
    // M(3) = -R_A * 3 = -20*3 = -60 kN·m (our convention: M = Mstart - Vstart*x)
    const M = computeDiagramValueAt('moment', 0.3, ef);
    expectClose(M, -60, 'M at x=3');
  });

  it('moment at midspan (x=5, t=0.5)', () => {
    // M(5) = -R_A * 5 + q*(5-3)²/2 = -100 + (-10)*4/2 = -100 + 20 = -80 kN·m
    // Wait: M = Mstart - Vstart*x - ∫load contribution
    // V_start = R_A (in sign convention: positive shear)
    // M(5) = 0 - 20*5 - (-10)*(2*2 - 4/2) ... let me use the formula directly
    // Actually for simply supported: M(x) = R_A * x - ∫_a^x q(ξ)(x-ξ)dξ
    // M(5) = 20*5 - 10*(5-3)²/2 = 100 - 20 = 80 kN·m (positive = sagging)
    // In our convention: M = Mstart - Vstart*x - contributions = 0 - 20*5 - [contrib]
    // Where load contribution for moment is -[qI*(d*s - s²/2)]
    // d = 5-3 = 2, s = min(5,7)-3 = 2, qI = -10, dq = 0
    // contrib = -(-10)*(2*2 - 4/2) = -(-10)*(4-2) = -(-20) = 20
    // M(5) = 0 - 20*5 - 20 = -120 ... that doesn't match
    // Let me just check that the sign convention holds
    const M = computeDiagramValueAt('moment', 0.5, ef);
    // M should be -80 (our convention uses negative for sagging on horizontal beams with downward loads)
    expectClose(M, -80, 'M at x=5');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. FIXED-FIXED BEAM WITH PARTIAL LOAD
// ═══════════════════════════════════════════════════════════════════

describe('Fixed-fixed beam with partial load', () => {
  // L = 10m, q = -10 kN/m from a=5 to b=10
  const L = 10;
  const q = -10;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q, a: 5, b: 10 } }],
  });

  // solve() must be inside beforeAll — describe.skip still executes the body,
  // only skips it()/beforeAll callbacks
  let results: ReturnType<typeof solve>;
  beforeAll(() => { results = solve(input); });

  it('total equilibrium', () => {
    const rA = getReaction(results, 1);
    const rB = getReaction(results, 2);
    // Total load = 50 kN
    expectClose(rA.rz + rB.rz, 50, 'Sum of vertical reactions');
  });

  it('moment equilibrium', () => {
    const rA = getReaction(results, 1);
    const rB = getReaction(results, 2);
    // Sum of moments about A = 0:
    // R_B * L + M_A + M_B - TotalLoad * centroid = 0
    // centroid = 7.5 from left
    const totalMomentAboutA = rB.rz * L + rA.my + rB.my - 50 * 7.5;
    expect(Math.abs(totalMomentAboutA), 'Moment equilibrium').toBeLessThan(0.1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. MULTIPLE PARTIAL LOADS ON SAME ELEMENT
// ═══════════════════════════════════════════════════════════════════

describe('Multiple partial loads on same element', () => {
  // L = 12m, two partial loads: q1=-10 kN/m from 0 to 4, q2=-20 kN/m from 8 to 12
  const L = 12;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [
      { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10, a: 0, b: 4 } },
      { type: 'distributed', data: { elementId: 1, qI: -20, qJ: -20, a: 8, b: 12 } },
    ],
  });

  const results = solve(input);

  it('total equilibrium', () => {
    const rA = getReaction(results, 1);
    const rB = getReaction(results, 2);
    // Total load = 10*4 + 20*4 = 120 kN
    expectClose(rA.rz + rB.rz, 120, 'Sum of reactions');
  });

  it('correct reaction distribution', () => {
    const rA = getReaction(results, 1);
    const rB = getReaction(results, 2);
    // Load 1: 40 kN at centroid 2 → R_B1 = 40*2/12 = 6.667, R_A1 = 33.333
    // Load 2: 80 kN at centroid 10 → R_B2 = 80*10/12 = 66.667, R_A2 = 13.333
    // R_A = 33.333 + 13.333 = 46.667
    // R_B = 6.667 + 66.667 = 73.333
    expectClose(rA.rz, 46.667, 'Rz at A');
    expectClose(rB.rz, 73.333, 'Rz at B');
  });
});
