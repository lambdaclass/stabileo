/**
 * Tests for element splitting with hinges.
 *
 * Verifies that manually constructing split elements (as splitElementAtPoint would produce)
 * yields correct solver results for hinges, load redistribution, and multi-bar nodes.
 *
 * KEY STRUCTURAL INSIGHT:
 * A hinge at an internal node of a collinear beam reduces the static degree by 1.
 * For a simply-supported beam split at midpoint with one hinge, the degree becomes -1 (mechanism)
 * unless there's a support at the hinge node or the bars are non-collinear.
 * This is physically correct: a hinge in a simply-supported beam = a mechanism.
 */

import { describe, it, expect } from 'vitest';
import { solve } from '../solver-js';
import type { SolverInput, SolverSupport, SolverLoad } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────

function makeInput(opts: {
  nodes: Array<{ id: number; x: number; y: number }>;
  elements: Array<{ id: number; nodeI: number; nodeJ: number; type?: 'frame' | 'truss'; hingeStart?: boolean; hingeEnd?: boolean }>;
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
      hingeStart: e.hingeStart ?? false,
      hingeEnd: e.hingeEnd ?? false,
    }])),
    supports: new Map(opts.supports.map(s => [s.id, s])),
    loads: opts.loads,
  };
}

function nodalLoad(nodeId: number, fx: number, fy: number, mz = 0): SolverLoad {
  return { type: 'nodal', data: { nodeId, fx, fy, mz } };
}

function distLoad(elementId: number, qI: number, qJ?: number): SolverLoad {
  return { type: 'distributed', data: { elementId, qI, qJ: qJ ?? qI } };
}

function pointOnElemLoad(elementId: number, a: number, p: number): SolverLoad {
  return { type: 'pointOnElement', data: { elementId, a, p } };
}

function thermalLoad(elementId: number, dtUniform: number, dtGradient: number): SolverLoad {
  return { type: 'thermal', data: { elementId, dtUniform, dtGradient } };
}

function getReaction(results: ReturnType<typeof solve>, nodeId: number) {
  return results.reactions?.find(r => r.nodeId === nodeId);
}

function getForces(results: ReturnType<typeof solve>, elemId: number) {
  return results.elementForces?.find(f => f.elementId === elemId);
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('Hinge at supported node (Gerber beam pattern)', () => {

  it('double hinge at supported node: M=0 at hinge', () => {
    // Both elements hinged at node 2, which has a roller support → stable
    // 1----2----3
    // △    ○    ○
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 4, y: 0 },
        { id: 3, x: 8, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2, hingeEnd: true },
        { id: 2, nodeI: 2, nodeJ: 3, hingeStart: true },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'rollerX' },
        { id: 3, nodeId: 3, type: 'rollerX' },
      ],
      loads: [distLoad(1, -10), distLoad(2, -10)],
    });

    const results = solve(input);

    const f1 = getForces(results, 1)!;
    const f2 = getForces(results, 2)!;
    expect(Math.abs(f1.mEnd)).toBeLessThan(0.01);
    expect(Math.abs(f2.mStart)).toBeLessThan(0.01);

    // Equilibrium: 10 * 8 = 80 kN
    const totalRy = results.reactions!.reduce((s, r) => s + r.ry, 0);
    expect(totalRy).toBeCloseTo(80, 0);
  });

  it('3-span Gerber beam with hinge at interior support', () => {
    // 1----2----3----4
    // △    ○    ○    ○   hinge at node 3
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 0 },
        { id: 3, x: 6, y: 0 },
        { id: 4, x: 9, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 3, hingeEnd: true },
        { id: 3, nodeI: 3, nodeJ: 4, hingeStart: true },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'rollerX' },
        { id: 3, nodeId: 3, type: 'rollerX' },
        { id: 4, nodeId: 4, type: 'rollerX' },
      ],
      loads: [distLoad(1, -10), distLoad(2, -10), distLoad(3, -10)],
    });

    const results = solve(input);

    const f2 = getForces(results, 2)!;
    const f3 = getForces(results, 3)!;
    expect(Math.abs(f2.mEnd)).toBeLessThan(0.01);
    expect(Math.abs(f3.mStart)).toBeLessThan(0.01);

    // Total: 10 * 9 = 90 kN
    const totalRy = results.reactions!.reduce((s, r) => s + r.ry, 0);
    expect(totalRy).toBeCloseTo(90, 0);
  });

  it('single hinge on fixed-end beam: M=0 at hinge end, fixed end has moment', () => {
    // Fixed-roller beam split at midpoint, hinge only on left element's end
    // 1----2----3
    // ▣         ○
    // hingeEnd on elem1 only → elem1 is fixed-pin, elem2 is pin-roller at node 3
    // Node 2 has 1 hinge, 2 frame elements, c = min(1,1) = 1, degree = 6+4-9-1 = 0 ✓
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 0 },
        { id: 3, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2, hingeEnd: true },
        { id: 2, nodeI: 2, nodeJ: 3 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 3, type: 'rollerX' },
      ],
      loads: [distLoad(1, -10), distLoad(2, -10)],
    });

    const results = solve(input);

    // M=0 at hinge end of elem 1
    const f1 = getForces(results, 1)!;
    expect(Math.abs(f1.mEnd)).toBeLessThan(0.01);

    // Fixed end has moment
    expect(Math.abs(f1.mStart)).toBeGreaterThan(1);

    // Equilibrium: 10 * 6 = 60 kN
    const totalRy = results.reactions!.reduce((s, r) => s + r.ry, 0);
    expect(totalRy).toBeCloseTo(60, 0);
  });
});

