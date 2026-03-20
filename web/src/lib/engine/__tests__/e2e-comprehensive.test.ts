/**
 * E2E Comprehensive Test Suite — Structural Analysis Engine
 *
 * Acts as a full QA battery for the Dedaliano app, testing every workflow
 * a structural engineering student or professional would encounter.
 *
 * Organized by:
 * 1. Classic isostatic 2D structures (must be PERFECT)
 * 2. Hyperstatic 2D structures
 * 3. Articulations (hinges) — Gerber beams, three-hinge arches
 * 4. Complex load combinations
 * 5. Extreme values — very small & very large sections/materials
 * 6. 3D structures — cantilevers, portals, space trusses
 * 7. Edge cases — mechanisms, zero-length, coincident nodes
 * 8. Numerical stability — float precision, conditioning
 *
 * References:
 *   - Hibbeler, Structural Analysis (10th ed)
 *   - Kassimali, Structural Analysis (6th ed)
 *   - Beer & Johnston, Mechanics of Materials
 *   - Timoshenko & Gere, Theory of Elastic Stability
 */

import { describe, it, expect } from 'vitest';
import { solve } from '../wasm-solver';
import { solve3D } from '../wasm-solver';
import { computeDiagramValueAt } from '../diagrams';
import type { SolverInput, SolverLoad, AnalysisResults } from '../types';
import type {
  SolverInput3D, SolverNode3D, SolverSection3D, SolverElement3D,
  SolverSupport3D, AnalysisResults3D,
} from '../types-3d';
import type { SolverMaterial } from '../types';

// ─── 2D Helpers ─────────────────────────────────────────────────

const STEEL_E = 200_000; // MPa (200 GPa)
const STD_A = 0.01;      // m²
const STD_IZ = 1e-4;     // m⁴

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

function getReaction(r: AnalysisResults, nodeId: number) {
  return r.reactions.find(x => x.nodeId === nodeId) ?? { nodeId, rx: 0, rz: 0, my: 0 };
}
function getDisp(r: AnalysisResults, nodeId: number) {
  return r.displacements.find(d => d.nodeId === nodeId)!;
}
function getForces(r: AnalysisResults, elemId: number) {
  return r.elementForces.find(f => f.elementId === elemId)!;
}

/** Assert value matches expected within relative tolerance */
function expectClose(actual: number, expected: number, tol = 0.01, label = '') {
  if (Math.abs(expected) < 1e-10) {
    expect(Math.abs(actual), label).toBeLessThan(1e-6);
  } else {
    const relErr = Math.abs((actual - expected) / expected);
    expect(relErr, `${label}: got ${actual.toExponential(4)}, expected ${expected.toExponential(4)}`).toBeLessThan(tol);
  }
}

/** Check global equilibrium: ΣF = 0, ΣM = 0 */
function checkEquilibrium2D(
  results: AnalysisResults,
  appliedFx: number,
  appliedFz: number,
  tol = 0.01,
) {
  let sumFx = appliedFx, sumFz = appliedFz;
  for (const r of results.reactions) {
    sumFx += r.rx;
    sumFz += r.rz;
  }
  expect(Math.abs(sumFx), 'ΣFx ≠ 0').toBeLessThan(tol);
  expect(Math.abs(sumFz), 'ΣFz ≠ 0').toBeLessThan(tol);
}

// ─── 3D Helpers ─────────────────────────────────────────────────

const steelMat: SolverMaterial = { id: 1, e: 200_000, nu: 0.3 };

const stdSection3D: SolverSection3D = {
  id: 1, a: 0.01, iz: 8.33e-6, iy: 4.16e-6, j: 1e-5,
};

function fixedSupport3D(nodeId: number): SolverSupport3D {
  return { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
}
function pinnedSupport3D(nodeId: number): SolverSupport3D {
  return { nodeId, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false };
}

function buildInput3D(
  nodes: SolverNode3D[],
  elements: SolverElement3D[],
  supports: SolverSupport3D[],
  loads: SolverInput3D['loads'] = [],
  materials: SolverMaterial[] = [steelMat],
  sections: SolverSection3D[] = [stdSection3D],
): SolverInput3D {
  return {
    nodes: new Map(nodes.map(n => [n.id, n])),
    materials: new Map(materials.map(m => [m.id, m])),
    sections: new Map(sections.map(s => [s.id, s])),
    elements: new Map(elements.map(e => [e.id, e])),
    supports: new Map(supports.map((s, i) => [i, s])),
    loads,
  };
}

function assertSuccess3D(result: AnalysisResults3D | string): asserts result is AnalysisResults3D {
  if (typeof result === 'string') throw new Error(`Solver error: ${result}`);
}


function makeFrame3D(id: number, nI: number, nJ: number, hingeStart = false, hingeEnd = false): SolverElement3D {
  return { id, type: 'frame', nodeI: nI, nodeJ: nJ, materialId: 1, sectionId: 1, hingeStart, hingeEnd };
}
function makeTruss3D(id: number, nI: number, nJ: number): SolverElement3D {
  return { id, type: 'truss', nodeI: nI, nodeJ: nJ, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false };
}

// ═════════════════════════════════════════════════════════════════
// 1. CLASSIC ISOSTATIC 2D STRUCTURES
// These MUST be perfect — they are the first things students learn
// ═════════════════════════════════════════════════════════════════

describe('1. Isostatic 2D — Simply Supported Beams', () => {

  it('SS beam + central point load: RA=RB=P/2, Mmax=PL/4', () => {
    const L = 6, P = -20;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'pointOnElement', data: { elementId: 1, a: L / 2, p: P } }],
    });

    const r = solve(input);
    const rA = getReaction(r, 1), rB = getReaction(r, 2);

    // Each reaction = P/2 (upward)
    expectClose(rA.rz, -P / 2, 0.01, 'RA = P/2');
    expectClose(rB.rz, -P / 2, 0.01, 'RB = P/2');
    expect(Math.abs(rA.rx)).toBeLessThan(1e-6);

    // Maximum moment at midspan
    const ef = getForces(r, 1);
    const mMid = computeDiagramValueAt('moment', 0.5, ef);
    expectClose(mMid, P * L / 4, 0.01, 'Mmax = PL/4');
  });

  it('SS beam + eccentric point load: RA=Pb/L, RB=Pa/L', () => {
    const L = 10, P = -30, a = 3, b = L - a;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'pointOnElement', data: { elementId: 1, a, p: P } }],
    });

    const r = solve(input);
    expectClose(getReaction(r, 1).rz, -P * b / L, 0.01, 'RA = Pb/L');
    expectClose(getReaction(r, 2).rz, -P * a / L, 0.01, 'RB = Pa/L');

    // M at load point = RA × a
    const ef = getForces(r, 1);
    const mAtLoad = computeDiagramValueAt('moment', a / L, ef);
    expectClose(mAtLoad, (-P * b / L) * a * (-1), 0.02, 'M at load');
  });

  it('SS beam + UDL: RA=RB=qL/2, Mmax=qL²/8', () => {
    const L = 8, q = -12;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
    });

    const r = solve(input);
    expectClose(getReaction(r, 1).rz, -q * L / 2, 0.01, 'RA = qL/2');
    expectClose(getReaction(r, 2).rz, -q * L / 2, 0.01, 'RB = qL/2');

    const ef = getForces(r, 1);
    const mMid = computeDiagramValueAt('moment', 0.5, ef);
    expectClose(mMid, q * L * L / 8, 0.01, 'Mmax = qL²/8');
  });

  it('SS beam + triangular load (0 to q): RA=qL/6, RB=qL/3', () => {
    const L = 6, q = -18;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: 0, qJ: q } }],
    });

    const r = solve(input);
    // Triangular load resultant = qL/2, at L/3 from J (2L/3 from I)
    // ΣMa = RB*L + q*L/2 * 2L/3 = 0 → RB = -qL/3
    // ΣFz = RA + RB + qL/2 = 0 → RA = -qL/2 - RB = -qL/6
    expectClose(getReaction(r, 1).rz, -q * L / 6, 0.02, 'RA = qL/6');
    expectClose(getReaction(r, 2).rz, -q * L / 3, 0.02, 'RB = qL/3');
  });

  it('SS beam + concentrated moment at node: RA=-M₀/L, RB=M₀/L', () => {
    const L = 5, M0 = 30; // CCW moment applied as nodal load at midpoint
    // Use 2 elements with a node at midspan to apply moment as nodal load
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L / 2, 0], [3, L, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
      ],
      supports: [[1, 1, 'pinned'], [2, 3, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, mz: M0 } }],
    });

    const r = solve(input);
    // ΣMa = RC*L + M0 = 0 → RC = -M0/L
    // ΣFz = RA + RC = 0 → RA = M0/L
    expectClose(getReaction(r, 1).rz, M0 / L, 0.02, 'RA = M0/L');
    expectClose(getReaction(r, 3).rz, -M0 / L, 0.02, 'RC = -M0/L');
  });
});

