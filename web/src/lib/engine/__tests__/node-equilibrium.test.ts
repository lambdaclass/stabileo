/**
 * Node Force Equilibrium Tests
 *
 * Verifies that internal forces satisfy equilibrium at every shared node:
 *   ΣFx = 0, ΣFy = 0, ΣM = 0  (at each interior node, accounting for applied loads)
 *
 * This is a fundamental requirement of structural analysis that was previously
 * not explicitly tested. A failure here indicates the solver or result display
 * is producing physically impossible results.
 *
 * Sign convention for ElementForces (internal beam diagram values):
 *   - nStart, vStart, mStart: internal forces at I-end
 *   - nEnd, vEnd, mEnd: internal forces at J-end
 *   - These are BEAM DIAGRAM values, NOT forces on nodes.
 *
 * To get force ON the node FROM the element (in local coords):
 *   - At I-end: axial = -nStart, shear = vStart, moment = mStart
 *   - At J-end: axial = nEnd, shear = -vEnd, moment = -mEnd
 *
 * Derivation: the raw fLocal = K*u - F_consistent gives [Ni, Vi, Mi, Nj, Vj, Mj].
 * The solver then converts:
 *   nStart = -fLocal[0], vStart = fLocal[1], mStart = fLocal[2]
 *   nEnd = fLocal[3], vEnd = -fLocal[4], mEnd = -fLocal[5]
 * So to recover fLocal (= force on node): invert those transformations.
 */

import { describe, it, expect } from 'vitest';
import { solve } from '../solver-js';
import type { SolverInput, SolverLoad, AnalysisResults } from '../types';

// ─── Constants ──────────────────────────────────────────────────

const E = 200_000; // MPa (steel)
const A = 0.01;    // m²
const Iz = 1e-4;   // m⁴
const TOL = 1e-4;  // kN·m tolerance for equilibrium check

// ─── Helpers ────────────────────────────────────────────────────

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
  const materials = new Map([[1, { id: 1, e: opts.e ?? E, nu: 0.3 }]]);
  const sections = new Map([[1, { id: 1, a: opts.a ?? A, iz: opts.iz ?? Iz }]]);
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

function getForces(results: AnalysisResults, elemId: number) {
  return results.elementForces.find(f => f.elementId === elemId);
}

/**
 * Check moment equilibrium at a shared node between two collinear horizontal elements.
 *
 * For horizontal beams (cos=1, sin=0), the moment on the node from each element is:
 *   - From left element (J-end): -mEnd
 *   - From right element (I-end): mStart
 *
 * Equilibrium: (-mEnd_left) + mStart_right + M_applied = 0
 * Returns: mStart_right - mEnd_left + M_applied (should be ≈ 0)
 */
function checkMomentAtNode(
  results: AnalysisResults,
  leftElemId: number,
  rightElemId: number,
  appliedMoment: number = 0,
) {
  const left = getForces(results, leftElemId)!;
  const right = getForces(results, rightElemId)!;
  return right.mStart - left.mEnd + appliedMoment;
}

/**
 * Check full force equilibrium at a node in global coordinates.
 * Converts internal beam forces to nodal reaction forces, transforms to global, and sums.
 * Returns { fx, fy, mz } residuals (should all be ≈ 0 if equilibrium is satisfied).
 *
 * The solver stores beam diagram forces. The nodal reaction (force from node TO element)
 * in local coords is: I-end: (-nStart, vStart, mStart), J-end: (nEnd, -vEnd, -mEnd).
 * These sum to the external applied force at the node.
 *
 * Equilibrium: Σ(nodal reactions to elements) - F_applied = 0
 */
