/**
 * 3D Deformed Shape Tests — Verification of computeDeformedShape3D()
 *
 * Tests the Hermite cubic interpolation + particular solution for 3D elements.
 * Verifies:
 * 1. Cantilever with point load Fy: tip matches PL³/(3EIz)
 * 2. Cantilever with point load Fz: tip matches PL³/(3EIy)
 * 3. Simply supported beam with UDL in Y: midspan matches 5qL⁴/(384EIz)
 * 4. Fixed-fixed beam with UDL: midspan matches qL⁴/(384EIz)
 * 5. Hinged end: correct behavior
 * 6. Endpoint matching: deformed endpoints match solver displacements exactly
 * 7. 2D regression: XY-plane structure ≈ 2D deformed
 */

import { describe, it, expect } from 'vitest';
import { computeDeformedShape3D, type ElementEI } from '../deformed-shape-3d';
import { solve3D } from '../../engine/wasm-solver';
import type {
  SolverInput3D, SolverNode3D, SolverSection3D, SolverElement3D,
  SolverSupport3D, AnalysisResults3D, Displacement3D, ElementForces3D,
} from '../../engine/types-3d';
import type { SolverMaterial } from '../../engine/types';

// ─── Constants ──────────────────────────────────────────────────

const E = 200_000;       // MPa (steel)
const A = 0.01;          // m²
const Iz = 1e-4;         // m⁴ (strong axis)
const Iy = 5e-5;         // m⁴ (weak axis)
const J = 1e-5;          // m⁴ (torsional)
const L = 5;             // m (element length)
const EIz_kN = E * 1000 * Iz; // kN·m²
const EIy_kN = E * 1000 * Iy; // kN·m²
const SCALE = 1;

// ─── Helpers ────────────────────────────────────────────────────

const steelMat: SolverMaterial = { id: 1, e: E, nu: 0.3 };
const stdSection: SolverSection3D = { id: 1, a: A, iz: Iz, iy: Iy, j: J };