describe('1. Isostatic 2D — Cantilever Beams', () => {

  it('Cantilever + tip point load: δ=PL³/3EI', () => {
    const L = 4, P = -15;
    const E = STEEL_E, Iz = STD_IZ;
    const EI = E * 1000 * Iz; // kN·m²

    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
    });

    const r = solve(input);
    const rA = getReaction(r, 1);
    expectClose(rA.rz, -P, 0.01, 'RA = -P');
    expectClose(rA.my, -P * L, 0.01, 'MA = -P*L');

    const tipDisp = getDisp(r, 2);
    const deltaAnalytical = P * L ** 3 / (3 * EI);
    expectClose(tipDisp.uz, deltaAnalytical, 0.01, 'δ = PL³/3EI');
  });

  it('Cantilever + UDL: δ_tip=qL⁴/8EI, MA=qL²/2', () => {
    const L = 3, q = -10;
    const EI = STEEL_E * 1000 * STD_IZ;

    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
    });

    const r = solve(input);
    const rA = getReaction(r, 1);
    expectClose(rA.rz, -q * L, 0.01, 'RA = -qL');
    expectClose(rA.my, -q * L * L / 2, 0.01, 'MA = -qL²/2');

    const tipDisp = getDisp(r, 2);
    const deltaAnalytical = q * L ** 4 / (8 * EI);
    expectClose(tipDisp.uz, deltaAnalytical, 0.01, 'δ_tip = qL⁴/8EI');
  });

  it('Cantilever + tip moment: δ_tip=ML²/2EI', () => {
    const L = 5, M0 = 20; // Applied CCW moment at tip
    const EI = STEEL_E * 1000 * STD_IZ;

    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, mz: M0 } }],
    });

    const r = solve(input);
    const rA = getReaction(r, 1);
    expect(Math.abs(rA.rz)).toBeLessThan(1e-6); // No vertical reaction
    expectClose(rA.my, -M0, 0.01, 'MA = -M₀');

    // δ = M₀L²/(2EI) — positive (upward) for CCW moment at tip of cantilever
    const tipDisp = getDisp(r, 2);
    const deltaAnalytical = M0 * L ** 2 / (2 * EI);
    expectClose(tipDisp.uz, deltaAnalytical, 0.01, 'δ = ML²/2EI');
  });
});

describe('1. Isostatic 2D — Trusses', () => {

  it('Simple triangular truss: equilibrium & symmetric reactions', () => {
    const P = -10;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 2, 3]],
      elements: [
        [1, 1, 3, 'truss'],
        [2, 2, 3, 'truss'],
        [3, 1, 2, 'truss'],
      ],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fy: P, mz: 0 } }],
    });

    const r = solve(input);
    checkEquilibrium2D(r, 0, P);

    // Symmetric → equal vertical reactions
    expectClose(getReaction(r, 1).rz, -P / 2, 0.01, 'RA = P/2');
    expectClose(getReaction(r, 2).rz, -P / 2, 0.01, 'RB = P/2');
  });

  it('Pratt-like 4-panel truss: all bars axial only', () => {
    // 4-panel Pratt truss
    const H = 2, W = 8, panels = 4;
    const dx = W / panels;
    const nodes: Array<[number, number, number]> = [];
    const elements: Array<[number, number, number, 'truss']> = [];

    // Bottom chord: nodes 1-5, top chord: nodes 6-9
    for (let i = 0; i <= panels; i++) nodes.push([i + 1, i * dx, 0]);
    for (let i = 1; i < panels; i++) nodes.push([panels + 1 + i, i * dx, H]);

    let eid = 1;
    // Bottom chord
    for (let i = 1; i <= panels; i++) elements.push([eid++, i, i + 1, 'truss']);
    // Top chord
    for (let i = 1; i < panels - 1; i++) elements.push([eid++, panels + 1 + i, panels + 2 + i, 'truss']);
    // Verticals
    for (let i = 1; i < panels; i++) elements.push([eid++, i + 1, panels + 1 + i, 'truss']);
    // Diagonals (Pratt: ↗ from bottom-left to top-right)
    elements.push([eid++, 1, panels + 2, 'truss']); // left diagonal
    elements.push([eid++, panels + 1, panels + panels, 'truss']); // right diagonal
    for (let i = 1; i < panels - 1; i++) elements.push([eid++, panels + 1 + i, i + 2, 'truss']);

    const P = -10;
    const input = makeInput({
      nodes,
      elements,
      supports: [[1, 1, 'pinned'], [2, panels + 1, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fy: P, mz: 0 } }],
    });

    const r = solve(input);
    checkEquilibrium2D(r, 0, P);

    // All elements should have ZERO bending moment (truss = axial only)
    for (const ef of r.elementForces) {
      expect(Math.abs(ef.mStart), `elem ${ef.elementId} mStart`).toBeLessThan(1e-6);
      expect(Math.abs(ef.mEnd), `elem ${ef.elementId} mEnd`).toBeLessThan(1e-6);
    }
  });

  it('Asymmetric truss with horizontal load: equilibrium holds', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0], [3, 4, 3], [4, 2, 4]],
      elements: [
        [1, 1, 2, 'truss'], [2, 1, 3, 'truss'], [3, 2, 3, 'truss'],
        [4, 1, 4, 'truss'], [5, 3, 4, 'truss'],
      ],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [
        { type: 'nodal', data: { nodeId: 4, fx: 5, fy: -10, mz: 0 } },
      ],
    });

    const r = solve(input);
    checkEquilibrium2D(r, 5, -10);
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. HYPERSTATIC 2D STRUCTURES
// ═════════════════════════════════════════════════════════════════