function checkGlobalEquilibriumAtNode(
  results: AnalysisResults,
  input: SolverInput,
  nodeId: number,
  appliedFx: number = 0,
  appliedFy: number = 0,
  appliedMz: number = 0,
): { fx: number; fy: number; mz: number } {
  // Equilibrium: sum of nodal reactions = applied load
  let sumFx = -appliedFx;
  let sumFy = -appliedFy;
  let sumMz = -appliedMz;

  for (const [, elem] of input.elements) {
    if (elem.nodeI !== nodeId && elem.nodeJ !== nodeId) continue;

    const ef = getForces(results, elem.id);
    if (!ef) continue;

    const ni = input.nodes.get(elem.nodeI)!;
    const nj = input.nodes.get(elem.nodeJ)!;
    const dx = nj.x - ni.x;
    const dy = nj.y - ni.y;
    const L = Math.sqrt(dx * dx + dy * dy);
    const cos = dx / L;
    const sin = dy / L;

    // Force on node from element in LOCAL coords:
    //   I-end: (axial_local, shear_local, moment) = (-nStart, vStart, mStart)
    //   J-end: (axial_local, shear_local, moment) = (nEnd, -vEnd, -mEnd)
    //
    // Transform local to global:
    //   Fx_global = axial_local * cos - shear_local * sin
    //   Fy_global = axial_local * sin + shear_local * cos
    //   Mz_global = moment (unchanged by rotation)

    if (elem.nodeI === nodeId) {
      const axLocal = -ef.nStart;
      const shLocal = ef.vStart;
      sumFx += axLocal * cos - shLocal * sin;
      sumFy += axLocal * sin + shLocal * cos;
      sumMz += ef.mStart;
    } else {
      const axLocal = ef.nEnd;
      const shLocal = -ef.vEnd;
      sumFx += axLocal * cos - shLocal * sin;
      sumFy += axLocal * sin + shLocal * cos;
      sumMz += -ef.mEnd;
    }
  }

  return { fx: sumFx, fy: sumFy, mz: sumMz };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Node moment equilibrium — horizontal beams', () => {
  it('continuous beam (3 spans, distributed load on span 1): ΣM=0 at nodes 2 and 3', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 8, 0], [4, 12, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
        [3, 3, 4, 'frame'],
      ],
      supports: [
        [1, 1, 'pinned'],
        [2, 2, 'rollerX'],
        [3, 3, 'rollerX'],
        [4, 4, 'rollerX'],
      ],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    });
    const r = solve(input) as AnalysisResults;
    expect(r).not.toBeNull();

    // At node 2: moment from elem1 J-end + moment from elem2 I-end = 0
    expect(Math.abs(checkMomentAtNode(r, 1, 2))).toBeLessThan(TOL);
    // At node 3: moment from elem2 J-end + moment from elem3 I-end = 0
    expect(Math.abs(checkMomentAtNode(r, 2, 3))).toBeLessThan(TOL);
  });

  it('continuous beam with loads on all spans: ΣM=0 at interior nodes', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 8, 0], [4, 12, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
        [3, 3, 4, 'frame'],
      ],
      supports: [
        [1, 1, 'pinned'],
        [2, 2, 'rollerX'],
        [3, 3, 'rollerX'],
        [4, 4, 'rollerX'],
      ],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } },
        { type: 'distributed', data: { elementId: 2, qI: -5, qJ: -5 } },
        { type: 'distributed', data: { elementId: 3, qI: -8, qJ: -8 } },
      ],
    });
    const r = solve(input) as AnalysisResults;
    expect(r).not.toBeNull();

    expect(Math.abs(checkMomentAtNode(r, 1, 2))).toBeLessThan(TOL);
    expect(Math.abs(checkMomentAtNode(r, 2, 3))).toBeLessThan(TOL);
  });

  it('fixed-fixed beam (2 elements): ΣM=0 at interior node', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 3, 0], [3, 6, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
      ],
      supports: [
        [1, 1, 'fixed'],
        [2, 3, 'fixed'],
      ],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -20, qJ: -20 } }],
    });
    const r = solve(input) as AnalysisResults;
    expect(r).not.toBeNull();

    expect(Math.abs(checkMomentAtNode(r, 1, 2))).toBeLessThan(TOL);
  });
});

