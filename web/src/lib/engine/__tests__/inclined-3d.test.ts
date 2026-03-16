// 3D Inclined Support Tests — Penalty Method
// Tests verify that inclined supports correctly constrain displacement
// along the specified normal direction using the penalty method.

import { describe, it, expect } from 'vitest';
import { solve3D } from '../wasm-solver';
import type {
  SolverInput3D, SolverNode3D, SolverSection3D, SolverElement3D,
  SolverSupport3D, AnalysisResults3D,
} from '../types-3d';
import type { SolverMaterial } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────

/** Standard steel material: E=200000 MPa, nu=0.3 */
const steelMat: SolverMaterial = { id: 1, e: 200000, nu: 0.3 };

/** Standard section: A=0.01m², Iz=8.33e-6m⁴, Iy=4.16e-6m⁴, J=1e-5m⁴ */
const stdSection: SolverSection3D = {
  id: 1, a: 0.01, iz: 8.33e-6, iy: 4.16e-6, j: 1e-5,
};

/** Fixed support (all 6 DOFs restrained) */
function fixedSupport(nodeId: number): SolverSupport3D {
  return {
    nodeId,
    rx: true, ry: true, rz: true,
    rrx: true, rry: true, rrz: true,
  };
}


/** Inclined roller support: constrains displacement along the given normal direction.
 *  All translational DOFs are free (penalty handles the constraint).
 *  Rotational DOFs are free unless specified.
 */
function inclinedRoller(nodeId: number, normalX: number, normalY: number, normalZ: number, opts?: {
  rrx?: boolean; rry?: boolean; rrz?: boolean;
}): SolverSupport3D {
  return {
    nodeId,
    rx: false, ry: false, rz: false,
    rrx: opts?.rrx ?? false, rry: opts?.rry ?? false, rrz: opts?.rrz ?? false,
    isInclined: true,
    normalX, normalY, normalZ,
  };
}

/** Standard roller Y: only Y translation restrained */
function rollerY(nodeId: number): SolverSupport3D {
  return {
    nodeId,
    rx: false, ry: true, rz: false,
    rrx: false, rry: false, rrz: false,
  };
}

/** Standard roller X: only X translation restrained */
function rollerX(nodeId: number): SolverSupport3D {
  return {
    nodeId,
    rx: true, ry: false, rz: false,
    rrx: false, rry: false, rrz: false,
  };
}