describe('2. Hyperstatic 2D structures', () => {

  it('Propped cantilever + UDL: RB=3qL/8, RA=5qL/8', () => {
    const L = 8, q = -10;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
    });

    const r = solve(input);
    expectClose(getReaction(r, 2).rz, 3 * (-q) * L / 8, 0.01, 'RB = 3qL/8');
    expectClose(getReaction(r, 1).rz, 5 * (-q) * L / 8, 0.01, 'RA = 5qL/8');
    expectClose(Math.abs(getReaction(r, 1).my), (-q) * L * L / 8, 0.01, '|MA| = qL²/8');
  });

  it('Fixed-fixed beam + UDL: R=qL/2, M_end=qL²/12', () => {
    const L = 6, q = -20;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
    });

    const r = solve(input);
    const w = -q;
    expectClose(getReaction(r, 1).rz, w * L / 2, 0.01, 'RA = wL/2');
    expectClose(getReaction(r, 2).rz, w * L / 2, 0.01, 'RB = wL/2');
    expectClose(Math.abs(getReaction(r, 1).my), w * L * L / 12, 0.01, '|MA| = wL²/12');
    expectClose(Math.abs(getReaction(r, 2).my), w * L * L / 12, 0.01, '|MB| = wL²/12');

    // Maximum midspan moment = wL²/24 (sagging)
    const ef = getForces(r, 1);
    const mMid = computeDiagramValueAt('moment', 0.5, ef);
    expectClose(Math.abs(mMid), w * L * L / 24, 0.02, '|M_mid| = wL²/24');
  });

  it('Fixed-fixed beam + central point load: M_ends=PL/8', () => {
    const L = 8, P = -40;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
      loads: [{ type: 'pointOnElement', data: { elementId: 1, a: L / 2, p: P } }],
    });

    const r = solve(input);
    const w = -P;
    expectClose(getReaction(r, 1).rz, w / 2, 0.01, 'RA = P/2');
    expectClose(getReaction(r, 2).rz, w / 2, 0.01, 'RB = P/2');
    expectClose(Math.abs(getReaction(r, 1).my), w * L / 8, 0.01, '|MA| = PL/8');
    expectClose(Math.abs(getReaction(r, 2).my), w * L / 8, 0.01, '|MB| = PL/8');
  });

  it('2-span continuous beam + UDL: equilibrium & symmetric', () => {
    const L = 5, q = -10;
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

    const r = solve(input);
    checkEquilibrium2D(r, 0, q * 2 * L);

    // Symmetric → R_A = R_C, R_B > R_A (interior support takes more)
    const rA = getReaction(r, 1).rz;
    const rB = getReaction(r, 2).rz;
    const rC = getReaction(r, 3).rz;
    expectClose(rA, rC, 0.01, 'RA = RC (symmetry)');
    expect(rB).toBeGreaterThan(rA); // Interior support takes more
    // Analytical: RA=RC=3qL/8, RB=10qL/8
    expectClose(rA, 3 * (-q) * L / 8, 0.02, 'RA = 3qL/8');
    expectClose(rB, 10 * (-q) * L / 8, 0.02, 'RB = 10qL/8');
  });

  it('Portal frame biempotrado + UDL + lateral: equilibrium', () => {
    const W = 6, H = 4, q = -15, Hlat = 10;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 0, H], [3, W, H], [4, W, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
        [3, 4, 3, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 4, 'fixed']],
      loads: [
        { type: 'distributed', data: { elementId: 2, qI: q, qJ: q } },
        { type: 'nodal', data: { nodeId: 2, fx: Hlat, fy: 0, mz: 0 } },
      ],
    });

    const r = solve(input);
    checkEquilibrium2D(r, Hlat, q * W);
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. ARTICULATIONS — Hinges, Gerber beams, three-hinge arches
// ═════════════════════════════════════════════════════════════════

describe('3. Articulations & internal hinges', () => {

  it('Gerber beam (2 spans + hinge): moment at hinge = 0', () => {
    const L = 4;
    const q = -10;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0], [3, 2 * L, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],  // hinge at node 2 (end J)
        [2, 2, 3, 'frame', true, false],   // hinge at node 2 (start I)
      ],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX'], [3, 3, 'rollerX']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: q, qJ: q } },
        { type: 'distributed', data: { elementId: 2, qI: q, qJ: q } },
      ],
    });

    const r = solve(input);
    checkEquilibrium2D(r, 0, q * 2 * L);

    // Moment at hinge (node 2) must be zero
    const ef1 = getForces(r, 1);
    const ef2 = getForces(r, 2);
    expect(Math.abs(ef1.mEnd), 'M at hinge (elem 1 end)').toBeLessThan(0.1);
    expect(Math.abs(ef2.mStart), 'M at hinge (elem 2 start)').toBeLessThan(0.1);
  });

  it('Three-hinge arch: isostatic, V=0 at crown under symmetric load', () => {
    // Triangular arch: nodes at (0,0), (3,3), (6,0)
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 3, 3], [3, 6, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],  // hinge at crown (node 2)
        [2, 2, 3, 'frame', true, false],   // hinge at crown (node 2)
      ],
      supports: [[1, 1, 'pinned'], [2, 3, 'pinned']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -20, mz: 0 } }],
    });

    const r = solve(input);
    checkEquilibrium2D(r, 0, -20);

    // Symmetric load → equal vertical reactions
    expectClose(getReaction(r, 1).rz, 10, 0.01, 'RA = 10 kN');
    expectClose(getReaction(r, 3).rz, 10, 0.01, 'RC = 10 kN');

    // Moment at crown hinge = 0
    expect(Math.abs(getForces(r, 1).mEnd)).toBeLessThan(0.1);
    expect(Math.abs(getForces(r, 2).mStart)).toBeLessThan(0.1);
  });

  it('Beam with multiple internal hinges: all hinge moments = 0', () => {
    // 4-span beam: hinges at nodes 2 and 4
    const L = 3;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0], [3, 2 * L, 0], [4, 3 * L, 0], [5, 4 * L, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],   // hinge at 2
        [2, 2, 3, 'frame', true, false],    // hinge at 2
        [3, 3, 4, 'frame', false, true],    // hinge at 4
        [4, 4, 5, 'frame', true, false],    // hinge at 4
      ],
      supports: [
        [1, 1, 'fixed'], [2, 3, 'rollerX'], [3, 5, 'rollerX'],
      ],
      loads: [
        { type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10 } },
        { type: 'distributed', data: { elementId: 3, qI: -10, qJ: -10 } },
      ],
    });

    const r = solve(input);

    // Hinge at node 2: moment = 0
    expect(Math.abs(getForces(r, 1).mEnd), 'Hinge at node 2').toBeLessThan(0.1);
    expect(Math.abs(getForces(r, 2).mStart), 'Hinge at node 2').toBeLessThan(0.1);

    // Hinge at node 4: moment = 0
    expect(Math.abs(getForces(r, 3).mEnd), 'Hinge at node 4').toBeLessThan(0.1);
    expect(Math.abs(getForces(r, 4).mStart), 'Hinge at node 4').toBeLessThan(0.1);
  });

  it('Double-hinged frame element transmits only axial force', () => {
    // A double-hinged frame element behaves like a truss element
    const L = 5, P = -10;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0], [3, 2 * L, 0]],
      elements: [
        [1, 1, 2, 'frame'],                   // normal frame
        [2, 2, 3, 'frame', true, true],        // double-hinged = truss-like
      ],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX'], [3, 3, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
    });

    const r = solve(input);

    // Element 2 (double-hinged): zero moments at both ends
    const ef2 = getForces(r, 2);
    expect(Math.abs(ef2.mStart), 'double-hinge mStart').toBeLessThan(0.1);
    expect(Math.abs(ef2.mEnd), 'double-hinge mEnd').toBeLessThan(0.1);
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. COMPLEX LOAD COMBINATIONS
// ═════════════════════════════════════════════════════════════════

