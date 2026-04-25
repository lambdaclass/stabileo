/**
 * 3D Diagram Tests — Verification of analytical diagram equations
 *
 * Tests the computeDiagram3D function with various load cases:
 * 1. Simply supported beam with UDL: V(0)=qL/2, V(L)=-qL/2, M(L/2)=qL²/8
 * 2. Cantilever with UDL: M(0)=-qL²/2 (parabolic)
 * 3. Beam with point load: shear jump at load position, moment slope change
 * 4. Trapezoidal load: cubic moment, quadratic shear
 * 5. Loads in Z plane: same tests for Vz/My
 * 6. N constant, Mx constant: no change with/without transverse loads
 * 7. End values consistency: diagram at t=0 and t=1 match ElementForces3D start/end
 */

import { describe, it, expect } from 'vitest';
import { computeDiagram3D, computeGlobalMax3D, type Diagram3DKind } from '../diagrams-3d';
import { solve3D } from '../wasm-solver';
import type {
  SolverInput3D, SolverNode3D, SolverSection3D, SolverElement3D,
  SolverSupport3D, AnalysisResults3D, ElementForces3D,
} from '../types-3d';
import type { SolverMaterial } from '../types';

// ─── Constants ──────────────────────────────────────────────────

const E = 200_000;       // MPa
const A = 0.01;          // m²
const Iz = 1e-4;         // m⁴
const Iy = 5e-5;         // m⁴
const J = 1e-5;          // m⁴
const L = 5;             // m

// ─── Helpers ────────────────────────────────────────────────────

const steelMat: SolverMaterial = { id: 1, e: E, nu: 0.3 };
const stdSection: SolverSection3D = { id: 1, a: A, iz: Iz, iy: Iy, j: J };