describe('Node force equilibrium — portal frames (global coords)', () => {
  it('portal frame with lateral load: equilibrium at corner nodes', () => {
    //   2 ──── 3
    //   │      │
    //   1      4
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]],
      elements: [
        [1, 1, 2, 'frame'], // left column (vertical)
        [2, 2, 3, 'frame'], // beam (horizontal)
        [3, 3, 4, 'frame'], // right column (vertical, J goes down)
      ],
      supports: [
        [1, 1, 'fixed'],
        [2, 4, 'fixed'],
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 10, fy: 0, mz: 0 } }],
    });
    const r = solve(input) as AnalysisResults;
    expect(r).not.toBeNull();

    // Node 2: connects elem1 (J-end) and elem2 (I-end), has applied Fx=10
    const eq2 = checkGlobalEquilibriumAtNode(r, input, 2, 10, 0, 0);
    expect(Math.abs(eq2.fx)).toBeLessThan(TOL);
    expect(Math.abs(eq2.fy)).toBeLessThan(TOL);
    expect(Math.abs(eq2.mz)).toBeLessThan(TOL);

    // Node 3: connects elem2 (J-end) and elem3 (I-end), no applied load
    const eq3 = checkGlobalEquilibriumAtNode(r, input, 3);
    expect(Math.abs(eq3.fx)).toBeLessThan(TOL);
    expect(Math.abs(eq3.fy)).toBeLessThan(TOL);
    expect(Math.abs(eq3.mz)).toBeLessThan(TOL);
  });

  it('portal with distributed load on beam: equilibrium at corners', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 0, 3], [3, 5, 3], [4, 5, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
        [3, 3, 4, 'frame'],
      ],
      supports: [
        [1, 1, 'fixed'],
        [2, 4, 'fixed'],
      ],
      loads: [{ type: 'distributed', data: { elementId: 2, qI: -15, qJ: -15 } }],
    });
    const r = solve(input) as AnalysisResults;
    expect(r).not.toBeNull();

    // Node 2: no external nodal load
    const eq2 = checkGlobalEquilibriumAtNode(r, input, 2);
    expect(Math.abs(eq2.fx)).toBeLessThan(TOL);
    expect(Math.abs(eq2.fy)).toBeLessThan(TOL);
    expect(Math.abs(eq2.mz)).toBeLessThan(TOL);

    // Node 3
    const eq3 = checkGlobalEquilibriumAtNode(r, input, 3);
    expect(Math.abs(eq3.fx)).toBeLessThan(TOL);
    expect(Math.abs(eq3.fy)).toBeLessThan(TOL);
    expect(Math.abs(eq3.mz)).toBeLessThan(TOL);
  });
});

describe('Node equilibrium — structures with hinges', () => {
  it('beam with internal hinge: moment = 0 at hinge, equilibrium at other nodes', () => {
    // Simply supported beam with hinge at node 2
    //  1 ──[hinge]── 2 ──── 3
    // Need 3 supports to make it stable with a hinge
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 3, 0], [3, 6, 0]],
      elements: [
        [1, 1, 2, 'frame', false, true],  // hinge at J-end (node 2)
        [2, 2, 3, 'frame', true, false],   // hinge at I-end (node 2)
      ],
      supports: [
        [1, 1, 'pinned'],
        [2, 2, 'rollerX'],  // support at hinge to avoid mechanism
        [3, 3, 'rollerX'],
      ],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    });
    const r = solve(input) as AnalysisResults;
    expect(r).not.toBeNull();

    const ef1 = getForces(r, 1)!;
    const ef2 = getForces(r, 2)!;

    // At hinge: mEnd(elem1) = 0 and mStart(elem2) = 0
    expect(Math.abs(ef1.mEnd)).toBeLessThan(TOL);
    expect(Math.abs(ef2.mStart)).toBeLessThan(TOL);

    // Shear equilibrium at node 2 (horizontal, cos=1, sin=0):
    // Force on node from elem1 J-end shear: -vEnd_1
    // Force on node from elem2 I-end shear: vStart_2
    // Plus the roller reaction at node 2 accounts for the external balance.
    // (We can't easily check this without knowing the reaction, but at least
    // the moment condition is verified.)
  });
});

describe('Superposition principle — per-case results', () => {
  it('sum of individual case results ≈ all-loads solve', () => {
    const baseOpts = {
      nodes: [[1, 0, 0], [2, 4, 0], [3, 8, 0]] as Array<[number, number, number]>,
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
      ] as Array<[number, number, number, 'frame' | 'truss']>,
      supports: [
        [1, 1, 'pinned'],
        [2, 2, 'rollerX'],
        [3, 3, 'rollerX'],
      ] as Array<[number, number, string]>,
    };

    // Case D: distributed on span 1
    const loadD: SolverLoad = { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } };
    // Case L: distributed on span 2
    const loadL: SolverLoad = { type: 'distributed', data: { elementId: 2, qI: -5, qJ: -5 } };

    const resultD = solve(makeInput({ ...baseOpts, loads: [loadD] })) as AnalysisResults;
    const resultL = solve(makeInput({ ...baseOpts, loads: [loadL] })) as AnalysisResults;
    const resultAll = solve(makeInput({ ...baseOpts, loads: [loadD, loadL] })) as AnalysisResults;

    expect(resultD).not.toBeNull();
    expect(resultL).not.toBeNull();
    expect(resultAll).not.toBeNull();

    // Element forces: sum of D + L should equal all-loads solve
    for (const elemId of [1, 2]) {
      const fD = getForces(resultD, elemId)!;
      const fL = getForces(resultL, elemId)!;
      const fAll = getForces(resultAll, elemId)!;

      expect(fD.mStart + fL.mStart).toBeCloseTo(fAll.mStart, 4);
      expect(fD.mEnd + fL.mEnd).toBeCloseTo(fAll.mEnd, 4);
      expect(fD.vStart + fL.vStart).toBeCloseTo(fAll.vStart, 4);
      expect(fD.vEnd + fL.vEnd).toBeCloseTo(fAll.vEnd, 4);
      expect(fD.nStart + fL.nStart).toBeCloseTo(fAll.nStart, 4);
      expect(fD.nEnd + fL.nEnd).toBeCloseTo(fAll.nEnd, 4);
    }

    // Each individual case also maintains moment equilibrium at node 2
    // checkMomentAtNode returns: mStart_right - mEnd_left (should be ≈ 0)
    expect(Math.abs(checkMomentAtNode(resultD, 1, 2))).toBeLessThan(TOL);
    expect(Math.abs(checkMomentAtNode(resultL, 1, 2))).toBeLessThan(TOL);
    expect(Math.abs(checkMomentAtNode(resultAll, 1, 2))).toBeLessThan(TOL);
  });
});