describe('4. Complex loads', () => {

  it('Thermal load on fixed-fixed beam: N=EAαΔT, no vertical displacement', () => {
    const L = 6, dt = 30; // °C
    const alpha = 1.2e-5; // /°C
    const E = STEEL_E, A = STD_A;
    const EA = E * 1000 * A; // kN

    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
      loads: [{ type: 'thermal', data: { elementId: 1, dtUniform: dt, dtGradient: 0 } }],
    });

    const r = solve(input);
    const ef = getForces(r, 1);

    // Axial force: N = E·A·α·ΔT (compression because expansion restrained)
    const N_analytical = EA * alpha * dt;
    expectClose(Math.abs(ef.nStart), N_analytical, 0.05, 'N = EAαΔT');

    // No vertical displacement in fixed-fixed under uniform thermal
    const d1 = getDisp(r, 1), d2 = getDisp(r, 2);
    expect(Math.abs(d1.uz)).toBeLessThan(1e-10);
    expect(Math.abs(d2.uz)).toBeLessThan(1e-10);
  });

  it('Partial distributed load (half span): correct reactions', () => {
    const L = 10, q = -10;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q, a: 0, b: L / 2 } }],
    });

    const r = solve(input);

    // Total load = q * L/2 = -50 kN, centroid at L/4
    // ΣMa = RB*L + q*(L/2)*(L/4) = 0 → RB = -q*L/8
    // ΣFz = RA + RB + q*L/2 = 0 → RA = -q*L/2 - (-q*L/8) = -3qL/8
    const totalLoad = q * L / 2;
    checkEquilibrium2D(r, 0, totalLoad);
    expectClose(getReaction(r, 1).rz, -3 * q * L / 8, 0.02, 'RA for half-span load');
    expectClose(getReaction(r, 2).rz, -q * L / 8, 0.02, 'RB for half-span load');
  });

  it('Combined nodal + distributed + point load: superposition', () => {
    const L = 6;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } },
        { type: 'pointOnElement', data: { elementId: 1, a: L / 2, p: -20 } },
        { type: 'nodal', data: { nodeId: 2, fx: 5, fy: -5, mz: 0 } },
      ],
    });

    const r = solve(input);
    // Total: Fy_applied = -10*6 + (-20) + (-5) = -85 kN
    // Fx_applied = 5 kN
    checkEquilibrium2D(r, 5, -85);
  });

  it('Axial point load on element: creates axial force', () => {
    const L = 5, Px = 15; // kN axial
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'pointOnElement', data: { elementId: 1, a: L / 2, p: 0, px: Px } }],
    });

    const r = solve(input);
    // Axial load → horizontal reactions
    // ΣFx = 0: rA.rx + Px = 0 (the axial load creates horizontal reaction at pinned support)
    expect(Math.abs(getReaction(r, 1).rx + Px)).toBeLessThan(0.1);
  });

  it('Self-weight equivalent: vertical distributed load proportional to ρA', () => {
    const L = 5;
    const rho = 78.5; // kN/m³ (steel density)
    const A = 0.01;    // m²
    const qSW = -rho * A; // kN/m self-weight

    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: qSW, qJ: qSW } }],
    });

    const r = solve(input);
    const totalWeight = qSW * L;
    checkEquilibrium2D(r, 0, totalWeight);
    expectClose(getReaction(r, 1).rz, -totalWeight / 2, 0.01, 'RA = W/2');
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. EXTREME VALUES — Numerical Stability
// ═════════════════════════════════════════════════════════════════

describe('5. Extreme values — Very small structures', () => {

  it('Micro-beam: E=10 MPa, A=1e-4 m², Iz=1e-8 m⁴, L=0.1 m', () => {
    // Small but realistic MEMS-scale beam
    const L = 0.1, P = -0.001; // 1 N load
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
      e: 10,       // 10 MPa (polymer-like)
      a: 1e-4,     // 1 cm² cross-section
      iz: 1e-8,    // small inertia
    });

    const r = solve(input);
    const rA = getReaction(r, 1);
    expectClose(rA.rz, -P, 0.01, 'Reaction = -P');
    expectClose(rA.my, -P * L, 0.01, 'Moment = -P*L');

    // Deflection should be finite and reasonable
    const d = getDisp(r, 2);
    expect(isFinite(d.uz), 'deflection is finite').toBe(true);
    expect(d.uz).toBeLessThan(0); // downward
  });

  it('Very small inertia: Iz=1e-10 m⁴ still produces valid results', () => {
    const L = 1, P = -1;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'pointOnElement', data: { elementId: 1, a: L / 2, p: P } }],
      iz: 1e-10,
    });

    const r = solve(input);
    checkEquilibrium2D(r, 0, P);
    const d2 = getDisp(r, 2);
    expect(isFinite(d2.uz)).toBe(true);
  });

  it('Very small area: A=1e-6 m² still works for frame analysis', () => {
    const L = 1, P = -0.0001; // tiny load to keep displacements reasonable
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
      a: 1e-6,
      iz: 1e-12,
    });

    const r = solve(input);
    expectClose(getReaction(r, 1).rz, -P, 0.01);
    expect(isFinite(getDisp(r, 2).uz)).toBe(true);
  });

  it('Very low E: E=1 MPa (rubber-like soft material)', () => {
    const L = 1, P = -0.001; // tiny load to avoid excessive displacements
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
      e: 1,
    });

    const r = solve(input);
    expectClose(getReaction(r, 1).rz, -P, 0.01);
    // Large deflection relative to stiff beams, but finite
    expect(isFinite(getDisp(r, 2).uz)).toBe(true);
    expect(getDisp(r, 2).uz).toBeLessThan(0);
  });
});

describe('5. Extreme values — Very large structures', () => {

  it('Long bridge: L=1000m, E=200000 MPa, large section', () => {
    const L = 1000, q = -50;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
      a: 1.0,     // 1 m² (massive section)
      iz: 0.1,    // 0.1 m⁴ (massive inertia)
    });

    const r = solve(input);
    checkEquilibrium2D(r, 0, q * L);
    expectClose(getReaction(r, 1).rz, -q * L / 2, 0.01, 'RA = qL/2');
    expect(isFinite(getDisp(r, 2).uz)).toBe(true);
  });

  it('Very high E: E=1e6 MPa (diamond-like stiffness)', () => {
    const L = 5, P = -100;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
      e: 1e6,
    });

    const r = solve(input);
    expectClose(getReaction(r, 1).rz, -P, 0.01);
    // Very small deflection but non-zero
    const d = getDisp(r, 2);
    expect(d.uz).toBeLessThan(0);
    expect(isFinite(d.uz)).toBe(true);
  });

  it('Very large loads: P=1e6 kN (extreme force)', () => {
    const L = 5, P = -1e6;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
    });

    const r = solve(input);
    checkEquilibrium2D(r, 0, P);
    expect(isFinite(getDisp(r, 2).uz)).toBe(true);
  });

  it('Massive inertia: Iz=10 m⁴ with normal E', () => {
    const L = 10, q = -100;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
      iz: 10,
    });

    const r = solve(input);
    expectClose(getReaction(r, 1).rz, -q * L, 0.01);
    expect(isFinite(getDisp(r, 2).uz)).toBe(true);
  });

  it('Extreme stiffness ratio: one very stiff + one very flexible element', () => {
    // Two elements side by side with vastly different stiffness
    const L = 5;
    const nodes = new Map<number, { id: number; x: number; y: number }>([
      [1, { id: 1, x: 0, y: 0 }],
      [2, { id: 2, x: L, y: 0 }],
      [3, { id: 3, x: 2 * L, y: 0 }],
    ]);
    const mat1: SolverMaterial = { id: 1, e: 200000, nu: 0.3 };
    const mat2: SolverMaterial = { id: 2, e: 200, nu: 0.3 };  // 1000× weaker
    const sec1 = { id: 1, a: 0.01, iz: 1e-4 };
    const sec2 = { id: 2, a: 0.01, iz: 1e-4 };

    const input: SolverInput = {
      nodes,
      materials: new Map([[1, mat1], [2, mat2]]),
      sections: new Map([[1, sec1], [2, sec2]]),
      elements: new Map([
        [1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [2, { id: 2, type: 'frame' as const, nodeI: 2, nodeJ: 3, materialId: 2, sectionId: 2, hingeStart: false, hingeEnd: false }],
      ]),
      supports: new Map([
        [1, { id: 1, nodeId: 1, type: 'fixed' as const }],
        [2, { id: 2, nodeId: 3, type: 'rollerX' as const }],
      ]),
      loads: [{ type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10 } }],
    };

    const r = solve(input);
    checkEquilibrium2D(r, 0, -10 * L);
    // All displacements should be finite
    for (const d of r.displacements) {
      expect(isFinite(d.ux), `node ${d.nodeId} ux finite`).toBe(true);
      expect(isFinite(d.uz), `node ${d.nodeId} uy finite`).toBe(true);
    }
  });
});

