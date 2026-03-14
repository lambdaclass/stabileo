/**
 * Mechanism Detection Tests
 *
 * Tests that the solver correctly detects mechanisms (hypostatic structures)
 * and allows valid structures to solve. Based on structural mechanics principles:
 * - Fliess, Estabilidad (Tomo I) — isostaticidad, mecanismos
 * - Verification heuristics: equilibrium, sign conventions, order of magnitude
 */

import { describe, it, expect } from 'vitest';
import { solve } from '../solver-js';
import type { SolverInput, SolverLoad, AnalysisResults } from '../types';

// ─── Test Helpers ───────────────────────────────────────────────

const STEEL_E = 200_000;
const STD_A = 0.01;
const STD_IZ = 1e-4;

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
  return results.reactions.find(r => r.nodeId === nodeId) ?? { nodeId, rx: 0, ry: 0, mz: 0 };
}

function getForces(results: AnalysisResults, elemId: number) {
  return results.elementForces.find(f => f.elementId === elemId);
}

const ABS_TOL = 1e-6;
const TOL = 0.02;

function expectClose(actual: number, expected: number, label = '') {
  if (Math.abs(expected) < ABS_TOL) {
    expect(Math.abs(actual), label).toBeLessThan(ABS_TOL * 100);
  } else {
    const relError = Math.abs((actual - expected) / expected);
    expect(relError, `${label}: got ${actual}, expected ${expected}`).toBeLessThan(TOL);
  }
}

function expectMechanism(input: SolverInput) {
  expect(() => solve(input)).toThrow(/[Mm]echanism|singular|hypostatic|unstab|support|restrained|disconnected|[Mm]ecanismo|hipostática|inestab|apoyo|restringida|desconectados/);
}

// ═══════════════════════════════════════════════════════════════
// 1. MECHANISM DETECTION — structures that MUST fail
// ═══════════════════════════════════════════════════════════════

describe('Mechanism detection — structures that must be detected as unstable', () => {

  it('collinear all-hinged nodes → mechanism (existing check)', () => {
    // Two collinear beams, hinge at middle node: mechanism
    // Nodes: (0,0), (5,0), (10,0) — all collinear
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],  // hinge at node 2
        [2, 2, 3, 'frame', true, false],   // hinge at node 2
      ],
      supports: [[1, 1, 'pinned'], [2, 3, 'pinned']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
    });
    expectMechanism(input);
  });

  it('rectangular frame with all 4 corners hinged → parallelogram mechanism', () => {
    // 4 nodes forming a rectangle, all connections hinged
    // This is a parallelogram mechanism — zero bending stiffness
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0], [3, 6, 4], [4, 0, 4]],
      elements: [
        [1, 1, 2, 'frame', true, true],  // bottom: double hinged
        [2, 2, 3, 'frame', true, true],  // right: double hinged
        [3, 3, 4, 'frame', true, true],  // top: double hinged
        [4, 4, 1, 'frame', true, true],  // left: double hinged
      ],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 3, fx: 10, fy: 0, mz: 0 } }],
    });
    expectMechanism(input);
  });

  it('portal frame with pinned bases + double-hinged beam → mechanism', () => {
    // Columns: pinned at base, beam hinged at both connections
    // Zero moment transfer anywhere → mechanism
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]],
      elements: [
        [1, 1, 2, 'frame', true, false],  // left column: hinge at base
        [2, 2, 3, 'frame', true, true],    // beam: double hinged
        [3, 4, 3, 'frame', true, false],   // right column: hinge at base
      ],
      supports: [[1, 1, 'pinned'], [2, 4, 'pinned']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 10, fy: 0, mz: 0 } }],
    });
    expectMechanism(input);
  });

  it('truss with too few bars (b + r < 2n) → mechanism', () => {
    // 4 nodes, 3 bars (need at least 5 for b+r=2n with r=3)
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 2, 3], [4, 6, 3]],
      elements: [
        [1, 1, 2, 'truss'],
        [2, 1, 3, 'truss'],
        [3, 2, 3, 'truss'],
        // Missing bar to node 4
      ],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 4, fx: 0, fy: -10, mz: 0 } }],
    });
    // Node 4 is disconnected — should fail
    expectMechanism(input);
  });

  it('single element double-hinged with pinned supports → truss-like, no horizontal restraint', () => {
    // Single beam with both ends hinged + both supports pinned
    // This actually works as a truss — but if load is perpendicular it has no stiffness
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame', true, true]],
      supports: [[1, 1, 'pinned'], [2, 2, 'pinned']],
      loads: [{ type: 'nodal', data: { nodeId: 1, fx: 0, fy: 0, mz: 10 } }],
    });
    // Applying moment to a truss-like element → mechanism for rotation
    expectMechanism(input);
  });

  it('no supports at all → mechanism', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 10, fy: 0, mz: 0 } }],
    });
    expectMechanism(input);
  });

  it('overhinged node: double-hinged elem + single-hinged elem at same node → mechanism', () => {
    // Node 2: elem 1 (double-hinged, only axial) + elem 2 (hinged at start)
    // All elements hinged at node 2, one is double-hinged → zero flexural + reduced transverse
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 4, 4]],
      elements: [
        [1, 1, 2, 'frame', true, true],   // double hinged (truss-like)
        [2, 2, 3, 'frame', true, false],   // hinge at start (node 2)
      ],
      supports: [[1, 1, 'fixed'], [2, 3, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 10, fy: -10, mz: 0 } }],
    });
    expectMechanism(input);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. VALID STRUCTURES — must NOT be flagged as mechanisms