describe('Mechanism detection with hinges', () => {

  it('double hinge at unsupported collinear node: mechanism', () => {
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 0 },
        { id: 3, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2, hingeEnd: true },
        { id: 2, nodeI: 2, nodeJ: 3, hingeStart: true },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 3, type: 'rollerX' },
      ],
      loads: [nodalLoad(2, 0, -20)],
    });

    expect(() => solve(input)).toThrow(/[Mm]echanism/);
  });

  it('single hinge at internal collinear node of simply-supported beam: mechanism', () => {
    // pinned + rollerX = 3 DOF restrained, 3 nodes × 3 = 9, 2 frame elements
    // degree = 6 + 3 - 9 - 1 = -1 → mechanism
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 0 },
        { id: 3, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2, hingeEnd: true },
        { id: 2, nodeI: 2, nodeJ: 3 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 3, type: 'rollerX' },
      ],
      loads: [distLoad(1, -10)],
    });

    expect(() => solve(input)).toThrow(/[Mm]echanism/);
  });

  it('cantilever split with double hinge: mechanism', () => {
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 2, y: 0 },
        { id: 3, x: 4, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2, hingeEnd: true },
        { id: 2, nodeI: 2, nodeJ: 3, hingeStart: true },
      ],
      supports: [{ id: 1, nodeId: 1, type: 'fixed' }],
      loads: [nodalLoad(3, 0, -10)],
    });

    expect(() => solve(input)).toThrow(/[Mm]echanism/);
  });
});

describe('Load redistribution (no hinge, continuous split)', () => {

  it('uniform distributed load: split matches unsplit', () => {
    const inputUnsplit = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 6, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'rollerX' },
      ],
      loads: [distLoad(1, -10)],
    });

    const inputSplit = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 3, y: 0 }, { id: 3, x: 6, y: 0 }],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 3 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 3, type: 'rollerX' },
      ],
      loads: [distLoad(1, -10), distLoad(2, -10)],
    });

    const r1 = solve(inputUnsplit);
    const r2 = solve(inputSplit);

    expect(getReaction(r2, 1)!.ry).toBeCloseTo(getReaction(r1, 1)!.ry, 4);
    expect(getReaction(r2, 3)!.ry).toBeCloseTo(getReaction(r1, 2)!.ry, 4);
  });

  it('trapezoidal load: interpolated split matches unsplit', () => {
    const inputUnsplit = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 6, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'rollerX' },
      ],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -20 } }],
    });

    const inputSplit = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 3, y: 0 }, { id: 3, x: 6, y: 0 }],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 3 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 3, type: 'rollerX' },
      ],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -15 } },
        { type: 'distributed', data: { elementId: 2, qI: -15, qJ: -20 } },
      ],
    });

    const r1 = solve(inputUnsplit);
    const r2 = solve(inputSplit);

    // Total load = 90 kN
    expect(r1.reactions!.reduce((s, r) => s + r.ry, 0)).toBeCloseTo(90, 0);
    expect(r2.reactions!.reduce((s, r) => s + r.ry, 0)).toBeCloseTo(90, 0);
    expect(getReaction(r2, 1)!.ry).toBeCloseTo(getReaction(r1, 1)!.ry, 2);
  });

  it('point load redistribution: correct sub-element assignment', () => {
    const inputUnsplit = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 6, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'rollerX' },
      ],
      loads: [pointOnElemLoad(1, 2, -30), pointOnElemLoad(1, 5, -20)],
    });

    const inputSplit = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 3, y: 0 }, { id: 3, x: 6, y: 0 }],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 3 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 3, type: 'rollerX' },
      ],
      loads: [pointOnElemLoad(1, 2, -30), pointOnElemLoad(2, 2, -20)],
    });

    const r1 = solve(inputUnsplit);
    const r2 = solve(inputSplit);

    expect(r1.reactions!.reduce((s, r) => s + r.ry, 0)).toBeCloseTo(50, 0);
    expect(r2.reactions!.reduce((s, r) => s + r.ry, 0)).toBeCloseTo(50, 0);
    expect(getReaction(r2, 1)!.ry).toBeCloseTo(getReaction(r1, 1)!.ry, 2);
  });

  it('thermal load: split matches unsplit', () => {
    const inputUnsplit = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 6, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 2, type: 'rollerX' },
      ],
      loads: [thermalLoad(1, 30, 10)],
    });

    const inputSplit = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 3, y: 0 }, { id: 3, x: 6, y: 0 }],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 3 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 3, type: 'rollerX' },
      ],
      loads: [thermalLoad(1, 30, 10), thermalLoad(2, 30, 10)],
    });

    const r1 = solve(inputUnsplit);
    const r2 = solve(inputSplit);

    expect(getReaction(r2, 1)!.rx).toBeCloseTo(getReaction(r1, 1)!.rx, 4);
  });
});