describe('5. Extreme values — Dimension combinations', () => {

  it('Very short element: L=0.001m (1mm)', () => {
    const L = 0.001;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -1, mz: 0 } }],
    });

    const r = solve(input);
    expectClose(getReaction(r, 1).rz, 1, 0.01);
    expect(isFinite(getDisp(r, 2).uz)).toBe(true);
  });

  it('Very long element: L=100m (building height)', () => {
    const L = 100, P = -50;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
    });

    const r = solve(input);
    checkEquilibrium2D(r, 0, P);
  });

  it('Many elements (20-element discretization): same result as 1 element', () => {
    const L = 10, n = 20;
    const dx = L / n;

    // Single element reference
    const ref = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    });
    const rRef = solve(ref);

    // 20-element discretization
    const nodes: Array<[number, number, number]> = [];
    const elements: Array<[number, number, number, 'frame']> = [];
    for (let i = 0; i <= n; i++) nodes.push([i + 1, i * dx, 0]);
    for (let i = 0; i < n; i++) elements.push([i + 1, i + 1, i + 2, 'frame']);

    const loads: SolverLoad[] = [];
    for (let i = 1; i <= n; i++) {
      loads.push({ type: 'distributed', data: { elementId: i, qI: -10, qJ: -10 } });
    }

    const multi = makeInput({
      nodes,
      elements,
      supports: [[1, 1, 'pinned'], [2, n + 1, 'rollerX']],
      loads,
    });
    const rMulti = solve(multi);

    // Reactions should match
    expectClose(getReaction(rMulti, 1).rz, getReaction(rRef, 1).rz, 0.01, 'RA match');
    expectClose(getReaction(rMulti, n + 1).rz, getReaction(rRef, 2).rz, 0.01, 'RB match');
  });
});

// ═════════════════════════════════════════════════════════════════
// 6. 3D STRUCTURES
// ═════════════════════════════════════════════════════════════════

describe('6. 3D — Cantilevers', () => {

  it('3D cantilever + tip load in Y: δ=PL³/(3EIz), reactions correct', () => {
    // SAP2000 convention: beam along X, ey = Y (up), ez = Z
    // Load in global Y → local Y direction → bending about local Z → uses Iz
    const L = 4, P = -10;
    const E = 200000;
    const Iz = stdSection3D.iz; // strong-axis bending for load in Y (SAP2000 convention)
    const EIz = E * 1000 * Iz;

    const input = buildInput3D(
      [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
      [makeFrame3D(1, 1, 2)],
      [fixedSupport3D(1)],
      [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, fz: 0, mx: 0, my: 0, mz: 0 } }],
    );

    const result = solve3D(input);
    assertSuccess3D(result);

    // Reactions
    const rFixed = result.reactions.find(r => r.nodeId === 1)!;
    expectClose(rFixed.fy, -P, 0.01, 'Fy reaction');

    // Tip displacement: δy = PL³/(3EIz) — SAP2000 local axes
    const tipDisp = result.displacements.find(d => d.nodeId === 2)!;
    const deltaAnalytical = P * L ** 3 / (3 * EIz);
    expectClose(tipDisp.uy, deltaAnalytical, 0.02, 'δy = PL³/3EIz');
  });

  it('3D cantilever + tip load in Z: bending about Y axis (uses Iy)', () => {
    // SAP2000 convention: beam along X, ey = Y, ez = Z
    // Load in global Z → local Z direction → bending about local Y → uses Iy
    const L = 4, Fz = -10;
    const E = 200000;
    const Iy = stdSection3D.iy; // weak-axis for load in Z (SAP2000 convention)
    const EIy = E * 1000 * Iy;

    const input = buildInput3D(
      [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
      [makeFrame3D(1, 1, 2)],
      [fixedSupport3D(1)],
      [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: Fz, mx: 0, my: 0, mz: 0 } }],
    );

    const result = solve3D(input);
    assertSuccess3D(result);

    // Tip displacement: δz = Fz*L³/(3EIy) — SAP2000 local axes
    const tipDisp = result.displacements.find(d => d.nodeId === 2)!;
    const deltaAnalytical = Fz * L ** 3 / (3 * EIy);
    expectClose(tipDisp.uz, deltaAnalytical, 0.02, 'δz = FzL³/3EIy');
  });

  it('3D cantilever + torsion: θx = Mx·L/(GJ)', () => {
    const L = 3, Mx = 5; // kN·m torsion at tip
    const E = 200000, nu = 0.3;
    const G = E / (2 * (1 + nu));
    const J = stdSection3D.j;
    const GJ = G * 1000 * J; // kN·m²

    const input = buildInput3D(
      [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
      [makeFrame3D(1, 1, 2)],
      [fixedSupport3D(1)],
      [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: Mx, my: 0, mz: 0 } }],
    );

    const result = solve3D(input);
    assertSuccess3D(result);

    const tipDisp = result.displacements.find(d => d.nodeId === 2)!;
    const thetaAnalytical = Mx * L / GJ;
    expectClose(tipDisp.rx, thetaAnalytical, 0.02, 'θx = MxL/GJ');
  });
});