// ═══════════════════════════════════════════════════════════════

describe('Valid structures that must NOT be flagged as mechanisms', () => {

  it('three-hinge arch (grado=0, stable, non-collinear)', () => {
    // Simple 3-node three-hinge arch
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 4], [3, 10, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],  // hinge at crown (node 2)
        [2, 2, 3, 'frame', true, false],   // hinge at crown (node 2)
      ],
      supports: [[1, 1, 'pinned'], [2, 3, 'pinned']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -20, mz: 0 } }],
    });
    const result = solve(input);
    expect(result).toBeTruthy();
    // Vertical equilibrium
    const r1 = getReaction(result, 1);
    const r2 = getReaction(result, 3);
    expectClose(r1.ry + r2.ry, 20, 'ΣFy = 0');
    // Symmetric → equal reactions
    expectClose(r1.ry, 10, 'R1y');
    expectClose(r2.ry, 10, 'R2y');
  });

  it('Gerber beam (valid: hinge at correct position)', () => {
    // 2 spans, hinge in middle of span 2
    // Supports at 0, 5, 10; hinge between node 2 and 3
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]],
      elements: [
        [1, 1, 2, 'frame'],                  // span 1: no hinges
        [2, 2, 3, 'frame', true, false],      // span 2: hinge at start (node 2)
      ],
      supports: [[1, 1, 'fixed'], [2, 3, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -20, mz: 0 } }],
    });
    const result = solve(input);
    expect(result).toBeTruthy();
    // Total reaction = 20 kN
    const r1 = getReaction(result, 1);
    const r3 = getReaction(result, 3);
    expectClose(r1.ry + r3.ry, 20, 'ΣFy = 0');
  });

  it('portal frame with beam hinged at both ends but fixed-base columns (grado > 0)', () => {
    // Columns fixed at base provide moment resistance
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]],
      elements: [
        [1, 1, 2, 'frame'],               // left column: rigid
        [2, 2, 3, 'frame', true, true],    // beam: double hinged
        [3, 4, 3, 'frame'],               // right column: rigid
      ],
      supports: [[1, 1, 'fixed'], [2, 4, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 10, fy: 0, mz: 0 } }],
    });
    const result = solve(input);
    expect(result).toBeTruthy();
    // Horizontal equilibrium
    const r1 = getReaction(result, 1);
    const r4 = getReaction(result, 4);
    expectClose(r1.rx + r4.rx, -10, 'ΣFx = 0');
  });

  it('simply supported beam with 1 internal hinge (propped)', () => {
    // 3 nodes, 2 elements, hinge at middle → still stable with 3 supports
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 8, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],  // hinge at node 2
        [2, 2, 3, 'frame', true, false],   // hinge at node 2
      ],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX'], [3, 3, 'pinned']],
      loads: [{ type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10 } }],
    });
    const result = solve(input);
    expect(result).toBeTruthy();
    // Total load = 10 * 4 = 40 kN → total reactions = 40
    const sumRy = result.reactions.reduce((s, r) => s + r.ry, 0);
    expectClose(sumRy, 40, 'ΣFy = 0');
  });

  it('simple truss (statically determinate)', () => {
    // Triangle: 3 nodes, 3 bars, pinned + roller = 3 restraints
    // b + r = 3 + 3 = 6 = 2n = 6 ✓
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
    const result = solve(input);
    expect(result).toBeTruthy();
    expectClose(getReaction(result, 1).ry + getReaction(result, 2).ry, 10, 'ΣFy = 0');
  });

  it('discretized parabolic arch (8 segments) solves correctly', () => {
    // This is the three-hinge arch test from solver-advanced
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
      elements.push([i + 1, i + 1, i + 2, 'frame', i === midIdx, i === midIdx - 1]);
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
    const r1 = getReaction(result, 1);
    const r2 = getReaction(result, nSeg + 1);
    expectClose(r1.ry + r2.ry, 70, 'Vertical equilibrium');
    expectClose(r1.ry, 35, 'Symmetric reactions');
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. HINGE BEHAVIOR — verify moments and forces at hinges
// ═══════════════════════════════════════════════════════════════

describe('Hinge behavior verification', () => {

  it('cantilever with hinge at free end: M=0 at hinge', () => {
    // Fixed at node 1, hinge at node 2 (free end)
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 4, 0]],
      elements: [[1, 1, 2, 'frame', false, true]], // hinge at end (node 2)
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, mz: 0 } }],
    });
    const result = solve(input);
    expect(result).toBeTruthy();
    const f = getForces(result, 1)!;
    // Moment at hinged end must be zero
    expect(Math.abs(f.mEnd), 'M at hinge = 0').toBeLessThan(1e-6);
    // Moment at fixed end = P*L = 10*4 = 40 kN·m
    // Note: sign convention may differ, check absolute value
    expectClose(Math.abs(f.mStart), 40, 'M at fixed end');
  });

  it('double-hinged beam: zero moments, only axial (like truss)', () => {
    // SS beam with both ends hinged under axial load
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame', true, true]],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 50, fy: 0, mz: 0 } }],
    });
    const result = solve(input);
    expect(result).toBeTruthy();
    const f = getForces(result, 1)!;
    // Moments must be zero at both ends
    expect(Math.abs(f.mStart), 'M_start = 0').toBeLessThan(1e-6);
    expect(Math.abs(f.mEnd), 'M_end = 0').toBeLessThan(1e-6);
    // Shear must be zero (double hinged = no transverse stiffness)
    expect(Math.abs(f.vStart), 'V_start ≈ 0').toBeLessThan(1e-3);
  });

  it('Gerber beam: M=0 at hinge, correct shear distribution', () => {
    // Fixed at A (node 1), roller at C (node 3), hinge at B (node 2)
    // Uniform load q = -10 kN/m on both spans
    const L = 5;
    const q = -10;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0], [3, 2 * L, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],   // hinge at node 2
        [2, 2, 3, 'frame', true, false],    // hinge at node 2
      ],
      supports: [[1, 1, 'fixed'], [2, 3, 'rollerX']],
      loads: [
        { type: 'distributed', data: { id: 1, elementId: 1, qI: q, qJ: q } },
        { type: 'distributed', data: { id: 2, elementId: 2, qI: q, qJ: q } },
      ],
    });
    const result = solve(input);
    expect(result).toBeTruthy();
    // Check M=0 at hinge (end of element 1, start of element 2)
    const f1 = getForces(result, 1)!;
    const f2 = getForces(result, 2)!;
    expect(Math.abs(f1.mEnd), 'M at hinge (elem 1 end) = 0').toBeLessThan(0.1);
    expect(Math.abs(f2.mStart), 'M at hinge (elem 2 start) = 0').toBeLessThan(0.1);
    // Total load = |q| * 2L = 100 kN, total reactions must equal 100
    const r1 = getReaction(result, 1);
    const r3 = getReaction(result, 3);
    expectClose(r1.ry + r3.ry, 100, 'ΣFy = 0');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. GLOBAL EQUILIBRIUM — every structure must satisfy ΣF=0, ΣM=0
