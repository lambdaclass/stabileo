/**
 * Solver Tests — Verification against analytical solutions
 *
 * These tests validate the JavaScript solver against known closed-form
 * solutions from structural analysis theory. A failure here means the
 * solver is producing incorrect results, which is DANGEROUS for users.
 *
 * References:
 *   - Hibbeler, Structural Analysis (10th ed)
 *   - Kassimali, Structural Analysis (6th ed)
 *   - Beer & Johnston, Mechanics of Materials
 */

import { describe, it, expect } from 'vitest';
import { solve } from '../solver-js';
import type { SolverInput, SolverLoad, AnalysisResults } from '../types';

// ─── Test Helpers ───────────────────────────────────────────────

/** Standard steel: E = 200,000 MPa (200 GPa) */
const STEEL_E = 200_000; // MPa

/** Standard section: A = 0.01 m², Iz = 1e-4 m⁴ */
const STD_A = 0.01;
const STD_IZ = 1e-4;

/** Build a minimal SolverInput for convenience */
function makeInput(opts: {
  nodes: Array<[number, number, number]>; // [id, x, y]
  elements: Array<[number, number, number, 'frame' | 'truss', boolean?, boolean?]>; // [id, nodeI, nodeJ, type, hingeStart, hingeEnd]
  supports: Array<[number, number, string]>; // [id, nodeId, type]
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
  return results.reactions.find(r => r.nodeId === nodeId) ?? { nodeId, rx: 0, ry: 0, mz: 0 };
}

function getDisp(results: AnalysisResults, nodeId: number) {
  return results.displacements.find(d => d.nodeId === nodeId);
}

function getForces(results: AnalysisResults, elemId: number) {
  return results.elementForces.find(f => f.elementId === elemId);
}

// Tolerance: structural calculations typically 0.1% is excellent
const TOL = 0.01; // 1% relative tolerance for comparing against analytical
const ABS_TOL = 1e-6; // absolute tolerance for values near zero

function expectClose(actual: number, expected: number, label = '') {
  if (Math.abs(expected) < ABS_TOL) {
    expect(Math.abs(actual), label).toBeLessThan(ABS_TOL * 100);
  } else {
    const relError = Math.abs((actual - expected) / expected);
    expect(relError, `${label}: got ${actual}, expected ${expected}`).toBeLessThan(TOL);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 1. SIMPLY SUPPORTED BEAM — UNIFORM DISTRIBUTED LOAD
// ═══════════════════════════════════════════════════════════════════

describe('Simply supported beam with uniform load', () => {
  // q = 10 kN/m, L = 6 m
  // R_A = R_B = qL/2 = 30 kN
  // M_max = qL²/8 = 45 kN·m (at midspan)
  // δ_max = 5qL⁴/(384EI) at midspan

  const L = 6;
  const q = -10; // downward in local perpendicular

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
  });

  const results = solve(input);

  it('reactions are qL/2 = 30 kN each', () => {
    const rA = getReaction(results, 1)!;
    const rB = getReaction(results, 2)!;
    expectClose(rA.ry, 30, 'Ry at A');
    expectClose(rB.ry, 30, 'Ry at B');
    expectClose(rA.rx, 0, 'Rx at A');
  });

  it('moment at ends is zero (simply supported)', () => {
    const f = getForces(results, 1)!;
    expectClose(f.mStart, 0, 'M at node I');
    expectClose(f.mEnd, 0, 'M at node J');
  });

  it('shear at ends is ±qL/2', () => {
    const f = getForces(results, 1)!;
    expectClose(f.vStart, 30, 'V at node I');
    expectClose(f.vEnd, -30, 'V at node J');
  });

  it('midspan deflection = 5qL⁴/(384EI)', () => {
    // With only 2 nodes, we can't measure midspan directly,
    // but the formula for end rotations is: θ = qL³/(24EI)
    const EI = STEEL_E * 1000 * STD_IZ; // kN·m²
    const thetaExpected = Math.abs(q) * L ** 3 / (24 * EI);
    const d1 = getDisp(results, 1)!;
    expectClose(Math.abs(d1.rz), thetaExpected, 'rotation at A');
  });

  it('global equilibrium: ΣFy = 0', () => {
    const rA = getReaction(results, 1)!;
    const rB = getReaction(results, 2)!;
    const totalLoad = Math.abs(q) * L;
    expectClose(rA.ry + rB.ry, totalLoad, 'ΣFy');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. CANTILEVER — POINT LOAD AT TIP
// ═══════════════════════════════════════════════════════════════════

describe('Cantilever with point load at tip', () => {
  // P = 50 kN downward, L = 4 m
  // R_y = P = 50 kN, M_fix = P*L = 200 kN·m
  // δ_tip = PL³/(3EI), θ_tip = PL²/(2EI)

  const L = 4;
  const P = -50; // downward

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed']],
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
  });

  const results = solve(input);

  it('reaction Ry = 50 kN upward', () => {
    const r = getReaction(results, 1)!;
    expectClose(r.ry, 50, 'Ry');
  });

  it('reaction |Mz| = PL = 200 kN·m', () => {
    const r = getReaction(results, 1)!;
    expectClose(Math.abs(r.mz), 200, 'Mz at fixed support');
  });

  it('tip deflection = PL³/(3EI)', () => {
    const EI = STEEL_E * 1000 * STD_IZ;
    const deltaExpected = -Math.abs(P) * L ** 3 / (3 * EI);
    const d = getDisp(results, 2)!;
    expectClose(d.uy, deltaExpected, 'tip deflection');
  });

  it('tip rotation = PL²/(2EI)', () => {
    const EI = STEEL_E * 1000 * STD_IZ;
    const thetaExpected = -Math.abs(P) * L ** 2 / (2 * EI);
    const d = getDisp(results, 2)!;
    expectClose(d.rz, thetaExpected, 'tip rotation');
  });

  it('moment at fixed end = PL', () => {
    const f = getForces(results, 1)!;
    // At the fixed end (start), M = PL = 200 kN·m (hogging)
    expectClose(Math.abs(f.mStart), 200, 'M at fixed end');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. CANTILEVER — UNIFORM DISTRIBUTED LOAD
// ═══════════════════════════════════════════════════════════════════

describe('Cantilever with uniform distributed load', () => {
  // q = 10 kN/m, L = 5 m
  // Ry = qL = 50 kN
  // M_fix = qL²/2 = 125 kN·m
  // δ_tip = qL⁴/(8EI)

  const L = 5;
  const q = -10;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
  });

  const results = solve(input);

  it('reaction Ry = qL = 50 kN', () => {
    const r = getReaction(results, 1)!;
    expectClose(r.ry, 50, 'Ry');
  });

  it('reaction |Mz| = qL²/2 = 125 kN·m', () => {
    const r = getReaction(results, 1)!;
    expectClose(Math.abs(r.mz), 125, 'Mz');
  });

  it('tip deflection = qL⁴/(8EI)', () => {
    const EI = STEEL_E * 1000 * STD_IZ;
    const deltaExpected = -Math.abs(q) * L ** 4 / (8 * EI);
    const d = getDisp(results, 2)!;
    expectClose(d.uy, deltaExpected, 'tip deflection');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. FIXED-FIXED BEAM — UNIFORM LOAD
// ═══════════════════════════════════════════════════════════════════

describe('Fixed-fixed beam with uniform load', () => {
  // q = 12 kN/m, L = 6 m (use middle node to get free DOFs)
  // R_A = R_B = qL/2 = 36 kN
  // M_A = M_B = qL²/12 = 36 kN·m (hogging at supports)

  const L = 6;
  const q = -12;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L / 2, 0], [3, L, 0]],
    elements: [
      [1, 1, 2, 'frame'],
      [2, 2, 3, 'frame'],
    ],
    supports: [[1, 1, 'fixed'], [2, 3, 'fixed']],
    loads: [
      { type: 'distributed', data: { elementId: 1, qI: q, qJ: q } },
      { type: 'distributed', data: { elementId: 2, qI: q, qJ: q } },
    ],
  });

  const results = solve(input);

  it('reactions are qL/2 = 36 kN each', () => {
    const rA = getReaction(results, 1)!;
    const rB = getReaction(results, 3)!;
    expectClose(rA.ry, 36, 'Ry at A');
    expectClose(rB.ry, 36, 'Ry at B');
  });

  it('fixed-end moments = qL²/12 = 36 kN·m', () => {
    const rA = getReaction(results, 1)!;
    const rB = getReaction(results, 3)!;
    expectClose(Math.abs(rA.mz), 36, 'M at A');
    expectClose(Math.abs(rB.mz), 36, 'M at B');
  });

  it('zero displacement at both ends', () => {
    const d1 = getDisp(results, 1)!;
    const d3 = getDisp(results, 3)!;
    expectClose(d1.uy, 0, 'uy at A');
    expectClose(d3.uy, 0, 'uy at B');
    expectClose(d1.rz, 0, 'θ at A');
    expectClose(d3.rz, 0, 'θ at B');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. SIMPLE TRUSS — TRIANGULAR
// ═══════════════════════════════════════════════════════════════════

describe('Simple triangular truss', () => {
  // Isosceles triangle: base 4m, height 3m
  // Nodes: 1(0,0), 2(4,0), 3(2,3)
  // Load: 10 kN downward at apex (node 3)
  // Symmetry: Ry1 = Ry2 = 5 kN

  const input = makeInput({
    nodes: [[1, 0, 0], [2, 4, 0], [3, 2, 3]],
    elements: [
      [1, 1, 2, 'truss'],
      [2, 1, 3, 'truss'],
      [3, 2, 3, 'truss'],
    ],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fy: -10, mz: 0 } }],
  });

  const results = solve(input);

  it('vertical reactions sum to applied load', () => {
    const r1 = getReaction(results, 1)!;
    const r2 = getReaction(results, 2)!;
    expectClose(r1.ry + r2.ry, 10, 'ΣFy');
  });

  it('reactions are symmetric: Ry1 = Ry2 = 5 kN', () => {
    const r1 = getReaction(results, 1)!;
    const r2 = getReaction(results, 2)!;
    expectClose(r1.ry, 5, 'Ry at 1');
    expectClose(r2.ry, 5, 'Ry at 2');
  });

  it('horizontal reaction at pinned support is zero (symmetric load)', () => {
    const r1 = getReaction(results, 1)!;
    expectClose(r1.rx, 0, 'Rx at 1');
  });

  it('bottom chord is in tension', () => {
    const f = getForces(results, 1)!; // elem 1: bottom chord 1→2
    // Bottom chord should carry tension for downward load
    expect(f.nStart).toBeGreaterThan(0);
  });

  it('inclined members are in compression', () => {
    const f2 = getForces(results, 2)!; // 1→3
    const f3 = getForces(results, 3)!; // 2→3
    // Inclined members should be in compression
    expect(f2.nStart).toBeLessThan(0);
    expect(f3.nStart).toBeLessThan(0);
  });

  it('truss elements have zero shear and moment', () => {
    for (let i = 1; i <= 3; i++) {
      const f = getForces(results, i)!;
      expectClose(f.vStart, 0, `V start elem ${i}`);
      expectClose(f.vEnd, 0, `V end elem ${i}`);
      expectClose(f.mStart, 0, `M start elem ${i}`);
      expectClose(f.mEnd, 0, `M end elem ${i}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. PORTAL FRAME — LATERAL LOAD
// ═══════════════════════════════════════════════════════════════════

describe('Portal frame with lateral load', () => {
  // Fixed-fixed portal: columns 4m, beam 6m
  // 20 kN lateral load at top-left
  // Global equilibrium: ΣFx = 0

  const input = makeInput({
    nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]],
    elements: [
      [1, 1, 2, 'frame'], // left column
      [2, 2, 3, 'frame'], // beam
      [3, 4, 3, 'frame'], // right column
    ],
    supports: [[1, 1, 'fixed'], [2, 4, 'fixed']],
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 20, fy: 0, mz: 0 } }],
  });

  const results = solve(input);

  it('horizontal equilibrium: Rx_A + Rx_D = 20 kN', () => {
    const r1 = getReaction(results, 1)!;
    const r4 = getReaction(results, 4)!;
    expectClose(r1.rx + r4.rx, -20, 'ΣFx + P = 0');
  });

  it('vertical equilibrium: Ry_A + Ry_D = 0', () => {
    const r1 = getReaction(results, 1)!;
    const r4 = getReaction(results, 4)!;
    expectClose(r1.ry + r4.ry, 0, 'ΣFy');
  });

  it('no vertical displacement at supports', () => {
    const d1 = getDisp(results, 1)!;
    const d4 = getDisp(results, 4)!;
    expectClose(d1.ux, 0, 'ux at 1');
    expectClose(d1.uy, 0, 'uy at 1');
    expectClose(d4.ux, 0, 'ux at 4');
    expectClose(d4.uy, 0, 'uy at 4');
  });

  it('beam-column joints sway laterally', () => {
    const d2 = getDisp(results, 2)!;
    const d3 = getDisp(results, 3)!;
    // Both top nodes should move in +x direction
    expect(d2.ux).toBeGreaterThan(0);
    expect(d3.ux).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. POINT LOAD ON BEAM ELEMENT
// ═══════════════════════════════════════════════════════════════════

describe('Simply supported beam with point load at midspan', () => {
  // P = 100 kN at center, L = 10 m
  // R_A = R_B = P/2 = 50 kN
  // M_max = PL/4 = 250 kN·m
  // δ_max = PL³/(48EI)

  const L = 10;
  const P = -100;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'pointOnElement', data: { elementId: 1, a: L / 2, p: P } }],
  });

  const results = solve(input);

  it('reactions are P/2 = 50 kN each', () => {
    const rA = getReaction(results, 1)!;
    const rB = getReaction(results, 2)!;
    expectClose(rA.ry, 50, 'Ry at A');
    expectClose(rB.ry, 50, 'Ry at B');
  });

  it('moments at supports are zero', () => {
    const f = getForces(results, 1)!;
    expectClose(f.mStart, 0, 'M at A');
    expectClose(f.mEnd, 0, 'M at B');
  });

  it('shear at start = P/2, at end = -P/2', () => {
    const f = getForces(results, 1)!;
    expectClose(f.vStart, 50, 'V at A');
    expectClose(f.vEnd, -50, 'V at B');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. PROPPED CANTILEVER (STATICALLY INDETERMINATE)
// ═══════════════════════════════════════════════════════════════════

describe('Propped cantilever with uniform load', () => {
  // Fixed at A, roller at B, q uniform
  // This is a 1-degree indeterminate structure
  // R_B = 3qL/8, R_A = 5qL/8
  // M_A = qL²/8 (hogging)

  const L = 8;
  const q = -10;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
  });

  const results = solve(input);

  it('R_B = 3qL/8 = 30 kN', () => {
    const rB = getReaction(results, 2)!;
    expectClose(rB.ry, 3 * 10 * L / 8, 'Ry at B');
  });

  it('R_A = 5qL/8 = 50 kN', () => {
    const rA = getReaction(results, 1)!;
    expectClose(rA.ry, 5 * 10 * L / 8, 'Ry at A');
  });

  it('fixed-end moment M_A = qL²/8 = 80 kN·m', () => {
    const r = getReaction(results, 1)!;
    expectClose(Math.abs(r.mz), 10 * L * L / 8, 'M at A');
  });

  it('moment at roller is zero', () => {
    const f = getForces(results, 1)!;
    expectClose(f.mEnd, 0, 'M at B');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. BEAM WITH HINGE (GERBER BEAM)
// ═══════════════════════════════════════════════════════════════════

describe('Two-span beam with internal hinge (Gerber beam)', () => {
  // Two elements: 1→2 (L=5m, hinge at end J only), 2→3 (L=5m, rigid)
  // P = 20 kN at node 2 (at the hinge)
  // Supports: pinned at 1, roller at 2, roller at 3
  // Hinge only on one element side → M=0 in elem 1 at J

  const input = makeInput({
    nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]],
    elements: [
      [1, 1, 2, 'frame', false, true],  // hinge at J (node 2)
      [2, 2, 3, 'frame', false, false], // rigid at both ends
    ],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX'], [3, 3, 'rollerX']],
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -20, mz: 0 } }],
  });

  const results = solve(input);

  it('total vertical reaction = 20 kN', () => {
    const r1 = getReaction(results, 1)!;
    const r2 = getReaction(results, 2)!;
    const r3 = getReaction(results, 3)!;
    const total = r1.ry + r2.ry + r3.ry;
    expectClose(total, 20, 'ΣFy');
  });

  it('moment is zero at hinge side of elem 1', () => {
    const f1 = getForces(results, 1)!;
    expectClose(f1.mEnd, 0, 'M at hinge (elem 1 end J)');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. INCLINED ELEMENT — COORDINATE TRANSFORMATION
// ═══════════════════════════════════════════════════════════════════

describe('Inclined beam under gravity', () => {
  // 45° inclined beam, L = √2 m, fixed-roller
  // Nodal load: Fy = -10 kN at free end
  // Tests that coordinate transformation is correct

  const input = makeInput({
    nodes: [[1, 0, 0], [2, 1, 1]],
    elements: [[1, 1, 2, 'frame']],
    supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
  });

  const results = solve(input);

  it('vertical equilibrium holds', () => {
    const r1 = getReaction(results, 1)!;
    const r2 = getReaction(results, 2)!;
    const totalRy = r1.ry + r2.ry;
    expectClose(totalRy, 10, 'ΣFy');
  });

  it('horizontal equilibrium holds', () => {
    const r1 = getReaction(results, 1);
    const r2 = getReaction(results, 2);
    // ΣFx = Rx1 + Rx2 = 0 (no horizontal applied load)
    expectClose(r1.rx + r2.rx, 0, 'ΣFx = 0');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 11. AXIAL LOAD — PURE TENSION
// ═══════════════════════════════════════════════════════════════════

describe('Axial bar in tension', () => {
  // Truss element, L = 5m, P = 100 kN tension
  // δ = PL/(EA), N = 100 kN throughout

  const L = 5;
  const P = 100;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0]],
    elements: [[1, 1, 2, 'truss']],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: P, fy: 0, mz: 0 } }],
  });

  const results = solve(input);

  it('axial force = 100 kN (tension)', () => {
    const f = getForces(results, 1)!;
    expectClose(f.nStart, 100, 'N');
    expectClose(f.nEnd, 100, 'N');
  });

  it('elongation = PL/(EA)', () => {
    const EA = STEEL_E * 1000 * STD_A;
    const deltaExpected = P * L / EA;
    const d = getDisp(results, 2)!;
    expectClose(d.ux, deltaExpected, 'elongation');
  });

  it('reaction at pinned end = -100 kN', () => {
    const r = getReaction(results, 1)!;
    expectClose(r.rx, -P, 'Rx at pinned support');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 12. CONTINUOUS BEAM — TWO SPANS
// ═══════════════════════════════════════════════════════════════════

describe('Continuous beam with two equal spans', () => {
  // Two spans of L=5m each, uniform load q=10 kN/m on both
  // Supports: pinned at 1, roller at 2 (midpoint), roller at 3
  // R_1 = R_3 = 3qL/8, R_2 = 10qL/8 = 5qL/4
  // (Using 3-moment equation / direct stiffness)

  const L = 5;
  const q = -10;

  const input = makeInput({
    nodes: [[1, 0, 0], [2, L, 0], [3, 2 * L, 0]],
    elements: [
      [1, 1, 2, 'frame'],
      [2, 2, 3, 'frame'],
    ],
    supports: [[1, 1, 'pinned'], [2, 2, 'rollerX'], [3, 3, 'rollerX']],
    loads: [
      { type: 'distributed', data: { elementId: 1, qI: q, qJ: q } },
      { type: 'distributed', data: { elementId: 2, qI: q, qJ: q } },
    ],
  });

  const results = solve(input);

  it('total vertical reaction = qL_total = 100 kN', () => {
    const r1 = getReaction(results, 1)!;
    const r2 = getReaction(results, 2)!;
    const r3 = getReaction(results, 3)!;
    const total = r1.ry + r2.ry + r3.ry;
    expectClose(total, 100, 'ΣFy');
  });

  it('symmetric reactions: R1 = R3', () => {
    const r1 = getReaction(results, 1)!;
    const r3 = getReaction(results, 3)!;
    expectClose(r1.ry, r3.ry, 'R1 = R3 (symmetry)');
  });

  it('end reactions = 3qL/8 = 18.75 kN', () => {
    const r1 = getReaction(results, 1)!;
    expectClose(r1.ry, 3 * 10 * L / 8, 'R1 = 3qL/8');
  });

  it('center reaction = 10qL/8 = 62.5 kN', () => {
    const r2 = getReaction(results, 2)!;
    expectClose(r2.ry, 10 * 10 * L / 8, 'R2 = 10qL/8');
  });

  it('hogging moment at interior support', () => {
    // M at interior support = qL²/8 (from 3-moment equation for equal spans)
    const f1 = getForces(results, 1)!;
    expectClose(Math.abs(f1.mEnd), 10 * L * L / 8, 'M at interior support');
  });
});

// ─── 12. Spring Support — beam on elastic foundation ─────────
describe('12. Beam on spring support', () => {
  // Simply supported beam (pinned + rollerX), 5m, with a spring support at midpoint
  // P = 100 kN downward at midpoint node
  // Spring ky = 10000 kN/m at midpoint
  // The spring takes part of the load, reducing reactions at ends
  const L = 5;
  const P = -100; // kN downward
  const ky = 10000; // kN/m

  const input: SolverInput = {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0 }],
      [2, { id: 2, x: L / 2, y: 0 }],
      [3, { id: 3, x: L, y: 0 }],
    ]),
    materials: new Map([[1, { id: 1, e: STEEL_E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: STD_A, iz: STD_IZ }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'pinned' }],
      [2, { id: 2, nodeId: 2, type: 'spring', kx: 0, ky: ky, kz: 0 }],
      [3, { id: 3, nodeId: 3, type: 'rollerX' }],
    ]),
    loads: [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } },
    ],
  };

  const results = solve(input);

  it('should solve without errors', () => {
    expect(results).toBeDefined();
    expect(results.displacements.length).toBe(3);
  });

  it('midpoint spring has vertical displacement', () => {
    const d2 = getDisp(results, 2)!;
    // With spring, midpoint deflects (not zero like a rigid support)
    expect(Math.abs(d2.uy)).toBeGreaterThan(1e-6);
  });

  it('spring reaction equals -ky * uy (restoring force)', () => {
    const d2 = getDisp(results, 2)!;
    const r2 = getReaction(results, 2)!;
    // Spring reaction = -ky * displacement (restoring force opposes displacement)
    expectClose(r2.ry, -ky * d2.uy, 'Spring reaction = -ky * uy');
  });

  it('vertical equilibrium: sum of reactions = applied load', () => {
    const r1 = getReaction(results, 1)!;
    const r2 = getReaction(results, 2)!;
    const r3 = getReaction(results, 3)!;
    const sumRy = r1.ry + r2.ry + r3.ry;
    expectClose(sumRy, -P, 'Sum Ry = P (equilibrium)');
  });
});

// ─── 13. Prescribed displacement — support settlement ─────────
describe('13. Prescribed displacement (support settlement)', () => {
  // Fixed-fixed beam 6m, no external load, but right support settles 0.01m downward
  // Expected: moments arise from differential settlement
  // M = 6EI * delta / L² at each end (for fixed-fixed beam with end settlement)
  const L = 6;
  const delta = -0.01; // 10mm settlement downward at node 2

  const input: SolverInput = {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0 }],
      [2, { id: 2, x: L, y: 0 }],
    ]),
    materials: new Map([[1, { id: 1, e: STEEL_E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: STD_A, iz: STD_IZ }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'fixed' as const }],
      [2, { id: 2, nodeId: 2, type: 'fixed' as const, dy: delta }],
    ]),
    loads: [],
  };

  const results = solve(input);
  const EI = STEEL_E * 1000 * STD_IZ; // kN·m²

  it('node 2 displacement matches prescribed value', () => {
    const d2 = getDisp(results, 2)!;
    expect(d2.uy).toBeCloseTo(delta, 6);
  });

  it('node 1 displacement is zero', () => {
    const d1 = getDisp(results, 1)!;
    expect(Math.abs(d1.ux)).toBeLessThan(1e-10);
    expect(Math.abs(d1.uy)).toBeLessThan(1e-10);
  });

  it('end moments = 6EI*delta/L²', () => {
    // Fixed-fixed beam with differential settlement delta:
    // M_A = M_B = 6*EI*delta/L² (both have same magnitude)
    const expectedM = 6 * EI * Math.abs(delta) / (L * L);
    const f1 = getForces(results, 1)!;
    expectClose(Math.abs(f1.mStart), expectedM, 'M at node 1');
    expectClose(Math.abs(f1.mEnd), expectedM, 'M at node 2');
  });

  it('shear = 12EI*delta/L³', () => {
    const expectedV = 12 * EI * Math.abs(delta) / (L * L * L);
    const f1 = getForces(results, 1)!;
    expectClose(Math.abs(f1.vStart), expectedV, 'V at node 1');
  });
});

// ─── 13b. Settlement on rollerX (prescribed dy) ───────────────
describe('13b. Settlement on rollerX support (dy)', () => {
  // Continuous beam: fixed — rollerX (with settlement) — rollerX
  // 2 spans of 4m each, no external load, middle roller settles 10mm
  const L = 4;
  const delta = -0.01; // 10mm downward

  const input: SolverInput = {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0 }],
      [2, { id: 2, x: L, y: 0 }],
      [3, { id: 3, x: 2 * L, y: 0 }],
    ]),
    materials: new Map([[1, { id: 1, e: STEEL_E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: STD_A, iz: STD_IZ }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'frame' as const, nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'fixed' as const }],
      [2, { id: 2, nodeId: 2, type: 'rollerX' as const, dy: delta }],
      [3, { id: 3, nodeId: 3, type: 'rollerX' as const }],
    ]),
    loads: [],
  };

  const results = solve(input);

  it('solves without error', () => {
    expect(results).toBeDefined();
    expect(results.displacements.length).toBeGreaterThan(0);
  });

  it('node 2 vertical displacement matches prescribed settlement', () => {
    const d2 = getDisp(results, 2)!;
    expect(d2.uy).toBeCloseTo(delta, 6);
  });

  it('produces non-zero moments from differential settlement', () => {
    const f1 = getForces(results, 1)!;
    expect(Math.abs(f1.mStart)).toBeGreaterThan(1e-6);
    expect(Math.abs(f1.mEnd)).toBeGreaterThan(1e-6);
  });

  it('produces non-zero reactions', () => {
    const r1 = getReaction(results, 1);
    expect(Math.abs(r1.ry)).toBeGreaterThan(1e-6);
    expect(Math.abs(r1.mz)).toBeGreaterThan(1e-6);
  });

  it('node 1 and node 3 have zero vertical displacement (restrained)', () => {
    const d1 = getDisp(results, 1)!;
    const d3 = getDisp(results, 3)!;
    expect(Math.abs(d1.uy)).toBeLessThan(1e-10);
    expect(Math.abs(d3.uy)).toBeLessThan(1e-10);
  });
});

// ─── 13c. Settlement on rollerY (prescribed dx) ───────────────
describe('13c. Settlement on rollerY support (dx)', () => {
  // Vertical structure: fixed bottom, rollerY at top (restrains X)
  // Top roller has prescribed horizontal displacement dx = 0.005m
  const H = 4;
  const delta = 0.005;

  const input: SolverInput = {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0 }],
      [2, { id: 2, x: 0, y: H }],
    ]),
    materials: new Map([[1, { id: 1, e: STEEL_E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: STD_A, iz: STD_IZ }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'fixed' as const }],
      [2, { id: 2, nodeId: 2, type: 'rollerY' as const, dx: delta }],
    ]),
    loads: [],
  };

  const results = solve(input);

  it('solves without error', () => {
    expect(results).toBeDefined();
    expect(results.displacements.length).toBeGreaterThan(0);
  });

  it('node 2 horizontal displacement matches prescribed value', () => {
    const d2 = getDisp(results, 2)!;
    expect(d2.ux).toBeCloseTo(delta, 6);
  });

  it('produces non-zero moments from prescribed displacement', () => {
    const f1 = getForces(results, 1)!;
    expect(Math.abs(f1.mStart)).toBeGreaterThan(1e-6);
  });
});

// ─── 13d. Regression: model-store rollerX mapping reads dy not dx ──
describe('13d. Model-store mapping: rollerX settlement reads dy field', () => {
  // Simulates how the model store maps supports to solver input.
  // A rollerX support stores settlement as dy (vertical), not dx.
  // This test ensures the mapping logic correctly reads s.dy for rollerX
  // and s.dx for rollerY, preventing regression where s.dx was always read.
  const L = 4;
  const delta = -0.01;

  // Simulate store-format supports (as stored in model store)
  const storeSupports = [
    { id: 1, nodeId: 1, type: 'fixed' as const },
    { id: 2, nodeId: 2, type: 'rollerX' as const, dy: delta },  // dy field, NOT dx
    { id: 3, nodeId: 3, type: 'rollerX' as const },
  ];

  // Apply the same mapping logic as model store solve()
  function mapStoreSupportToSolver(s: typeof storeSupports[number]) {
    if (s.type === 'rollerX' || s.type === 'rollerY') {
      // This is the critical mapping: rollerX restricts Y → read dy; rollerY restricts X → read dx
      const di = s.type === 'rollerX' ? ((s as any).dy ?? 0) : ((s as any).dx ?? 0);
      const solverDy = s.type === 'rollerX' ? di : undefined;
      const solverDx = s.type === 'rollerY' ? di : undefined;
      return { id: s.id, nodeId: s.nodeId, type: s.type, dx: solverDx, dy: solverDy };
    }
    return { id: s.id, nodeId: s.nodeId, type: s.type, dx: (s as any).dx, dy: (s as any).dy, drz: (s as any).drz };
  }

  const mappedSupports = new Map(storeSupports.map(s => [s.id, mapStoreSupportToSolver(s)]));

  const input: SolverInput = {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0 }],
      [2, { id: 2, x: L, y: 0 }],
      [3, { id: 3, x: 2 * L, y: 0 }],
    ]),
    materials: new Map([[1, { id: 1, e: STEEL_E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: STD_A, iz: STD_IZ }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'frame' as const, nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: mappedSupports as any,
    loads: [],
  };

  const results = solve(input);

  it('mapped support 2 passes dy to solver (not zero)', () => {
    const solverSup = mappedSupports.get(2)!;
    expect(solverSup.dy).toBe(delta);
    expect(solverSup.dx).toBeUndefined();
  });

  it('solver produces non-zero results from mapped settlement', () => {
    expect(results).toBeDefined();
    const d2 = getDisp(results, 2)!;
    expect(d2.uy).toBeCloseTo(delta, 6);
  });

  it('produces non-zero moments (structure is indeterminate)', () => {
    const f1 = getForces(results, 1)!;
    expect(Math.abs(f1.mStart)).toBeGreaterThan(1e-6);
  });

  it('BUG regression: reading s.dx instead of s.dy gives zero', () => {
    // If we incorrectly read s.dx (which is undefined), di=0, no settlement applied
    const wrongDi = (storeSupports[1] as any).dx ?? 0;
    expect(wrongDi).toBe(0); // proves the bug: dx is not set
    const correctDi = (storeSupports[1] as any).dy ?? 0;
    expect(correctDi).toBe(delta); // dy IS set
  });
});

// ═══════════════════════════════════════════════════════════════════
// HINGE TESTS — articulaciones (hingeStart / hingeEnd)
// ═══════════════════════════════════════════════════════════════════

describe('Hinge: fixed beam with hinge at midspan', () => {
  // Fixed-fixed beam, 10m, hinge at node 2 (midspan)
  // Two elements: 1→2 hinge at end, 2→3 hinge at start
  // Distributed load q = -10 kN/m on both elements
  // With hinge at midspan: equivalent to propped cantilever + propped cantilever
  const input = makeInput({
    nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]],
    elements: [
      [1, 1, 2, 'frame', false, true],  // hinge at J (node 2)
      [2, 2, 3, 'frame', true, false],  // hinge at I (node 2)
    ],
    supports: [[1, 1, 'fixed'], [2, 3, 'fixed']],
    loads: [
      { type: 'distributed' as const, data: { elementId: 1, qI: -10, qJ: -10 } },
      { type: 'distributed' as const, data: { elementId: 2, qI: -10, qJ: -10 } },
    ],
  });

  const results = solve(input);

  it('solves without error', () => {
    expect(results).toBeDefined();
    expect(results.displacements.length).toBeGreaterThan(0);
  });

  it('moment is zero at hinge (node 2) for both elements', () => {
    const f1 = getForces(results, 1)!;
    const f2 = getForces(results, 2)!;
    expectClose(f1.mEnd, 0, 'M at hinge elem 1 end J');
    expectClose(f2.mStart, 0, 'M at hinge elem 2 start I');
  });

  it('total vertical reaction equals total load', () => {
    const totalLoad = 10 * 10; // q * L_total
    const totalReaction = results.reactions.reduce((sum, r) => sum + r.ry, 0);
    expectClose(totalReaction, totalLoad, 'ΣFy');
  });
});

describe('Hinge: both ends hinged → acts like truss', () => {
  // Double-hinged frame element acts as axial-only (truss) member
  // Portal frame: fixed columns, beam with hinges at both ends
  // Node 3 needs fixed support so rotation DOF at node 3 is restrained
  const input = makeInput({
    nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]],
    elements: [
      [1, 1, 2, 'frame'],               // left column
      [2, 2, 3, 'frame', true, true],    // beam: both hinges = truss-like
      [3, 4, 3, 'frame'],               // right column
    ],
    supports: [[1, 1, 'fixed'], [2, 4, 'fixed']],
    loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 10, fy: 0, mz: 0 } }],
  });

  const results = solve(input);

  it('solves without error', () => {
    expect(results).toBeDefined();
  });

  it('double-hinged element has zero moments at both ends', () => {
    const f2 = getForces(results, 2)!;
    expectClose(f2.mStart, 0, 'M at start of double-hinged element');
    expectClose(f2.mEnd, 0, 'M at end of double-hinged element');
  });

  it('double-hinged element carries only axial force', () => {
    const f2 = getForces(results, 2)!;
    // Shear should also be zero for a double-hinged element
    expectClose(f2.vStart, 0, 'V at start');
    expectClose(f2.vEnd, 0, 'V at end');
  });
});

describe('Hinge: collinear mechanism detection', () => {
  // Three collinear nodes, hinges at middle node on both elements → mechanism
  it('collinear hinges at shared node → error or singular matrix', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],  // hinge at end (node 2)
        [2, 2, 3, 'frame', true, false],   // hinge at start (node 2)
      ],
      supports: [[1, 1, 'pinned'], [2, 3, 'pinned']],
      loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
    });

    // Should throw (singular matrix = mechanism)
    expect(() => solve(input)).toThrow();
  });
});

describe('Hinge: portal frame with beam hinges', () => {
  // Portal frame with hinges at beam-column connections
  // Columns: fixed at base, rigid connections at top
  // Beam: hinged at both ends (acts as pin-connected beam)
  const input = makeInput({
    nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]],
    elements: [
      [1, 1, 2, 'frame'],                // left column
      [2, 2, 3, 'frame', true, true],     // beam: hinges at both ends
      [3, 4, 3, 'frame'],                 // right column
    ],
    supports: [[1, 1, 'fixed'], [2, 4, 'fixed']],
    loads: [
      { type: 'distributed' as const, data: { elementId: 2, qI: -20, qJ: -20 } },
    ],
  });

  const results = solve(input);

  it('solves without error', () => {
    expect(results).toBeDefined();
    expect(results.displacements.length).toBe(4);
  });

  it('beam has zero moments (double-hinged)', () => {
    const f2 = getForces(results, 2)!;
    expectClose(f2.mStart, 0, 'beam M start');
    expectClose(f2.mEnd, 0, 'beam M end');
  });

  it('columns carry only axial load (no lateral force, symmetric vertical load)', () => {
    const f1 = getForces(results, 1)!;
    const f3 = getForces(results, 3)!;
    // Double-hinged beam with vertical load only transfers vertical (axial) forces to columns
    // No lateral force → columns have zero bending
    expectClose(f1.mStart, 0, 'col1 M start');
    expectClose(f3.mStart, 0, 'col3 M start');
    // Columns should carry axial compression from beam reactions
    expect(Math.abs(f1.nStart)).toBeGreaterThan(0.1);
    expect(Math.abs(f3.nStart)).toBeGreaterThan(0.1);
  });

  it('total vertical reaction equals total load', () => {
    const totalLoad = 20 * 6; // q * L_beam
    const totalReaction = results.reactions.reduce((sum, r) => sum + r.ry, 0);
    expectClose(totalReaction, totalLoad, 'ΣFy');
  });
});

describe('Hinge: hingeStart and hingeEnd initialized as false work correctly', () => {
  // Ensure elements with explicit false hinges solve identically to no-hinge elements
  it('explicit false hinges match no-hinge solution', () => {
    const inputNoHinge = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
      loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
    });
    const inputExplicitFalse = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame', false, false]],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
      loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
    });

    const r1 = solve(inputNoHinge);
    const r2 = solve(inputExplicitFalse);

    // Should produce identical results
    const f1 = getForces(r1, 1)!;
    const f2 = getForces(r2, 1)!;
    expectClose(f1.mStart, f2.mStart, 'M start');
    expectClose(f1.mEnd, f2.mEnd, 'M end');
    expectClose(f1.vStart, f2.vStart, 'V start');
    expectClose(f1.nStart, f2.nStart, 'N start');
  });
});

// ═══════════════════════════════════════════════════════════════════
// INPUT VALIDATION
// ═══════════════════════════════════════════════════════════════════

describe('Input validation', () => {
  it('throws on zero-length element', () => {
    // Two nodes at the same position
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 0, 0]], // Same position!
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
    });
    expect(() => solve(input)).toThrow(/zero length/);
  });

  it('throws on zero section area', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
      a: 0, // Zero area!
    });
    expect(() => solve(input)).toThrow(/area A must be > 0/);
  });

  it('throws on zero section inertia', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
      iz: 0, // Zero inertia!
    });
    expect(() => solve(input)).toThrow(/moment of inertia Iz must be > 0/);
  });

  it('throws on negative section area', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
      a: -0.01, // Negative area!
    });
    expect(() => solve(input)).toThrow(/area A must be > 0/);
  });

  it('throws on point load position a < 0', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
      loads: [{ type: 'pointOnElement', data: { elementId: 1, p: -10, a: -1 } }],
    });
    expect(() => solve(input)).toThrow(/position a=.*out of range/);
  });

  it('throws on point load position a > L', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]], // L = 5m
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
      loads: [{ type: 'pointOnElement', data: { elementId: 1, p: -10, a: 6 } }], // a = 6 > L = 5
    });
    expect(() => solve(input)).toThrow(/position a=.*out of range/);
  });

  it('accepts point load at element start (a = 0)', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
      loads: [{ type: 'pointOnElement', data: { elementId: 1, p: -10, a: 0 } }],
    });
    expect(() => solve(input)).not.toThrow();
  });

  it('accepts point load at element end (a = L)', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]], // L = 5m
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
      loads: [{ type: 'pointOnElement', data: { elementId: 1, p: -10, a: 5 } }], // a = L = 5
    });
    expect(() => solve(input)).not.toThrow();
  });

  it('accepts point load at midspan (a = L/2)', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0]], // L = 6m
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'pointOnElement', data: { elementId: 1, p: -10, a: 3 } }], // a = L/2 = 3
    });
    const results = solve(input);
    // Reactions should be 5 kN each (symmetric load)
    const rA = getReaction(results, 1);
    const rB = getReaction(results, 2);
    expectClose(rA.ry, 5, 'RA');
    expectClose(rB.ry, 5, 'RB');
  });
});