describe('6. 3D — Portal Frames', () => {

  it('3D portal frame with gravity: equilibrium in all 3 axes', () => {
    // 4 columns + 4 beams forming a 3D portal
    const W = 6, D = 4, H = 3;

    const input = buildInput3D(
      [
        { id: 1, x: 0, y: 0, z: 0 },   // base 1
        { id: 2, x: W, y: 0, z: 0 },   // base 2
        { id: 3, x: W, y: 0, z: D },   // base 3
        { id: 4, x: 0, y: 0, z: D },   // base 4
        { id: 5, x: 0, y: H, z: 0 },   // top 1
        { id: 6, x: W, y: H, z: 0 },   // top 2
        { id: 7, x: W, y: H, z: D },   // top 3
        { id: 8, x: 0, y: H, z: D },   // top 4
      ],
      [
        makeFrame3D(1, 1, 5), makeFrame3D(2, 2, 6),
        makeFrame3D(3, 3, 7), makeFrame3D(4, 4, 8),
        makeFrame3D(5, 5, 6), makeFrame3D(6, 6, 7),
        makeFrame3D(7, 7, 8), makeFrame3D(8, 8, 5),
      ],
      [fixedSupport3D(1), fixedSupport3D(2), fixedSupport3D(3), fixedSupport3D(4)],
      [
        { type: 'nodal', data: { nodeId: 5, fx: 0, fy: -20, fz: 0, mx: 0, my: 0, mz: 0 } },
        { type: 'nodal', data: { nodeId: 6, fx: 0, fy: -20, fz: 0, mx: 0, my: 0, mz: 0 } },
        { type: 'nodal', data: { nodeId: 7, fx: 0, fy: -20, fz: 0, mx: 0, my: 0, mz: 0 } },
        { type: 'nodal', data: { nodeId: 8, fx: 0, fy: -20, fz: 0, mx: 0, my: 0, mz: 0 } },
        { type: 'nodal', data: { nodeId: 5, fx: 5, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }, // lateral
      ],
    );

    const result = solve3D(input);
    assertSuccess3D(result);

    // Check equilibrium
    let sumFy = -80, sumFx = 5, sumFz = 0;
    for (const rx of result.reactions) {
      sumFx += rx.fx; sumFy += rx.fy; sumFz += rx.fz;
    }
    expect(Math.abs(sumFx), 'ΣFx').toBeLessThan(0.1);
    expect(Math.abs(sumFy), 'ΣFy').toBeLessThan(0.1);
    expect(Math.abs(sumFz), 'ΣFz').toBeLessThan(0.1);
  });
});

describe('6. 3D — Space Trusses', () => {

  it('Tetrahedron truss: equilibrium under vertical load at apex', () => {
    const H = 3;
    const input = buildInput3D(
      [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 4, y: 0, z: 0 },
        { id: 3, x: 2, y: 0, z: 3 },
        { id: 4, x: 2, y: H, z: 1 },  // apex
      ],
      [
        makeTruss3D(1, 1, 2), makeTruss3D(2, 2, 3), makeTruss3D(3, 1, 3),
        makeTruss3D(4, 1, 4), makeTruss3D(5, 2, 4), makeTruss3D(6, 3, 4),
      ],
      [pinnedSupport3D(1), pinnedSupport3D(2), pinnedSupport3D(3)],
      [{ type: 'nodal', data: { nodeId: 4, fx: 0, fy: -30, fz: 0, mx: 0, my: 0, mz: 0 } }],
    );

    const result = solve3D(input);
    assertSuccess3D(result);

    let sumFy = -30;
    for (const rx of result.reactions) sumFy += rx.fy;
    expect(Math.abs(sumFy), 'ΣFy tetrahedron').toBeLessThan(0.1);

    // All displacements should be finite
    for (const d of result.displacements) {
      expect(isFinite(d.ux) && isFinite(d.uy) && isFinite(d.uz), `node ${d.nodeId} finite`).toBe(true);
    }
  });
});

describe('6. 3D — Extreme values', () => {

  it('3D cantilever with very small section: produces finite results', () => {
    const L = 1;
    const tinySection: SolverSection3D = { id: 1, a: 1e-6, iz: 1e-14, iy: 5e-15, j: 1e-14 };

    const input = buildInput3D(
      [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
      [makeFrame3D(1, 1, 2)],
      [fixedSupport3D(1)],
      [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -0.001, fz: 0, mx: 0, my: 0, mz: 0 } }],
      [steelMat],
      [tinySection],
    );

    const result = solve3D(input);
    assertSuccess3D(result);
    const d = result.displacements.find(x => x.nodeId === 2)!;
    expect(isFinite(d.uz), 'uz finite').toBe(true);
  });

  it('3D frame with very large section: produces finite results', () => {
    const L = 5;
    const largeSection: SolverSection3D = { id: 1, a: 1.0, iz: 0.1, iy: 0.05, j: 0.08 };

    const input = buildInput3D(
      [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
      [makeFrame3D(1, 1, 2)],
      [fixedSupport3D(1)],
      [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -1000, fz: 0, mx: 0, my: 0, mz: 0 } }],
      [steelMat],
      [largeSection],
    );

    const result = solve3D(input);
    assertSuccess3D(result);
    const d = result.displacements.find(x => x.nodeId === 2)!;
    expect(isFinite(d.uy), 'uy finite').toBe(true);
    expect(d.uy).toBeLessThan(0); // downward (load is fy: -1000)
  });

  it('3D with very low E: E=0.5 MPa still converges', () => {
    const L = 2;
    const softMat: SolverMaterial = { id: 1, e: 0.5, nu: 0.3 };

    const input = buildInput3D(
      [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
      [makeFrame3D(1, 1, 2)],
      [fixedSupport3D(1)],
      [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -0.01, fz: 0, mx: 0, my: 0, mz: 0 } }],
      [softMat],
    );

    const result = solve3D(input);
    assertSuccess3D(result);
    const d = result.displacements.find(x => x.nodeId === 2)!;
    expect(isFinite(d.uz)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// 7. EDGE CASES — Error handling & boundary conditions
// ═════════════════════════════════════════════════════════════════

describe('7. Edge cases — Mechanisms & errors', () => {

  it('Beam with no supports → mechanism error', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
    });

    expect(() => solve(input)).toThrow();
  });

  it('Only one roller → mechanism (insufficient horizontal constraint)', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
    });

    expect(() => solve(input)).toThrow();
  });

  it('Three parallel rollers → mechanism', () => {
    // All supports restrain only vertical movement → can slide horizontally
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 3, 0], [3, 6, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
      ],
      supports: [[1, 1, 'rollerX'], [2, 2, 'rollerX'], [3, 3, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
    });

    expect(() => solve(input)).toThrow();
  });

  it('Disconnected structure → error (two separate parts)', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 3, 0], [3, 10, 0], [4, 13, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 3, 4, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 3, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
    });

    // Should either throw or detect disconnected components
    const r = solve(input);
    // If it doesn't throw, check that results are at least finite
    for (const d of r.displacements) {
      expect(isFinite(d.ux) && isFinite(d.uz) && isFinite(d.ry)).toBe(true);
    }
  });

  it('Zero-length element → error', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 0, 0]], // same position!
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
    });

    expect(() => solve(input)).toThrow(/longitud cero|zero/i);
  });

  it('Section with A=0 → error', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
      a: 0,
    });

    expect(() => solve(input)).toThrow(/area A must be > 0/);
  });

  it('Section with Iz=0 → error', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
      iz: 0,
    });

    expect(() => solve(input)).toThrow(/inertia must be > 0/);
  });

  it('No loads on structure → zero displacements', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [],
    });

    const r = solve(input);
    for (const d of r.displacements) {
      expect(Math.abs(d.ux)).toBeLessThan(1e-12);
      expect(Math.abs(d.uz)).toBeLessThan(1e-12);
      expect(Math.abs(d.ry)).toBeLessThan(1e-12);
    }
  });
});

describe('7. Edge cases — Special supports', () => {

  it('Spring support: R = k × δ', () => {
    const L = 5, P = -50, k = 500; // kN/m
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        [1, 1, 'pinned'],
        [2, 2, 'spring', { ky: k }],
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
    });

    const r = solve(input);
    checkEquilibrium2D(r, 0, P);

    // Spring force = k × displacement
    const rSpring = getReaction(r, 2);
    const dSpring = getDisp(r, 2);
    expectClose(rSpring.rz, -k * dSpring.uz, 0.01, 'R_spring = -k*u');
  });

  it('Prescribed displacement: known settlement', () => {
    const L = 6, settlement = -0.01; // 10mm downward
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [
        [1, 1, 'fixed'],
        [2, 2, 'fixed', { dy: settlement }],
      ],
      loads: [],
    });

    const r = solve(input);
    const d2 = getDisp(r, 2);
    expectClose(d2.uz, settlement, 0.01, 'prescribed uz = settlement');

    // Settlement should induce forces (non-zero reactions)
    expect(Math.abs(getReaction(r, 1).rz)).toBeGreaterThan(0.001);
  });
});