// ═══════════════════════════════════════════════════════════════

describe('Global equilibrium on complex structures', () => {

  function checkGlobalEquilibrium(result: AnalysisResults, loads: SolverLoad[], input: SolverInput) {
    let appFx = 0, appFy = 0;
    for (const load of loads) {
      if (load.type === 'nodal') {
        const d = load.data as any;
        appFx += d.fx;
        appFy += d.fy;
      } else if (load.type === 'distributed') {
        const d = load.data as any;
        const elem = input.elements.get(d.elementId)!;
        const ni = input.nodes.get(elem.nodeI)!;
        const nj = input.nodes.get(elem.nodeJ)!;
        const dx = nj.x - ni.x, dy = nj.y - ni.y;
        const L = Math.sqrt(dx * dx + dy * dy);
        const cos = dx / L, sin = dy / L;
        const qAvg = ((d.qI ?? 0) + (d.qJ ?? 0)) / 2;
        const totalPerp = qAvg * L;
        appFx += totalPerp * (-sin);
        appFy += totalPerp * cos;
      }
    }
    let sumRx = 0, sumRy = 0;
    for (const r of result.reactions) {
      sumRx += r.rx;
      sumRy += r.ry;
    }
    expect(Math.abs(appFx + sumRx), 'ΣFx = 0').toBeLessThan(0.01);
    expect(Math.abs(appFy + sumRy), 'ΣFy = 0').toBeLessThan(0.01);
  }

  it('two-story frame with lateral loads', () => {
    // 6 nodes, 5 elements
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0], [5, 0, 8], [6, 6, 8]],
      elements: [
        [1, 1, 2, 'frame'], // left col floor 1
        [2, 2, 3, 'frame'], // beam floor 1
        [3, 4, 3, 'frame'], // right col floor 1
        [4, 2, 5, 'frame'], // left col floor 2
        [5, 5, 6, 'frame'], // beam floor 2
        [6, 3, 6, 'frame'], // right col floor 2
      ],
      supports: [[1, 1, 'fixed'], [2, 4, 'fixed']],
      loads: [
        { type: 'nodal', data: { nodeId: 2, fx: 20, fy: 0, mz: 0 } },
        { type: 'nodal', data: { nodeId: 5, fx: 10, fy: 0, mz: 0 } },
      ],
    });
    const result = solve(input);
    expect(result).toBeTruthy();
    checkGlobalEquilibrium(result, input.loads, input);
  });

  it('mixed frame + truss structure', () => {
    // Frame columns with truss diagonal bracing
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]],
      elements: [
        [1, 1, 2, 'frame'],   // left column
        [2, 2, 3, 'frame'],   // beam
        [3, 4, 3, 'frame'],   // right column
        [4, 1, 3, 'truss'],   // diagonal brace
      ],
      supports: [[1, 1, 'fixed'], [2, 4, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 10, fy: -20, mz: 0 } }],
    });
    const result = solve(input);
    expect(result).toBeTruthy();
    checkGlobalEquilibrium(result, input.loads, input);
  });

  it('cantilever with distributed load — equilibrium', () => {
    const L = 5, q = -10;
    const input = makeInput({
      nodes: [[1, 0, 0], [2, L, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
      loads: [{ type: 'distributed', data: { id: 1, elementId: 1, qI: q, qJ: q } }],
    });
    const result = solve(input);
    expect(result).toBeTruthy();
    checkGlobalEquilibrium(result, input.loads, input);
    // R_y = q*L = 50 kN
    expectClose(getReaction(result, 1).ry, 50, 'R_y = qL');
  });
});