function fixedSupport(nodeId: number): SolverSupport3D {
  return { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
}

function pinnedSupportBeam(nodeId: number): SolverSupport3D {
  return { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: false };
}

function rollerSupportBeam(nodeId: number): SolverSupport3D {
  // Roller in Y: all translations restrained except X, all rotational free except torsion
  return { nodeId, rx: false, ry: true, rz: true, rrx: true, rry: false, rrz: false };
}

function buildInput(
  nodes: SolverNode3D[],
  elements: SolverElement3D[],
  supports: SolverSupport3D[],
  loads: SolverInput3D['loads'] = [],
): SolverInput3D {
  return {
    nodes: new Map(nodes.map(n => [n.id, n])),
    materials: new Map([[1, steelMat]]),
    sections: new Map([[1, stdSection]]),
    elements: new Map(elements.map(e => [e.id, e])),
    supports: new Map(supports.map((s, i) => [i, s])),
    loads,
  };
}

function assertSuccess(result: AnalysisResults3D | string): asserts result is AnalysisResults3D {
  if (typeof result === 'string') throw new Error(`Solver error: ${result}`);
}

function getEF(results: AnalysisResults3D, elemId: number): ElementForces3D {
  return results.elementForces.find(ef => ef.elementId === elemId)!;
}

function frameElement(id: number, nodeI: number, nodeJ: number): SolverElement3D {
  return { id, type: 'frame', nodeI, nodeJ, materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false };
}

/** Find value at specific t in diagram */
function valueAtT(ef: ElementForces3D, kind: Diagram3DKind, targetT: number): number {
  const diagram = computeDiagram3D(ef, kind);
  // Find closest point
  let closest = diagram.points[0];
  let minDist = Math.abs(closest.t - targetT);
  for (const pt of diagram.points) {
    const dist = Math.abs(pt.t - targetT);
    if (dist < minDist) {
      minDist = dist;
      closest = pt;
    }
  }
  return closest.value;
}

// ─── Tests ──────────────────────────────────────────────────────

describe('computeDiagram3D', () => {
  describe('Simply supported beam with UDL in Y', () => {
    const q = 10; // kN/m

    function solveSSBeamUDL() {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [pinnedSupportBeam(1), rollerSupportBeam(2)],
        [{ type: 'distributed', data: { elementId: 1, qYI: -q, qYJ: -q, qZI: 0, qZJ: 0 } }],
      );
      const results = solve3D(input);
      assertSuccess(results);
      return getEF(results, 1);
    }

    it('shear at start ≈ qL/2', () => {
      const ef = solveSSBeamUDL();
      const V0 = valueAtT(ef, 'shearY', 0);
      expect(V0).toBeCloseTo(q * L / 2, 1);
    });

    it('shear at end ≈ -qL/2', () => {
      const ef = solveSSBeamUDL();
      const VL = valueAtT(ef, 'shearY', 1);
      expect(VL).toBeCloseTo(-q * L / 2, 1);
    });

    it('shear at midspan ≈ 0', () => {
      const ef = solveSSBeamUDL();
      const Vmid = valueAtT(ef, 'shearY', 0.5);
      expect(Math.abs(Vmid)).toBeLessThan(0.5); // should be near zero
    });

    it('moment at midspan ≈ qL²/8', () => {
      const ef = solveSSBeamUDL();
      const diagram = computeDiagram3D(ef, 'momentZ');
      // Find midspan value (t ≈ 0.5)
      const midPt = diagram.points.find(p => Math.abs(p.t - 0.5) < 0.01)!;
      const expected = q * L * L / 8; // positive for negative q (convention)
      expect(Math.abs(midPt.value)).toBeCloseTo(expected, 0);
    });

    it('moment at endpoints ≈ 0 (simply supported)', () => {
      const ef = solveSSBeamUDL();
      const M0 = valueAtT(ef, 'momentZ', 0);
      const ML = valueAtT(ef, 'momentZ', 1);
      expect(Math.abs(M0)).toBeLessThan(0.1);
      expect(Math.abs(ML)).toBeLessThan(0.1);
    });

    it('moment diagram is parabolic (max at midspan)', () => {
      const ef = solveSSBeamUDL();
      const diagram = computeDiagram3D(ef, 'momentZ');
      // The max absolute value should be near t=0.5
      const maxPt = diagram.points.reduce((prev, curr) =>
        Math.abs(curr.value) > Math.abs(prev.value) ? curr : prev
      );
      expect(maxPt.t).toBeCloseTo(0.5, 1);
    });
  });

  describe('Cantilever with UDL in Y', () => {
    const q = 10; // kN/m downward

    function solveCantileverUDL() {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1)],
        [{ type: 'distributed', data: { elementId: 1, qYI: -q, qYJ: -q, qZI: 0, qZJ: 0 } }],
      );
      const results = solve3D(input);
      assertSuccess(results);
      return getEF(results, 1);
    }

    it('shear at support (x=0) ≈ qL', () => {
      const ef = solveCantileverUDL();
      const V0 = valueAtT(ef, 'shearY', 0);
      // For cantilever fixed at I, V(0) = total reaction = qL
      expect(Math.abs(V0)).toBeCloseTo(q * L, 1);
    });

    it('shear at free end (x=L) ≈ 0', () => {
      const ef = solveCantileverUDL();
      const VL = valueAtT(ef, 'shearY', 1);
      expect(Math.abs(VL)).toBeLessThan(0.5);
    });

    it('moment at support ≈ qL²/2', () => {
      const ef = solveCantileverUDL();
      const M0 = valueAtT(ef, 'momentZ', 0);
      expect(Math.abs(M0)).toBeCloseTo(q * L * L / 2, 0);
    });

    it('moment at free end ≈ 0', () => {
      const ef = solveCantileverUDL();
      const ML = valueAtT(ef, 'momentZ', 1);
      expect(Math.abs(ML)).toBeLessThan(0.5);
    });
  });

  describe('Beam with point load', () => {
    const P = 20; // kN at midspan

    function solveSSBeamPtLoad() {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [pinnedSupportBeam(1), rollerSupportBeam(2)],
        [{ type: 'pointOnElement', data: { elementId: 1, a: L / 2, py: -P, pz: 0 } }],
      );
      const results = solve3D(input);
      assertSuccess(results);
      return getEF(results, 1);
    }

    it('shear diagram has jump at load position', () => {
      const ef = solveSSBeamPtLoad();
      const diagram = computeDiagram3D(ef, 'shearY');

      // Before load: V = P/2 (positive)
      const vBefore = diagram.points.filter(p => p.t < 0.5 - 0.01);
      for (const pt of vBefore) {
        expect(pt.value).toBeCloseTo(P / 2, 0);
      }

      // After load: V = -P/2
      const vAfter = diagram.points.filter(p => p.t > 0.5 + 0.01);
      for (const pt of vAfter) {
        expect(pt.value).toBeCloseTo(-P / 2, 0);
      }
    });

    it('moment at midspan ≈ PL/4', () => {
      const ef = solveSSBeamPtLoad();
      const Mmid = valueAtT(ef, 'momentZ', 0.5);
      // For simply supported beam with point load P at midspan
      const expected = P * L / 4;
      expect(Math.abs(Mmid)).toBeCloseTo(expected, 0);
    });
  });

  describe('Z-plane loads: Vz and My diagrams', () => {
    const q = 10; // kN/m in Z direction

    function solveSSBeamUDLZ() {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [pinnedSupportBeam(1), rollerSupportBeam(2)],
        [{ type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: -q, qZJ: -q } }],
      );
      const results = solve3D(input);
      assertSuccess(results);
      return getEF(results, 1);
    }

    it('Vz at start ≈ qL/2', () => {
      const ef = solveSSBeamUDLZ();
      const V0 = valueAtT(ef, 'shearZ', 0);
      expect(Math.abs(V0)).toBeCloseTo(q * L / 2, 1);
    });

    it('My at midspan ≈ qL²/8', () => {
      const ef = solveSSBeamUDLZ();
      const Mmid = valueAtT(ef, 'momentY', 0.5);
      expect(Math.abs(Mmid)).toBeCloseTo(q * L * L / 8, 0);
    });
  });

  describe('Axial and torsion diagrams', () => {
    it('axial force is constant for point load', () => {
      const P = 50;
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: P, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }],
      );
      const results = solve3D(input);
      assertSuccess(results);
      const ef = getEF(results, 1);

      const diagram = computeDiagram3D(ef, 'axial');
      // All points should be approximately the same value
      const firstVal = diagram.points[0].value;
      for (const pt of diagram.points) {
        expect(pt.value).toBeCloseTo(firstVal, 2);
      }
    });

    it('torsion is constant for applied torque', () => {
      const M = 10;
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: M, my: 0, mz: 0 } }],
      );
      const results = solve3D(input);
      assertSuccess(results);
      const ef = getEF(results, 1);

      const diagram = computeDiagram3D(ef, 'torsion');
      const firstVal = diagram.points[0].value;
      for (const pt of diagram.points) {
        expect(pt.value).toBeCloseTo(firstVal, 2);
      }
    });
  });

  describe('End values consistency', () => {
    it('diagram start/end values match ElementForces3D for moment Z', () => {
      const q = 10;
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1), fixedSupport(2)],
        [{ type: 'distributed', data: { elementId: 1, qYI: -q, qYJ: -q, qZI: 0, qZJ: 0 } }],
      );
      const results = solve3D(input);
      assertSuccess(results);
      const ef = getEF(results, 1);

      const diagram = computeDiagram3D(ef, 'momentZ');
      const startVal = diagram.points[0].value;
      const endVal = diagram.points[diagram.points.length - 1].value;

      expect(startVal).toBeCloseTo(ef.mzStart, 2);
      expect(endVal).toBeCloseTo(ef.mzEnd, 2);
    });

    it('diagram start/end match for shear Y', () => {
      const q = 10;
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1), fixedSupport(2)],
        [{ type: 'distributed', data: { elementId: 1, qYI: -q, qYJ: -q, qZI: 0, qZJ: 0 } }],
      );
      const results = solve3D(input);
      assertSuccess(results);
      const ef = getEF(results, 1);

      const diagram = computeDiagram3D(ef, 'shearY');
      const startVal = diagram.points[0].value;
      const endVal = diagram.points[diagram.points.length - 1].value;

      expect(startVal).toBeCloseTo(ef.vyStart, 2);
      expect(endVal).toBeCloseTo(ef.vyEnd, 2);
    });
  });

  describe('computeGlobalMax3D', () => {
    it('finds mid-element maximum for parabolic moment', () => {
      const q = 10;
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [pinnedSupportBeam(1), rollerSupportBeam(2)],
        [{ type: 'distributed', data: { elementId: 1, qYI: -q, qYJ: -q, qZI: 0, qZJ: 0 } }],
      );
      const results = solve3D(input);
      assertSuccess(results);

      const globalMax = computeGlobalMax3D(results.elementForces, 'momentZ');
      // For SS beam with UDL, max moment = qL²/8 which is at midspan
      // End moments are 0, so old implementation would get 0
      const expected = q * L * L / 8;
      expect(globalMax).toBeCloseTo(expected, 0);
    });
  });

  describe('Trapezoidal load', () => {
    it('produces non-linear shear (quadratic)', () => {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [pinnedSupportBeam(1), rollerSupportBeam(2)],
        [{ type: 'distributed', data: { elementId: 1, qYI: -5, qYJ: -15, qZI: 0, qZJ: 0 } }],
      );
      const results = solve3D(input);
      assertSuccess(results);
      const ef = getEF(results, 1);

      const diagram = computeDiagram3D(ef, 'shearY');

      // Shear should vary from positive to negative
      const startV = diagram.points[0].value;
      const endV = diagram.points[diagram.points.length - 1].value;

      // Start should be positive (upward reaction), end should be negative
      expect(startV).toBeGreaterThan(0);
      expect(endV).toBeLessThan(0);

      // The diagram should have more than 21 points if point loads present,
      // but at least 21 for regular grid
      expect(diagram.points.length).toBeGreaterThanOrEqual(21);
    });
  });
});