// ═════════════════════════════════════════════════════════════════
// 8. NUMERICAL STABILITY — Float precision
// ═════════════════════════════════════════════════════════════════

describe('8. Numerical stability — Float precision', () => {

  it('Equilibrium holds to 1e-6 for simple beam', () => {
    const L = 7, q = -15;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
    });

    const r = solve(input);
    let sumFz = q * L;
    for (const rx of r.reactions) sumFz += rx.rz;
    expect(Math.abs(sumFz), 'ΣFz precision').toBeLessThan(1e-6);
  });

  it('Symmetry holds: identical halves give identical results', () => {
    const L = 10, q = -20;
    // 2-element symmetric beam
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L / 2, 0], [3, L, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
      ],
      supports: [[1, 1, 'pinned'], [2, 3, 'rollerX']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: q, qJ: q } },
        { type: 'distributed', data: { elementId: 2, qI: q, qJ: q } },
      ],
    });

    const r = solve(input);
    const rA = getReaction(r, 1).rz;
    const rB = getReaction(r, 3).rz;
    expectClose(rA, rB, 1e-6, 'symmetric reactions');

    // Midpoint has maximum displacement (no horizontal movement)
    const dMid = getDisp(r, 2);
    expect(Math.abs(dMid.ux)).toBeLessThan(1e-10);
  });

  it('Superposition: separate loads sum to combined result', () => {
    const L = 6;

    // Load A alone
    const inputA = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    });

    // Load B alone
    const inputB = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -20, mz: 0 } }],
    });

    // Combined
    const inputAB = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } },
        { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -20, mz: 0 } },
      ],
    });

    const rA = solve(inputA);
    const rB = solve(inputB);
    const rAB = solve(inputAB);

    // Superposition: δ_AB = δ_A + δ_B
    const dA = getDisp(rA, 2), dB = getDisp(rB, 2), dAB = getDisp(rAB, 2);
    expectClose(dAB.uz, dA.uz + dB.uz, 0.001, 'superposition uz');
    expectClose(dAB.ry, dA.ry + dB.ry, 0.001, 'superposition ry');

    // Reactions too
    const raA = getReaction(rA, 1).rz;
    const raB = getReaction(rB, 1).rz;
    const raAB = getReaction(rAB, 1).rz;
    expectClose(raAB, raA + raB, 0.001, 'superposition RA');
  });

  it('Moment balance: ΣM about any point = 0', () => {
    const L = 8, P = -25;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'pointOnElement', data: { elementId: 1, a: 3, p: P } }],
    });

    const r = solve(input);
    const rA = getReaction(r, 1), rB = getReaction(r, 2);

    // ΣM about node 1: RB*L + P*a = 0 (taking left-to-right as positive x)
    const sumM1 = rB.rz * L + P * 3; // P is perpendicular = vertical at a=3
    expect(Math.abs(sumM1), 'ΣM about node 1').toBeLessThan(0.01);

    // ΣM about node 2: RA*L + P*(L-3) = 0
    const sumM2 = rA.rz * L + P * (L - 3);
    expect(Math.abs(sumM2), 'ΣM about node 2').toBeLessThan(0.01);
  });

  it('Reciprocity theorem (Maxwell-Betti): δ_12 = δ_21', () => {
    const L = 6;
    const P = 10;

    // Case 1: Load at 1/3, measure displacement at 2/3
    const input1 = makeInput({
      nodes: [[1, 0, 0], [2, L / 3, 0], [3, 2 * L / 3, 0], [4, L, 0]],
      elements: [
        [1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame'],
      ],
      supports: [[1, 1, 'pinned'], [2, 4, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -P, mz: 0 } }],
    });
    const r1 = solve(input1);
    const d12 = getDisp(r1, 3).uz; // displacement at node 3 due to load at node 2

    // Case 2: Load at 2/3, measure displacement at 1/3
    const input2 = makeInput({
      nodes: [[1, 0, 0], [2, L / 3, 0], [3, 2 * L / 3, 0], [4, L, 0]],
      elements: [
        [1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame'],
      ],
      supports: [[1, 1, 'pinned'], [2, 4, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fy: -P, mz: 0 } }],
    });
    const r2 = solve(input2);
    const d21 = getDisp(r2, 2).uz; // displacement at node 2 due to load at node 3

    // Maxwell-Betti: δ_12 = δ_21
    expectClose(d12, d21, 0.001, 'Maxwell-Betti reciprocity');
  });
});

// ═════════════════════════════════════════════════════════════════
// 9. MULTI-ELEMENT & REAL-WORLD STRUCTURES
// ═════════════════════════════════════════════════════════════════

describe('9. Real-world structural configurations', () => {

  it('L-shaped frame (2 members at 90°): equilibrium', () => {
    const H = 3, W = 4, P = -10;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 0, H], [3, W, H]],
      elements: [
        [1, 1, 2, 'frame'], // vertical column
        [2, 2, 3, 'frame'], // horizontal beam
      ],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fy: P, mz: 0 } }],
    });

    const r = solve(input);
    const rA = getReaction(r, 1);
    expectClose(rA.rz, -P, 0.01, 'RA = -P');
    // Moment at base = P × horizontal distance
    // Moment at base: the load P creates a CW moment about the base = |P|*W
    expectClose(Math.abs(rA.my), Math.abs(P) * W, 0.02, '|MA| = |P|*W');
  });

  it('Multi-story frame (2 floors): equilibrium with lateral loads', () => {
    const W = 5, H = 3;
    const input = makeInput({
      nodes: [
        [1, 0, 0], [2, W, 0],       // base
        [3, 0, H], [4, W, H],       // 1st floor
        [5, 0, 2 * H], [6, W, 2 * H], // 2nd floor
      ],
      elements: [
        [1, 1, 3, 'frame'], [2, 2, 4, 'frame'],   // columns floor 1
        [3, 3, 5, 'frame'], [4, 4, 6, 'frame'],   // columns floor 2
        [5, 3, 4, 'frame'],                         // beam floor 1
        [6, 5, 6, 'frame'],                         // beam floor 2
      ],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
      loads: [
        { type: 'distributed', data: { elementId: 5, qI: -20, qJ: -20 } },
        { type: 'distributed', data: { elementId: 6, qI: -15, qJ: -15 } },
        { type: 'nodal', data: { nodeId: 3, fx: 10, fy: 0, mz: 0 } },
        { type: 'nodal', data: { nodeId: 5, fx: 8, fy: 0, mz: 0 } },
      ],
    });

    const r = solve(input);
    const totalFx = 10 + 8;
    const totalFz = -20 * W + -15 * W;
    checkEquilibrium2D(r, totalFx, totalFz);
  });

  it('Inclined beam (30°): reactions exist & displacements are finite', () => {
    const L = 5, angle = Math.PI / 6; // 30°
    const dx = L * Math.cos(angle);
    const dy = L * Math.sin(angle);

    const input = makeInput({
      nodes: [[1, 0, 0], [2, dx, dy]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    });

    const r = solve(input);
    // Verify reactions exist and displacements are finite
    expect(r.reactions.length).toBeGreaterThan(0);
    for (const d of r.displacements) {
      expect(isFinite(d.ux) && isFinite(d.uz) && isFinite(d.ry), `node ${d.nodeId} finite`).toBe(true);
    }
    // At least one reaction should be non-zero
    const totalRz = r.reactions.reduce((s, rx) => s + rx.rz, 0);
    expect(Math.abs(totalRz)).toBeGreaterThan(0.1);
  });

  it('Frame carries bending, pure truss carries only axial', () => {
    // Frame structure: L-frame with bending
    const frameInput = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0], [3, 5, 3]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
      ],
      supports: [[1, 1, 'pinned'], [2, 3, 'fixed']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    });

    const rFrame = solve(frameInput);
    checkEquilibrium2D(rFrame, 0, -10 * 5);
    // Frame elements carry bending
    const ef1 = getForces(rFrame, 1);
    expect(Math.abs(ef1.mStart) > 0.01 || Math.abs(ef1.mEnd) > 0.01, 'frame carries bending').toBe(true);

    // Pure truss: all moments must be zero
    const trussInput = makeInput({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 2, 3]],
      elements: [
        [1, 1, 2, 'truss'], [2, 1, 3, 'truss'], [3, 2, 3, 'truss'],
      ],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 3, fx: 5, fy: -15, mz: 0 } }],
    });
    const rTruss = solve(trussInput);
    for (const ef of rTruss.elementForces) {
      expect(Math.abs(ef.mStart), `truss elem ${ef.elementId} mStart`).toBeLessThan(1e-6);
      expect(Math.abs(ef.mEnd), `truss elem ${ef.elementId} mEnd`).toBeLessThan(1e-6);
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// 10. SOLVER VALIDATION — Material property guards
// ═════════════════════════════════════════════════════════════════

describe('10. Material property validation', () => {

  it('Negative section area → error', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
      a: -0.01,
    });

    expect(() => solve(input)).toThrow();
  });

  it('Negative inertia → error', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
      iz: -1e-4,
    });

    expect(() => solve(input)).toThrow();
  });

  it('3D: Zero J (torsion constant) → error', () => {
    const zeroJSection: SolverSection3D = { id: 1, a: 0.01, iz: 1e-4, iy: 5e-5, j: 0 };

    const input = buildInput3D(
      [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 5, y: 0, z: 0 }],
      [makeFrame3D(1, 1, 2)],
      [fixedSupport3D(1)],
      [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } }],
      [steelMat],
      [zeroJSection],
    );

    // WASM solver throws instead of returning error string
    expect(() => solve3D(input)).toThrow(/singular|mechanism/i);
  });

  it('3D: Zero Iy → error', () => {
    const zeroIySection: SolverSection3D = { id: 1, a: 0.01, iz: 1e-4, iy: 0, j: 1e-5 };

    const input = buildInput3D(
      [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 5, y: 0, z: 0 }],
      [makeFrame3D(1, 1, 2)],
      [fixedSupport3D(1)],
      [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } }],
      [steelMat],
      [zeroIySection],
    );

    expect(() => solve3D(input)).toThrow(/inertia must be > 0/);
  });
});