describe('Hinge preservation at original endpoints', () => {

  it('hingeStart preserved on elemA after split', () => {
    // Fixed-fixed beam split at midpoint. Original has hingeStart.
    // elemA: hingeStart=true → pin-fixed behavior on left half
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 0 },
        { id: 3, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2, hingeStart: true },
        { id: 2, nodeI: 2, nodeJ: 3 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 3, type: 'fixed' },
      ],
      loads: [distLoad(1, -10), distLoad(2, -10)],
    });

    const results = solve(input);

    // M=0 at hinged start
    const f1 = getForces(results, 1)!;
    expect(Math.abs(f1.mStart)).toBeLessThan(0.01);

    // Fixed end has moment
    const f2 = getForces(results, 2)!;
    expect(Math.abs(f2.mEnd)).toBeGreaterThan(1);
  });

  it('hingeEnd preserved on elemB after split', () => {
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 0 },
        { id: 3, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 3, hingeEnd: true },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 3, type: 'pinned' },
      ],
      loads: [distLoad(1, -10), distLoad(2, -10)],
    });

    const results = solve(input);

    const f2 = getForces(results, 2)!;
    expect(Math.abs(f2.mEnd)).toBeLessThan(0.01);

    const f1 = getForces(results, 1)!;
    expect(Math.abs(f1.mStart)).toBeGreaterThan(1);
  });
});

describe('Multi-bar nodes with selective hinges', () => {

  it('portal frame: hinge on beam-column joint', () => {
    //   2 -------- 3
    //   |          |
    //   1          4
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 0, y: 4 },
        { id: 3, x: 6, y: 4 },
        { id: 4, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 3, hingeStart: true },
        { id: 3, nodeI: 3, nodeJ: 4 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 4, type: 'fixed' },
      ],
      loads: [distLoad(2, -15)],
    });

    const results = solve(input);

    const fBeam = getForces(results, 2)!;
    expect(Math.abs(fBeam.mStart)).toBeLessThan(0.01);
    expect(Math.abs(fBeam.mEnd)).toBeGreaterThan(1);

    const totalRx = results.reactions!.reduce((s, r) => s + r.rx, 0);
    expect(Math.abs(totalRx)).toBeLessThan(0.01);
  });

  it('T-junction: 3 bars at one node, one hinged', () => {
    //      3
    //      |  (hinged at bottom)
    // 1 ---2--- 4
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 0 },
        { id: 3, x: 3, y: 3 },
        { id: 4, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 3, hingeStart: true },
        { id: 3, nodeI: 2, nodeJ: 4 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 3, type: 'pinned' },
        { id: 3, nodeId: 4, type: 'rollerX' },
      ],
      loads: [nodalLoad(2, 0, -20)],
    });

    const results = solve(input);

    const fCol = getForces(results, 2)!;
    expect(Math.abs(fCol.mStart)).toBeLessThan(0.01);

    const fLeft = getForces(results, 1)!;
    expect(Math.abs(fLeft.mEnd)).toBeGreaterThan(0.1);

    const totalRy = results.reactions!.reduce((s, r) => s + r.ry, 0);
    expect(totalRy).toBeCloseTo(20, 0);
  });
});

describe('Three-hinge arch', () => {

  it('non-collinear double hinge at crown: stable', () => {
    //      2 (crown)
    //     / \
    //    1   3
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 4 },
        { id: 3, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2, hingeEnd: true },
        { id: 2, nodeI: 2, nodeJ: 3, hingeStart: true },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 3, type: 'pinned' },
      ],
      loads: [nodalLoad(2, 0, -20)],
    });

    const results = solve(input);

    const f1 = getForces(results, 1)!;
    const f2 = getForces(results, 2)!;
    expect(Math.abs(f1.mEnd)).toBeLessThan(0.01);
    expect(Math.abs(f2.mStart)).toBeLessThan(0.01);

    const totalRy = results.reactions!.reduce((s, r) => s + r.ry, 0);
    expect(totalRy).toBeCloseTo(20, 0);
  });
});