/** Build SolverInput3D from components */
function buildInput(
  nodes: SolverNode3D[],
  elements: SolverElement3D[],
  supports: SolverSupport3D[],
  loads: SolverInput3D['loads'] = [],
  materials: SolverMaterial[] = [steelMat],
  sections: SolverSection3D[] = [stdSection],
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

/** Assert result is not a string (error message) */
function assertSuccess(result: AnalysisResults3D | string): asserts result is AnalysisResults3D {
  if (typeof result === 'string') {
    throw new Error(`Solver returned error: ${result}`);
  }
}

/** Get displacement for a specific node */
function getNodeDisp(result: AnalysisResults3D, nodeId: number) {
  return result.displacements.find(d => d.nodeId === nodeId)!;
}

/** Get reaction for a specific node */
function getNodeReaction(result: AnalysisResults3D, nodeId: number) {
  return result.reactions.find(r => r.nodeId === nodeId);
}

// ─── Tests ───────────────────────────────────────────────────────

describe('3D Inclined Supports (Penalty Method)', () => {

  // ─── Test 1: Standard roller (normal = [0,1,0]) behaves like Y-restraint ───
  it('inclined roller with normal [0,1,0] behaves like standard Y-restraint', () => {
    // Cantilever beam along X: node 1 fixed, node 2 free
    // Apply vertical load at node 2
    const L = 5;
    const P = -10; // kN downward

    const nodes: SolverNode3D[] = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: L, y: 0, z: 0 },
    ];
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ];

    // Setup A: standard roller (ry=true)
    const supA: SolverSupport3D[] = [
      fixedSupport(1),
      rollerY(2),
    ];
    const inputA = buildInput(nodes, elements, supA, [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, fz: 0, mx: 0, my: 0, mz: 0 } },
    ]);
    const resultA = solve3D(inputA);
    assertSuccess(resultA);

    // Setup B: inclined roller with normal [0,1,0] (equivalent to Y-restraint)
    const supB: SolverSupport3D[] = [
      fixedSupport(1),
      inclinedRoller(2, 0, 1, 0),
    ];
    const inputB = buildInput(nodes, elements, supB, [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, fz: 0, mx: 0, my: 0, mz: 0 } },
    ]);
    const resultB = solve3D(inputB);
    assertSuccess(resultB);

    // Displacements at node 2 should be very similar
    const dA = getNodeDisp(resultA, 2);
    const dB = getNodeDisp(resultB, 2);

    // Y displacement should be ~0 in both cases (restrained)
    expect(Math.abs(dA.uy)).toBeLessThan(1e-6);
    expect(Math.abs(dB.uy)).toBeLessThan(1e-6);

    // X and Z displacements should be similar
    expect(dB.ux).toBeCloseTo(dA.ux, 3);
    expect(dB.uz).toBeCloseTo(dA.uz, 3);

    // Reactions at node 2 should be similar
    const rA = getNodeReaction(resultA, 2);
    const rB = getNodeReaction(resultB, 2);
    expect(rA).toBeDefined();
    expect(rB).toBeDefined();
    // Reaction should be purely in Y
    expect(rB!.fy).toBeCloseTo(rA!.fy, 1);
    // Reaction X and Z should be ~0 at node 2
    expect(Math.abs(rB!.fx)).toBeLessThan(0.01);
    expect(Math.abs(rB!.fz)).toBeLessThan(0.01);
  });

  // ─── Test 2: Inclined roller at 45° in XY plane ───
  it('inclined roller at 45° in XY plane — displacement is along tangent', () => {
    // Beam along X: node 1 fixed, node 2 with 45° inclined roller
    // Normal = [1/sqrt(2), 1/sqrt(2), 0] — the roller surface is at 45° in XY
    // Under a vertical load, the displacement at node 2 should be along the
    // tangent direction [-1/sqrt(2), 1/sqrt(2), 0] (perpendicular to normal in XY plane)
    const L = 5;
    const P = -10; // kN downward

    const nodes: SolverNode3D[] = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: L, y: 0, z: 0 },
    ];
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ];

    const s2 = Math.SQRT2;
    const normalX = 1 / s2;
    const normalY = 1 / s2;
    const normalZ = 0;

    const supports: SolverSupport3D[] = [
      fixedSupport(1),
      inclinedRoller(2, normalX, normalY, normalZ),
    ];
    const input = buildInput(nodes, elements, supports, [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, fz: 0, mx: 0, my: 0, mz: 0 } },
    ]);
    const result = solve3D(input);
    assertSuccess(result);

    const d2 = getNodeDisp(result, 2);

    // Displacement along normal should be ~0 (constrained by penalty)
    const dispNormal = d2.ux * normalX + d2.uy * normalY + d2.uz * normalZ;
    expect(Math.abs(dispNormal)).toBeLessThan(1e-5);

    // There should be some displacement in the tangential direction
    // tangent in XY = [-normalY, normalX, 0] = [-1/sqrt(2), 1/sqrt(2), 0]
    const tangentX = -normalY;
    const tangentY = normalX;
    const dispTangent = d2.ux * tangentX + d2.uy * tangentY;
    // The tangential displacement should be non-zero (beam flexes and slides along the roller)
    expect(Math.abs(dispTangent)).toBeGreaterThan(1e-8);

    // Z displacement should be ~0 (beam in XY plane, no Z load)
    expect(Math.abs(d2.uz)).toBeLessThan(1e-8);
  });

  // ─── Test 3: Inclined support with normal [1,0,0] equivalent to X-roller ───
  it('inclined roller with normal [1,0,0] is equivalent to X-restraint', () => {
    // Beam along X: node 1 fixed, node 2 with inclined roller normal [1,0,0]
    // This constrains X displacement at node 2
    const L = 5;
    const P = 10; // kN horizontal (in X)

    const nodes: SolverNode3D[] = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: L, y: 0, z: 0 },
    ];
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ];

    // Setup A: standard X roller (rx=true)
    const supA: SolverSupport3D[] = [
      fixedSupport(1),
      rollerX(2),
    ];
    const inputA = buildInput(nodes, elements, supA, [
      { type: 'nodal', data: { nodeId: 2, fx: P, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } },
    ]);
    const resultA = solve3D(inputA);
    assertSuccess(resultA);

    // Setup B: inclined roller with normal [1,0,0]
    const supB: SolverSupport3D[] = [
      fixedSupport(1),
      inclinedRoller(2, 1, 0, 0),
    ];
    const inputB = buildInput(nodes, elements, supB, [
      { type: 'nodal', data: { nodeId: 2, fx: P, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } },
    ]);
    const resultB = solve3D(inputB);
    assertSuccess(resultB);

    // X displacement should be ~0 in both cases
    const dA = getNodeDisp(resultA, 2);
    const dB = getNodeDisp(resultB, 2);
    expect(Math.abs(dA.ux)).toBeLessThan(1e-6);
    expect(Math.abs(dB.ux)).toBeLessThan(1e-6);

    // Y and Z displacements should be similar (both free)
    expect(dB.uy).toBeCloseTo(dA.uy, 3);
    expect(dB.uz).toBeCloseTo(dA.uz, 3);

    // Reactions at node 2: should have X reaction and no Y/Z
    const rA = getNodeReaction(resultA, 2);
    const rB = getNodeReaction(resultB, 2);
    expect(rA).toBeDefined();
    expect(rB).toBeDefined();
    expect(rB!.fx).toBeCloseTo(rA!.fx, 1);
    expect(Math.abs(rB!.fy)).toBeLessThan(0.01);
    expect(Math.abs(rB!.fz)).toBeLessThan(0.01);
  });

  // ─── Test 4: Beam on inclined plane — reaction is along normal ───
  it('reaction from inclined roller is along the normal direction', () => {
    // Simply supported beam along X: node 1 pinned, node 2 inclined roller
    // Apply vertical load P at midspan (via distributed load for simplicity)
    // The reaction at node 2 should be along the normal direction
    const L = 4;
    const P = -20; // kN vertical at node 2

    const nodes: SolverNode3D[] = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: L, y: 0, z: 0 },
    ];
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ];

    // Normal at 30° from vertical in XY plane: [sin(30°), cos(30°), 0] = [0.5, sqrt(3)/2, 0]
    const angle = Math.PI / 6; // 30°
    const normalX = Math.sin(angle);
    const normalY = Math.cos(angle);
    const normalZ = 0;

    // Use fixed support at node 1 to prevent global mechanism.
    // The inclined roller at node 2 only constrains displacement along the normal direction.
    const supports: SolverSupport3D[] = [
      fixedSupport(1),
      inclinedRoller(2, normalX, normalY, normalZ),
    ];
    const input = buildInput(nodes, elements, supports, [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, fz: 0, mx: 0, my: 0, mz: 0 } },
    ]);
    const result = solve3D(input);
    assertSuccess(result);

    // Verify the reaction at node 2 is along the normal direction
    const r2 = getNodeReaction(result, 2);
    expect(r2).toBeDefined();

    // The reaction vector at node 2 should be parallel to the normal
    // i.e., r2.fx / normalX == r2.fy / normalY (and r2.fz ~= 0)
    const reactionMag = Math.sqrt(r2!.fx * r2!.fx + r2!.fy * r2!.fy + r2!.fz * r2!.fz);
    expect(reactionMag).toBeGreaterThan(0.1); // non-trivial reaction

    // Check direction: unit reaction should equal unit normal
    const unitRx = r2!.fx / reactionMag;
    const unitRy = r2!.fy / reactionMag;
    const unitRz = r2!.fz / reactionMag;

    // The reaction should be in the -normal direction (pushing back)
    // or +normal direction depending on load direction
    // Just check that |cross product| is ~0 (parallel)
    const crossX = unitRy * normalZ - unitRz * normalY;
    const crossY = unitRz * normalX - unitRx * normalZ;
    const crossZ = unitRx * normalY - unitRy * normalX;
    const crossMag = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
    expect(crossMag).toBeLessThan(0.01); // reaction is parallel to normal

    // Verify global equilibrium
    const r1 = getNodeReaction(result, 1);
    expect(r1).toBeDefined();
    const sumFx = r1!.fx + r2!.fx;
    const sumFy = r1!.fy + r2!.fy + P;
    const sumFz = r1!.fz + r2!.fz;
    expect(Math.abs(sumFx)).toBeLessThan(0.1);
    expect(Math.abs(sumFy)).toBeLessThan(0.1);
    expect(Math.abs(sumFz)).toBeLessThan(0.1);
  });

  // ─── Test 5: Inclined roller in 3D (arbitrary normal vector) — verify equilibrium ───
  it('inclined roller with arbitrary 3D normal — equilibrium is satisfied', () => {
    // L-shaped frame in 3D:
    // Node 1 (0,0,0) — fixed
    // Node 2 (3,0,0) — middle
    // Node 3 (3,2,1) — inclined roller with arbitrary normal
    const nodes: SolverNode3D[] = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 3, y: 0, z: 0 },
      { id: 3, x: 3, y: 2, z: 1 },
    ];
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ];

    // Arbitrary 3D normal: [2, 3, 1] (will be normalized internally)
    const supports: SolverSupport3D[] = [
      fixedSupport(1),
      inclinedRoller(3, 2, 3, 1),
    ];
    // Apply loads at node 3
    const input = buildInput(nodes, elements, supports, [
      { type: 'nodal', data: { nodeId: 3, fx: 5, fy: -15, fz: 3, mx: 0, my: 0, mz: 0 } },
    ]);
    const result = solve3D(input);
    assertSuccess(result);

    // Verify displacement along normal is ~0 at node 3
    const d3 = getNodeDisp(result, 3);
    const nLen = Math.sqrt(4 + 9 + 1); // sqrt(2² + 3² + 1²) = sqrt(14)
    const nVec = [2 / nLen, 3 / nLen, 1 / nLen];
    const dispNormal = d3.ux * nVec[0] + d3.uy * nVec[1] + d3.uz * nVec[2];
    expect(Math.abs(dispNormal)).toBeLessThan(1e-5);

    // Verify reaction at node 3 is along normal
    const r3 = getNodeReaction(result, 3);
    expect(r3).toBeDefined();
    const reactionMag = Math.sqrt(r3!.fx * r3!.fx + r3!.fy * r3!.fy + r3!.fz * r3!.fz);
    if (reactionMag > 0.01) {
      const unitRx = r3!.fx / reactionMag;
      const unitRy = r3!.fy / reactionMag;
      const unitRz = r3!.fz / reactionMag;
      // Cross product of unit reaction with normal should be ~0
      const crossX = unitRy * nVec[2] - unitRz * nVec[1];
      const crossY = unitRz * nVec[0] - unitRx * nVec[2];
      const crossZ = unitRx * nVec[1] - unitRy * nVec[0];
      const crossMag = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
      expect(crossMag).toBeLessThan(0.01);
    }

    // Verify global force equilibrium
    const r1 = getNodeReaction(result, 1);
    expect(r1).toBeDefined();
    const sumFx = r1!.fx + (r3?.fx ?? 0) + 5;
    const sumFy = r1!.fy + (r3?.fy ?? 0) - 15;
    const sumFz = r1!.fz + (r3?.fz ?? 0) + 3;
    expect(Math.abs(sumFx)).toBeLessThan(0.5);
    expect(Math.abs(sumFy)).toBeLessThan(0.5);
    expect(Math.abs(sumFz)).toBeLessThan(0.5);
  });

});