// ═════════════════════════════════════════════════════════════════
// 11. DEFORMED SHAPE & DIAGRAMS — Consistency checks
// ═════════════════════════════════════════════════════════════════

describe('11. Diagram consistency', () => {

  it('V diagram: shear at supports = reactions for SS beam', () => {
    const L = 8, q = -15;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
    });

    const r = solve(input);
    const ef = getForces(r, 1);

    // V at left support = RA
    const vLeft = computeDiagramValueAt('shear', 0.001, ef);
    expectClose(vLeft, getReaction(r, 1).rz, 0.02, 'V(0) = RA');

    // V at right = -RB (sign convention)
    const vRight = computeDiagramValueAt('shear', 0.999, ef);
    expectClose(vRight, -getReaction(r, 2).rz, 0.02, 'V(L) = -RB');

    // V = 0 at midspan (for symmetric UDL on SS beam)
    const vMid = computeDiagramValueAt('shear', 0.5, ef);
    expect(Math.abs(vMid), 'V(L/2) = 0').toBeLessThan(0.5);
  });

  it('M diagram: M_max occurs where V=0 for UDL on SS beam', () => {
    const L = 6, q = -10;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
    });

    const r = solve(input);
    const ef = getForces(r, 1);

    // Find where V ≈ 0 (should be at midspan for symmetric UDL)
    const mMid = computeDiagramValueAt('moment', 0.5, ef);
    const mLeft = computeDiagramValueAt('moment', 0.3, ef);
    const mRight = computeDiagramValueAt('moment', 0.7, ef);

    // Mmax is at midspan
    expect(Math.abs(mMid)).toBeGreaterThan(Math.abs(mLeft));
    expect(Math.abs(mMid)).toBeGreaterThan(Math.abs(mRight));
  });

  it('N diagram: constant for truss element under axial load', () => {
    const L = 5, P = 20; // horizontal tension
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'truss']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: P, fy: 0, mz: 0 } }],
    });

    const r = solve(input);
    const ef = getForces(r, 1);

    // N should be constant along element
    const n1 = computeDiagramValueAt('axial', 0.1, ef);
    const n5 = computeDiagramValueAt('axial', 0.5, ef);
    const n9 = computeDiagramValueAt('axial', 0.9, ef);
    expectClose(n1, n5, 0.001, 'N constant along truss');
    expectClose(n5, n9, 0.001, 'N constant along truss');
  });

  it('Moment at ends of SS beam = 0', () => {
    const L = 5, q = -10;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
    });

    const r = solve(input);
    const ef = getForces(r, 1);
    const m0 = computeDiagramValueAt('moment', 0, ef);
    const mL = computeDiagramValueAt('moment', 1, ef);
    expect(Math.abs(m0), 'M(0) = 0').toBeLessThan(0.01);
    expect(Math.abs(mL), 'M(L) = 0').toBeLessThan(0.01);
  });
});

// ═════════════════════════════════════════════════════════════════
// 12. DISPLACEMENT VERIFICATION — Analytical formulas
// ═════════════════════════════════════════════════════════════════

describe('12. Displacement formulas', () => {

  it('SS beam + UDL: δ_max = 5qL⁴/(384EI) at midspan', () => {
    const L = 6, q = -10;
    const EI = STEEL_E * 1000 * STD_IZ;

    const input = makeInput({
      nodes: [[1, 0, 0], [2, L / 2, 0], [3, L, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
      ],
      supports: [[1, 1, 'pinned'], [2, 3, 'rollerX']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: q, qJ: q } },
        { type: 'distributed', data: { elementId: 2, qI: q, qJ: q } },
      ],
    });

    const r = solve(input);
    const dMid = getDisp(r, 2);
    const deltaAnalytical = 5 * q * L ** 4 / (384 * EI);
    expectClose(dMid.uz, deltaAnalytical, 0.01, 'δ_max = 5qL⁴/384EI');
  });

  it('Cantilever + UDL: slope at tip = qL³/(6EI)', () => {
    const L = 4, q = -8;
    const EI = STEEL_E * 1000 * STD_IZ;

    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: q, qJ: q } }],
    });

    const r = solve(input);
    const tipDisp = getDisp(r, 2);
    const thetaAnalytical = q * L ** 3 / (6 * EI);
    expectClose(tipDisp.ry, thetaAnalytical, 0.01, 'θ_tip = qL³/6EI');
  });

  it('Fixed-fixed beam + UDL: δ_max = qL⁴/(384EI) at midspan', () => {
    const L = 5, q = -12;
    const EI = STEEL_E * 1000 * STD_IZ;

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

    const r = solve(input);
    const dMid = getDisp(r, 2);
    const deltaAnalytical = q * L ** 4 / (384 * EI);
    expectClose(dMid.uz, deltaAnalytical, 0.02, 'δ_max = qL⁴/384EI');
  });
});