describe('Split edge cases and helpers', () => {

  it('split element with no loads: clean sub-elements', () => {
    // No loads at all, just verify split structure solves without error
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 0 },
        { id: 3, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 3 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 3, type: 'rollerX' },
      ],
      loads: [],
    });

    const results = solve(input);
    // No loads → zero reactions (except maybe tiny numerical noise)
    const totalRy = results.reactions!.reduce((s, r) => s + Math.abs(r.ry), 0);
    expect(totalRy).toBeLessThan(0.001);
  });

  it('node with 1 bar: no hinge condition possible at that node', () => {
    // Cantilever: node 2 has only 1 element connected
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 4, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const results = solve(input);
    // Standard cantilever: Ry = 10, M = 10*4 = 40
    expect(getReaction(results, 1)!.ry).toBeCloseTo(10, 2);
    const f = getForces(results, 1)!;
    expect(Math.abs(f.mStart)).toBeCloseTo(40, 0);
    expect(Math.abs(f.mEnd)).toBeLessThan(0.01);
  });

  it('node with 3 bars: 2 elements hinged, 1 rigid → hinged M=0', () => {
    //      3
    //      |  (hinged at top of column)
    // 1 ---2--- 4
    //      column hinge at start, right beam hinge at start
    // Only left beam (1→2) is rigid at node 2
    // Since both other elements are hinged, node 2 effectively has no moment
    // continuity partner → all three elements have M≈0 at node 2
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 0 },
        { id: 3, x: 3, y: 3 },
        { id: 4, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },  // rigid at node 2
        { id: 2, nodeI: 2, nodeJ: 3, hingeStart: true },  // hinged at node 2
        { id: 3, nodeI: 2, nodeJ: 4, hingeStart: true },  // hinged at node 2
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 3, type: 'pinned' },
        { id: 3, nodeId: 4, type: 'pinned' },
      ],
      loads: [distLoad(1, -10)],
    });

    const results = solve(input);

    // Both hinged elements have M=0 at their start (node 2)
    expect(Math.abs(getForces(results, 2)!.mStart)).toBeLessThan(0.01);
    expect(Math.abs(getForces(results, 3)!.mStart)).toBeLessThan(0.01);

    // Elem 1 is the only rigid one at node 2 but has no partner to share moment with,
    // so it also has M≈0 at node 2 (acts like a pin due to equilibrium)
    expect(Math.abs(getForces(results, 1)!.mEnd)).toBeLessThan(0.01);

    // Fixed end (node 1) develops moment from the distributed load
    expect(Math.abs(getForces(results, 1)!.mStart)).toBeGreaterThan(1);

    const totalRy = results.reactions!.reduce((s, r) => s + r.ry, 0);
    expect(totalRy).toBeCloseTo(30, 0);
  });

  it('split with selective hinges: hingeStart on elem A preserved', () => {
    // Fixed-pinned beam split at midpoint, with hingeStart on original element
    // After split: elemA has hingeStart=true, continuous at midpoint
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 2, y: 0 },
        { id: 3, x: 4, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2, hingeStart: true },  // preserved from original
        { id: 2, nodeI: 2, nodeJ: 3 },  // continuous
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 3, type: 'fixed' },
      ],
      loads: [distLoad(1, -10), distLoad(2, -10)],
    });

    const results = solve(input);

    // M=0 at hinged start (node 1)
    expect(Math.abs(getForces(results, 1)!.mStart)).toBeLessThan(0.01);
    // Fixed end (node 3) has moment
    expect(Math.abs(getForces(results, 2)!.mEnd)).toBeGreaterThan(1);
    // Equilibrium
    const totalRy = results.reactions!.reduce((s, r) => s + r.ry, 0);
    expect(totalRy).toBeCloseTo(40, 0);
  });

  it('continuous split at 25% of beam: reactions match unsplit', () => {
    // Verify non-midpoint split also produces correct results
    const inputUnsplit = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 8, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'rollerX' },
      ],
      loads: [distLoad(1, -10)],
    });

    // Split at t=0.25 → node at x=2
    const inputSplit = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 2, y: 0 }, { id: 3, x: 8, y: 0 }],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 3 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 3, type: 'rollerX' },
      ],
      loads: [distLoad(1, -10), distLoad(2, -10)],
    });

    const r1 = solve(inputUnsplit);
    const r2 = solve(inputSplit);

    expect(getReaction(r2, 1)!.ry).toBeCloseTo(getReaction(r1, 1)!.ry, 4);
    expect(getReaction(r2, 3)!.ry).toBeCloseTo(getReaction(r1, 2)!.ry, 4);
  });
});