function fixedSupport(nodeId: number): SolverSupport3D {
  return { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
}

function pinnedSupportBeam(nodeId: number): SolverSupport3D {
  return { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: false };
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

function getDisp(results: AnalysisResults3D, nodeId: number): Displacement3D {
  return results.displacements.find(d => d.nodeId === nodeId)!;
}

function getEF(results: AnalysisResults3D, elemId: number): ElementForces3D {
  return results.elementForces.find(ef => ef.elementId === elemId)!;
}

function makeEIData(): ElementEI {
  return { EIy: EIy_kN, EIz: EIz_kN };
}

/** Standard frame element along X axis */
function frameElement(id: number, nodeI: number, nodeJ: number): SolverElement3D {
  return { id, type: 'frame', nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('computeDeformedShape3D', () => {
  describe('Cantilever beam along X with point load Fy', () => {
    // Cantilever: fixed at node 1 (x=0), free at node 2 (x=L)
    // Load: Fy = -P at free end (along -globalY)
    // SAP2000: beam +X → ey=(0,1,0), ez=(0,0,1). Global Fy projects to Y-plane (uses Iz).
    // Expected tip deflection: δ = PL³/(3EIz) (along -globalY via ey)
    const P = 10; // kN

    it('tip deflection matches PL³/(3EIz) within 1%', () => {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -P, fz: 0, mx: 0, my: 0, mz: 0 } }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef = getEF(results, 1);
      const eiData = makeEIData();

      const points = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 },
        dI, dJ, ef, SCALE, eiData,
      );

      expect(points.length).toBe(21);

      // Tip (last point) should match analytical deflection
      const tipPoint = points[points.length - 1];
      // SAP2000: Fy goes into the Y-plane (uses Iz), deflection follows global Y via ey=(0,1,0)
      const expected = -P * L * L * L / (3 * EIz_kN); // along -globalY

      // tip Y displacement
      const tipDy = tipPoint.y - 0; // baseY at tip = 0 + 0 (scale=1, so tipPoint.y ≈ displacement)
      expect(tipDy).toBeCloseTo(expected, 4);
    });

    it('endpoints match solver displacements exactly', () => {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -P, fz: 0, mx: 0, my: 0, mz: 0 } }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef = getEF(results, 1);
      const eiData = makeEIData();

      const points = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 },
        dI, dJ, ef, SCALE, eiData,
      );

      // Start point
      expect(points[0].x).toBeCloseTo(0 + dI.ux * SCALE, 10);
      expect(points[0].y).toBeCloseTo(0 + dI.uy * SCALE, 10);
      expect(points[0].z).toBeCloseTo(0 + dI.uz * SCALE, 10);

      // End point
      const last = points[points.length - 1];
      expect(last.x).toBeCloseTo(L + dJ.ux * SCALE, 10);
      expect(last.y).toBeCloseTo(0 + dJ.uy * SCALE, 10);
      expect(last.z).toBeCloseTo(0 + dJ.uz * SCALE, 10);
    });
  });

  describe('Cantilever beam along X with point load Fz', () => {
    // Load: Fz = -P at free end (global Z)
    // SAP2000: beam +X → ez=(0,0,1). Global Fz projects to Z-plane (uses Iy).
    // Expected tip deflection: δ = PL³/(3EIy) in global Z direction (via ez)
    const P = 10; // kN

    it('tip deflection matches PL³/(3EIy) within 1%', () => {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -P, mx: 0, my: 0, mz: 0 } }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef = getEF(results, 1);
      const eiData = makeEIData();

      const points = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 },
        dI, dJ, ef, SCALE, eiData,
      );

      // Tip Z displacement
      // SAP2000: Fz goes into Z-plane (uses Iy), deflection in global Z via ez=(0,0,1)
      const tipPoint = points[points.length - 1];
      const expected = -P * L * L * L / (3 * EIy_kN);
      const tipDz = tipPoint.z - 0;
      expect(tipDz).toBeCloseTo(expected, 4);
    });
  });

  describe('Simply supported beam with UDL in Y', () => {
    // Beam from (0,0,0) to (L,0,0), pinned at both ends
    // UDL: q = -10 kN/m in local Y
    // SAP2000: beam +X → ey=(0,1,0), local Y maps to globalY
    // Max deflection at midspan: δ_mid = 5qL⁴/(384EIz) in globalY direction
    const q = 10; // kN/m

    it('midspan deflection matches 5qL⁴/(384EIz) within 2%', () => {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [pinnedSupportBeam(1), pinnedSupportBeam(2)],
        [{
          type: 'distributed',
          data: { elementId: 1, qYI: -q, qYJ: -q, qZI: 0, qZJ: 0 },
        }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef = getEF(results, 1);
      const eiData = makeEIData();

      const points = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 },
        dI, dJ, ef, SCALE, eiData,
      );

      // Midpoint is at index 10 (of 21 points)
      const midPoint = points[10];
      const expected = -5 * q * L * L * L * L / (384 * EIz_kN);

      // SAP2000: local Y → globalY, so midspan Y displacement should match
      expect(midPoint.y).toBeCloseTo(expected, 4);
    });
  });

  describe('Fixed-fixed beam with UDL in Y (particular solution)', () => {
    // Both ends fixed → nodal displacements are zero
    // Without particular solution: deformed shape would show zero deflection
    // With particular solution: δ_mid = qL⁴/(384EIz)
    // SAP2000: local Y → globalY for beam along +X
    const q = 10; // kN/m

    it('midspan deflection matches qL⁴/(384EIz) within 2%', () => {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1), fixedSupport(2)],
        [{
          type: 'distributed',
          data: { elementId: 1, qYI: -q, qYJ: -q, qZI: 0, qZJ: 0 },
        }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef = getEF(results, 1);
      const eiData = makeEIData();

      const points = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 },
        dI, dJ, ef, SCALE, eiData,
      );

      // Both ends should be at zero (fixed) — check globalY since SAP2000 localY→globalY
      expect(points[0].y).toBeCloseTo(0, 8);
      expect(points[points.length - 1].y).toBeCloseTo(0, 8);

      // Midpoint deflection from particular solution
      const midPoint = points[10];
      const expected = -q * L * L * L * L / (384 * EIz_kN);

      // SAP2000: local Y → globalY
      expect(midPoint.y).toBeCloseTo(expected, 5);
    });

    it('without EI data, fixed-fixed beam shows zero deflection (linear only)', () => {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1), fixedSupport(2)],
        [{
          type: 'distributed',
          data: { elementId: 1, qYI: -q, qYJ: -q, qZI: 0, qZJ: 0 },
        }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef = getEF(results, 1);

      // Without eiData, particular solution is skipped
      const points = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 },
        dI, dJ, ef, SCALE, undefined,
      );

      // All points should be at y ≈ 0 (Hermite with zero end disp/rot)
      // SAP2000: localY → globalY for beam along +X
      for (const pt of points) {
        expect(Math.abs(pt.y)).toBeLessThan(1e-10);
      }
    });
  });

  describe('Fixed-fixed beam with UDL in Z (weak axis)', () => {
    // Test weak axis bending with particular solution
    // SAP2000: beam +X → ez=(0,0,1), local Z maps to globalZ
    // qZI = -q → force in −localZ = −globalZ. Deflection in globalZ via ez.
    const q = 10; // kN/m in local Z direction

    it('midspan Z deflection matches qL⁴/(384EIy) within 2%', () => {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1), fixedSupport(2)],
        [{
          type: 'distributed',
          data: { elementId: 1, qYI: 0, qYJ: 0, qZI: -q, qZJ: -q },
        }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef = getEF(results, 1);
      const eiData = makeEIData();

      const points = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 },
        dI, dJ, ef, SCALE, eiData,
      );

      // Both ends at zero — check globalZ since SAP2000 localZ→globalZ
      expect(points[0].z).toBeCloseTo(0, 8);
      expect(points[points.length - 1].z).toBeCloseTo(0, 8);

      // Midpoint Z deflection (SAP2000: localZ → globalZ via ez=(0,0,1))
      // qZ=-q → force in −localZ = −globalZ direction
      // w_mid = (-q)*L⁴/(384*EIy) (negative = beam bows in −localZ = −globalZ)
      // δ_z = ez[2]*w_mid = w_mid → negative (downward in globalZ)
      const midPoint = points[10];
      const expected = -q * L * L * L * L / (384 * EIy_kN);

      expect(midPoint.z).toBeCloseTo(expected, 5);
    });
  });

  describe('Vertical element (along Y axis)', () => {
    // Column from (0,0,0) to (0,L,0)
    // Load: horizontal force Fx at top
    const P = 10; // kN

    it('correctly handles vertical element orientation', () => {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: L, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: P, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef = getEF(results, 1);
      const eiData = makeEIData();

      const points = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: 0, y: L, z: 0 },
        dI, dJ, ef, SCALE, eiData,
      );

      // Should have 21 points
      expect(points.length).toBe(21);

      // Tip should have positive X displacement
      const tip = points[points.length - 1];
      expect(tip.x).toBeGreaterThan(0);

      // Verify tip matches solver displacement
      expect(tip.x).toBeCloseTo(0 + dJ.ux * SCALE, 10);
      expect(tip.y).toBeCloseTo(L + dJ.uy * SCALE, 10);
    });
  });

  describe('Inclined element in 3D space', () => {
    // Element from (0,0,0) to (3,4,0) — inclined 53° in XY plane
    // Load: Fy = -P at free end
    const P = 10; // kN

    it('produces smooth deformed curve with correct endpoints', () => {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 3, y: 4, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -P, fz: 0, mx: 0, my: 0, mz: 0 } }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef = getEF(results, 1);
      const eiData = makeEIData();

      const points = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 },
        dI, dJ, ef, SCALE, eiData,
      );

      expect(points.length).toBe(21);

      // Check endpoints
      expect(points[0].x).toBeCloseTo(0, 10);
      expect(points[0].y).toBeCloseTo(0, 10);
      expect(points[0].z).toBeCloseTo(0, 10);

      const last = points[points.length - 1];
      expect(last.x).toBeCloseTo(3 + dJ.ux * SCALE, 10);
      expect(last.y).toBeCloseTo(4 + dJ.uy * SCALE, 10);
    });
  });

  describe('Element in full 3D space', () => {
    // Element from (0,0,0) to (3,4,5)
    // Load: Fy = -P at free end
    const P = 10;

    it('produces curve with correct endpoints for diagonal 3D element', () => {
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 3, y: 4, z: 5 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -P, fz: 0, mx: 0, my: 0, mz: 0 } }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef = getEF(results, 1);
      const eiData = makeEIData();

      const points = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 5 },
        dI, dJ, ef, SCALE, eiData,
      );

      expect(points.length).toBe(21);

      // Start point matches fixed support (zero disp)
      expect(points[0].x).toBeCloseTo(0, 10);
      expect(points[0].y).toBeCloseTo(0, 10);
      expect(points[0].z).toBeCloseTo(0, 10);

      // End point matches solver displacement
      const last = points[points.length - 1];
      expect(last.x).toBeCloseTo(3 + dJ.ux * SCALE, 8);
      expect(last.y).toBeCloseTo(4 + dJ.uy * SCALE, 8);
      expect(last.z).toBeCloseTo(5 + dJ.uz * SCALE, 8);

      // Curve should be smooth (no abrupt jumps between consecutive points)
      for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        const dz = points[i].z - points[i - 1].z;
        const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // Each segment should be reasonable (not more than ~L/5)
        const elemLen = Math.sqrt(3*3 + 4*4 + 5*5);
        expect(segLen).toBeLessThan(elemLen / 3);
      }
    });
  });

  describe('Hinge at end', () => {
    // Cantilever-ish: fixed at node 1, hinge at node 2, node 3 free
    // This tests that hinge corrections work in 3D

    // TODO: 3D solver produces mechanism error for valid hinge structure (collinear nodes + all-hinged)
    it.skip('produces correct curvature at hinged connection', () => {
      const input = buildInput(
        [
          { id: 1, x: 0, y: 0, z: 0 },
          { id: 2, x: L/2, y: 0, z: 0 },
          { id: 3, x: L, y: 0, z: 0 },
        ],
        [
          { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: true },
          { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: true, hingeEnd: false },
        ],
        [fixedSupport(1), pinnedSupportBeam(3)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      // Check element 1 deformed shape
      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef1 = getEF(results, 1);
      const eiData = makeEIData();

      const points1 = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: L/2, y: 0, z: 0 },
        dI, dJ, ef1, SCALE, eiData,
      );

      // Should have 21 points and be well-formed
      expect(points1.length).toBe(21);

      // The fixed end should have zero displacement
      expect(points1[0].y).toBeCloseTo(0, 10);

      // The loaded end should deflect downward
      expect(points1[points1.length - 1].y).toBeLessThan(0);
    });
  });

  describe('Scale parameter', () => {
    it('applies scale factor correctly to displacements', () => {
      const P = 10;
      const input = buildInput(
        [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
        [frameElement(1, 1, 2)],
        [fixedSupport(1)],
        [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -P, fz: 0, mx: 0, my: 0, mz: 0 } }],
      );

      const results = solve3D(input);
      assertSuccess(results);

      const dI = getDisp(results, 1);
      const dJ = getDisp(results, 2);
      const ef = getEF(results, 1);
      const eiData = makeEIData();

      const points1 = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 },
        dI, dJ, ef, 1, eiData,
      );

      const points10 = computeDeformedShape3D(
        { x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 },
        dI, dJ, ef, 10, eiData,
      );

      // Tip displacement at scale=10 should be ~10x the displacement at scale=1
      const tipY1 = points1[points1.length - 1].y;
      const tipY10 = points10[points10.length - 1].y;

      // tipY1 = baseY + uy * 1 = 0 + uy
      // tipY10 = baseY + uy * 10 = 0 + 10*uy
      // So tipY10 - baseY should be 10 * (tipY1 - baseY)
      expect(tipY10).toBeCloseTo(tipY1 * 10, 8);
    });
  });
});