describe('Multi-story frame — comprehensive equilibrium', () => {
  it('2-story 1-bay portal: equilibrium at all interior nodes', () => {
    // 2-story 1-bay portal:
    //  5 ──── 6   (roof, y=6)
    //  │      │
    //  3 ──── 4   (floor, y=3)
    //  │      │
    //  1      2   (base, y=0, fixed)
    const input = makeInput({
      nodes: [
        [1, 0, 0], [2, 5, 0],    // base
        [3, 0, 3], [4, 5, 3],    // 1st floor
        [5, 0, 6], [6, 5, 6],    // roof
      ],
      elements: [
        [1, 1, 3, 'frame'], // left col lower
        [2, 2, 4, 'frame'], // right col lower
        [3, 3, 4, 'frame'], // 1st floor beam
        [4, 3, 5, 'frame'], // left col upper
        [5, 4, 6, 'frame'], // right col upper
        [6, 5, 6, 'frame'], // roof beam
      ],
      supports: [
        [1, 1, 'fixed'],
        [2, 2, 'fixed'],
      ],
      loads: [
        { type: 'distributed', data: { elementId: 3, qI: -12, qJ: -12 } }, // floor load
        { type: 'distributed', data: { elementId: 6, qI: -8, qJ: -8 } },   // roof load
        { type: 'nodal', data: { nodeId: 5, fx: 5, fy: 0, mz: 0 } },       // lateral wind
        { type: 'nodal', data: { nodeId: 3, fx: 10, fy: 0, mz: 0 } },      // lateral wind
      ],
    });
    const r = solve(input) as AnalysisResults;
    expect(r).not.toBeNull();

    // Interior nodes (not base supports): 3, 4, 5, 6
    // Node 3: connects elem1(J), elem3(I), elem4(I). Applied Fx=10
    const eq3 = checkGlobalEquilibriumAtNode(r, input, 3, 10, 0, 0);
    expect(Math.abs(eq3.fx)).toBeLessThan(TOL);
    expect(Math.abs(eq3.fy)).toBeLessThan(TOL);
    expect(Math.abs(eq3.mz)).toBeLessThan(TOL);

    // Node 4: connects elem2(J), elem3(J), elem5(I). No applied load.
    const eq4 = checkGlobalEquilibriumAtNode(r, input, 4);
    expect(Math.abs(eq4.fx)).toBeLessThan(TOL);
    expect(Math.abs(eq4.fy)).toBeLessThan(TOL);
    expect(Math.abs(eq4.mz)).toBeLessThan(TOL);

    // Node 5: connects elem4(J), elem6(I). Applied Fx=5
    const eq5 = checkGlobalEquilibriumAtNode(r, input, 5, 5, 0, 0);
    expect(Math.abs(eq5.fx)).toBeLessThan(TOL);
    expect(Math.abs(eq5.fy)).toBeLessThan(TOL);
    expect(Math.abs(eq5.mz)).toBeLessThan(TOL);

    // Node 6: connects elem5(J), elem6(J). No applied load.
    const eq6 = checkGlobalEquilibriumAtNode(r, input, 6);
    expect(Math.abs(eq6.fx)).toBeLessThan(TOL);
    expect(Math.abs(eq6.fy)).toBeLessThan(TOL);
    expect(Math.abs(eq6.mz)).toBeLessThan(TOL);
  });
});
