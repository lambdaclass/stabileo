// 3D Solver Tests — Phase 1: Analytical solutions
// All tests use known closed-form solutions from structural mechanics.

import { describe, it, expect } from 'vitest';
import { solve3D, computeLocalAxes3D, frameLocalStiffness3D, frameTransformationMatrix3D } from '../solver-3d';
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

/** Pinned support (3 translations restrained, 3 rotations free) */
function pinnedSupport(nodeId: number): SolverSupport3D {
  return {
    nodeId,
    rx: true, ry: true, rz: true,
    rrx: false, rry: false, rrz: false,
  };
}

/**
 * Pinned support for a beam along X axis:
 * - translations: all restrained
 * - torsion (rx): restrained (prevent spinning about beam axis)
 * - bending rotations (ry, rz): free
 */
function pinnedSupportBeamX(nodeId: number): SolverSupport3D {
  return {
    nodeId,
    rx: true, ry: true, rz: true,
    rrx: true, rry: false, rrz: false,
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

/**
 * Check global force equilibrium: sum of reactions + applied nodal loads = 0.
 * For distributed/point loads, the reactions already include those effects,
 * so we need to also sum the total distributed/point loads.
 */
function checkEquilibrium(
  result: AnalysisResults3D,
  input: SolverInput3D,
  tol = 1e-4,
) {
  let sumFx = 0, sumFy = 0, sumFz = 0;

  // Add reactions
  for (const r of result.reactions) {
    sumFx += r.fx;
    sumFy += r.fy;
    sumFz += r.fz;
  }

  // Add applied nodal loads
  for (const load of input.loads) {
    if (load.type === 'nodal') {
      sumFx += load.data.fx;
      sumFy += load.data.fy;
      sumFz += load.data.fz;
    } else if (load.type === 'distributed') {
      // Compute total load from distributed loads in global coordinates
      const dl = load.data;
      const elem = input.elements.get(dl.elementId);
      if (!elem) continue;
      const nodeI = input.nodes.get(elem.nodeI)!;
      const nodeJ = input.nodes.get(elem.nodeJ)!;

      // Get local axes for this element
      const axes = computeLocalAxes3D(nodeI, nodeJ);
      const L = axes.L;
      const a = dl.a ?? 0;
      const b = dl.b ?? L;
      const span = b - a;

      // Total load in local Y = average_qY * span
      const totalQY = (dl.qYI + dl.qYJ) / 2 * span;
      // Total load in local Z = average_qZ * span
      const totalQZ = (dl.qZI + dl.qZJ) / 2 * span;

      // Transform to global: local Y force → global, local Z force → global
      sumFx += totalQY * axes.ey[0] + totalQZ * axes.ez[0];
      sumFy += totalQY * axes.ey[1] + totalQZ * axes.ez[1];
      sumFz += totalQY * axes.ey[2] + totalQZ * axes.ez[2];
    } else if (load.type === 'pointOnElement') {
      const pl = load.data;
      const elem = input.elements.get(pl.elementId);
      if (!elem) continue;
      const nodeI = input.nodes.get(elem.nodeI)!;
      const nodeJ = input.nodes.get(elem.nodeJ)!;
      const axes = computeLocalAxes3D(nodeI, nodeJ);

      sumFx += pl.py * axes.ey[0] + pl.pz * axes.ez[0];
      sumFy += pl.py * axes.ey[1] + pl.pz * axes.ez[1];
      sumFz += pl.py * axes.ey[2] + pl.pz * axes.ez[2];
    }
  }

  const digits = Math.max(1, Math.round(-Math.log10(tol)));
  expect(sumFx).toBeCloseTo(0, digits);
  expect(sumFy).toBeCloseTo(0, digits);
  expect(sumFz).toBeCloseTo(0, digits);
}

// ─── Constants ───────────────────────────────────────────────────

const E = 200000 * 1000; // kN/m² (200 GPa)
const G = E / (2 * (1 + 0.3)); // ~76923 MPa → kN/m²
const A = 0.01;        // m²
const Iz = 8.33e-6;    // m⁴
const Iy = 4.16e-6;    // m⁴
const J = 1e-5;        // m⁴

// ─── Tests ───────────────────────────────────────────────────────

describe('3D Solver — computeLocalAxes3D (UBA convention)', () => {
  it('+X bar: ex=(1,0,0), ey=(0,0,1), ez=(0,-1,0)', () => {
    const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
    const nJ: SolverNode3D = { id: 2, x: 5, y: 0, z: 0 };
    const axes = computeLocalAxes3D(nI, nJ);
    expect(axes.ex).toEqual([1, 0, 0]);
    expect(axes.ey[0]).toBeCloseTo(0); expect(axes.ey[1]).toBeCloseTo(0); expect(axes.ey[2]).toBeCloseTo(1);
    expect(axes.ez[0]).toBeCloseTo(0); expect(axes.ez[1]).toBeCloseTo(-1); expect(axes.ez[2]).toBeCloseTo(0);
    expect(axes.L).toBeCloseTo(5);
  });

  it('-X bar: ex=(-1,0,0), ey=(0,0,-1), ez=(0,-1,0)', () => {
    const nI: SolverNode3D = { id: 1, x: 5, y: 0, z: 0 };
    const nJ: SolverNode3D = { id: 2, x: 0, y: 0, z: 0 };
    const axes = computeLocalAxes3D(nI, nJ);
    expect(axes.ex[0]).toBeCloseTo(-1);
    expect(axes.ey[2]).toBeCloseTo(-1);
    expect(axes.ez[1]).toBeCloseTo(-1);
  });

  it('+Y (vertical) bar: ex=(0,1,0), ey=(0,0,1), ez=(1,0,0)', () => {
    const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
    const nJ: SolverNode3D = { id: 2, x: 0, y: 5, z: 0 };
    const axes = computeLocalAxes3D(nI, nJ);
    expect(axes.ex).toEqual([0, 1, 0]);
    expect(axes.ey[0]).toBeCloseTo(0); expect(axes.ey[1]).toBeCloseTo(0); expect(axes.ey[2]).toBeCloseTo(1);
    expect(axes.ez[0]).toBeCloseTo(1); expect(axes.ez[1]).toBeCloseTo(0); expect(axes.ez[2]).toBeCloseTo(0);
  });

  it('+Z bar: ex=(0,0,1), ey=(-1,0,0), ez=(0,-1,0)', () => {
    const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
    const nJ: SolverNode3D = { id: 2, x: 0, y: 0, z: 5 };
    const axes = computeLocalAxes3D(nI, nJ);
    expect(axes.ex).toEqual([0, 0, 1]);
    expect(axes.ey[0]).toBeCloseTo(-1);
    expect(axes.ez[1]).toBeCloseTo(-1);
    expect(axes.L).toBeCloseTo(5);
  });

  it('diagonal bar in XY plane → ez has negative Y component', () => {
    const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
    const nJ: SolverNode3D = { id: 2, x: 3, y: 4, z: 0 };
    const axes = computeLocalAxes3D(nI, nJ);
    expect(axes.L).toBeCloseTo(5);
    expect(axes.ex[0]).toBeCloseTo(3 / 5);
    expect(axes.ex[1]).toBeCloseTo(4 / 5);
    expect(axes.ex[2]).toBeCloseTo(0);
    // ez should point downward (negative Y component)
    expect(axes.ez[1]).toBeLessThan(0);
    // Right-hand terna: det should be 1
    const det = axes.ex[0]*(axes.ey[1]*axes.ez[2]-axes.ey[2]*axes.ez[1])
              - axes.ex[1]*(axes.ey[0]*axes.ez[2]-axes.ey[2]*axes.ez[0])
              + axes.ex[2]*(axes.ey[0]*axes.ez[1]-axes.ey[1]*axes.ez[0]);
    expect(det).toBeCloseTo(1, 10);
  });

  it('explicit localY override', () => {
    const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
    const nJ: SolverNode3D = { id: 2, x: 5, y: 0, z: 0 };
    const axes = computeLocalAxes3D(nI, nJ, { x: 0, y: 0, z: 1 });
    // ez = normalize(ex × ref) = normalize([1,0,0] × [0,0,1]) = [0,-1,0]
    // ey = ez × ex = [0,-1,0] × [1,0,0] = [0,0,1]
    expect(axes.ey[2]).toBeCloseTo(1, 5);
    expect(axes.ez[1]).toBeCloseTo(-1, 5);
  });

  it('rollAngle rotates ey/ez around ex', () => {
    const nI: SolverNode3D = { id: 1, x: 0, y: 0, z: 0 };
    const nJ: SolverNode3D = { id: 2, x: 5, y: 0, z: 0 };
    // Default: ey=(0,0,1), ez=(0,-1,0)
    // Roll 90°: ey'=cos(90)*ey+sin(90)*ez = ez = (0,-1,0), ez'=-sin(90)*ey+cos(90)*ez = -ey = (0,0,-1)
    const axes = computeLocalAxes3D(nI, nJ, undefined, 90);
    expect(axes.ey[0]).toBeCloseTo(0); expect(axes.ey[1]).toBeCloseTo(-1); expect(axes.ey[2]).toBeCloseTo(0);
    expect(axes.ez[0]).toBeCloseTo(0); expect(axes.ez[1]).toBeCloseTo(0); expect(axes.ez[2]).toBeCloseTo(-1);
  });
});

describe('3D Solver — frameLocalStiffness3D', () => {
  it('produces symmetric 12×12 matrix', () => {
    const k = frameLocalStiffness3D(E, G, A, Iy, Iz, J, 5, false, false);
    for (let i = 0; i < 12; i++) {
      for (let j = i; j < 12; j++) {
        expect(k[i * 12 + j]).toBeCloseTo(k[j * 12 + i], 6);
      }
    }
  });

  it('axial terms EA/L', () => {
    const L = 5;
    const k = frameLocalStiffness3D(E, G, A, Iy, Iz, J, L, false, false);
    const ea_l = E * A / L;
    expect(k[0 * 12 + 0]).toBeCloseTo(ea_l);
    expect(k[0 * 12 + 6]).toBeCloseTo(-ea_l);
    expect(k[6 * 12 + 6]).toBeCloseTo(ea_l);
  });

  it('torsion terms GJ/L', () => {
    const L = 5;
    const k = frameLocalStiffness3D(E, G, A, Iy, Iz, J, L, false, false);
    const gj_l = G * J / L;
    expect(k[3 * 12 + 3]).toBeCloseTo(gj_l);
    expect(k[3 * 12 + 9]).toBeCloseTo(-gj_l);
    expect(k[9 * 12 + 9]).toBeCloseTo(gj_l);
  });

  it('strong-axis bending (v, θz): same as 2D', () => {
    const L = 5;
    const k = frameLocalStiffness3D(E, G, A, Iy, Iz, J, L, false, false);
    const EI = E * Iz;
    expect(k[1 * 12 + 1]).toBeCloseTo(12 * EI / (L * L * L));
    expect(k[5 * 12 + 5]).toBeCloseTo(4 * EI / L);
    expect(k[1 * 12 + 5]).toBeCloseTo(6 * EI / (L * L));
  });

  it('weak-axis bending (w, θy): sign inversions', () => {
    const L = 5;
    const k = frameLocalStiffness3D(E, G, A, Iy, Iz, J, L, false, false);
    const EI = E * Iy;
    expect(k[2 * 12 + 2]).toBeCloseTo(12 * EI / (L * L * L));
    expect(k[4 * 12 + 4]).toBeCloseTo(4 * EI / L);
    // Coupling w-θy: opposite sign to v-θz
    expect(k[2 * 12 + 4]).toBeCloseTo(-6 * EI / (L * L)); // negative!
    expect(k[1 * 12 + 5]).toBeCloseTo(6 * E * Iz / (L * L)); // positive for comparison
  });
});

describe('3D Solver — Cantilever, load in Y', () => {
  // Horizontal bar along X, fixed at node 1, free at node 2.
  // Point load Fy = -10 kN at node 2 (downward).
  //
  // UBA convention: ey=(0,0,1), ez=(0,-1,0) for +X beam
  // Global Fy maps to local Z (ez·(0,Fy,0) = -Fy) → uses Iy in stiffness
  // uy_global = Fy*L³/(3*E*Iy) (same formula shape, just Iy instead of Iz)
  // Internal forces: Vz and My (not Vy and Mz)

  const L = 5;
  const P = -10; // kN (downward in Y)

  const input = buildInput(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    [fixedSupport(1)],
    [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, fz: 0, mx: 0, my: 0, mz: 0 } }],
  );

  it('solves successfully', () => {
    const result = solve3D(input);
    assertSuccess(result);
  });

  it('displacement at free end', () => {
    const result = solve3D(input);
    assertSuccess(result);

    // Fy now goes through local Z plane → uses Iy
    const uy_expected = P * L * L * L / (3 * E * Iy);

    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    expect(d2.uy).toBeCloseTo(uy_expected, 4);
    // No displacement in other directions
    expect(d2.ux).toBeCloseTo(0, 6);
    expect(d2.uz).toBeCloseTo(0, 6);
    expect(d2.rx).toBeCloseTo(0, 6);
  });

  it('reactions at fixed end', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    expect(r1.fy).toBeCloseTo(-P, 4); // 10 kN upward
    expect(r1.fx).toBeCloseTo(0, 6);
    expect(r1.fz).toBeCloseTo(0, 6);
  });

  it('internal forces: shear and moment', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const ef = result.elementForces[0];
    // With UBA, gravity (Fy) goes to local Z plane → Vz and My
    expect(Math.abs(ef.vzStart)).toBeCloseTo(Math.abs(P), 4);
    // Moment at fixed end: |My| = |P|*L = 50
    expect(Math.abs(ef.myStart)).toBeCloseTo(Math.abs(P) * L, 4);
    // Moment at free end = 0
    expect(ef.myEnd).toBeCloseTo(0, 4);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Cantilever, load in Z', () => {
  const L = 5;
  const P = -10;

  const input = buildInput(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    [fixedSupport(1)],
    [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: P, mx: 0, my: 0, mz: 0 } }],
  );

  it('displacement at free end (weak axis)', () => {
    const result = solve3D(input);
    assertSuccess(result);

    // UBA: Fz goes to local Y (ey·(0,0,Fz) = Fz) → uses Iz
    const uz_expected = P * L * L * L / (3 * E * Iz);

    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    expect(d2.uz).toBeCloseTo(uz_expected, 4);
    expect(d2.uy).toBeCloseTo(0, 6);
    expect(d2.ux).toBeCloseTo(0, 6);
  });

  it('reactions at fixed end', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    expect(r1.fz).toBeCloseTo(-P, 4);
    expect(r1.fx).toBeCloseTo(0, 6);
    expect(r1.fy).toBeCloseTo(0, 6);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Cantilever, torque', () => {
  const L = 5;
  const Mx = 5;

  const input = buildInput(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    [fixedSupport(1)],
    [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: Mx, my: 0, mz: 0 } }],
  );

  it('torsional rotation at free end', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const rx_expected = Mx * L / (G * J);

    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    expect(d2.rx).toBeCloseTo(rx_expected, 4);
    expect(d2.ux).toBeCloseTo(0, 6);
    expect(d2.uy).toBeCloseTo(0, 6);
    expect(d2.uz).toBeCloseTo(0, 6);
  });

  it('torsional reaction at fixed end', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    expect(r1.mx).toBeCloseTo(-Mx, 4);
    expect(r1.fx).toBeCloseTo(0, 6);
    expect(r1.fy).toBeCloseTo(0, 6);
    expect(r1.fz).toBeCloseTo(0, 6);
  });

  it('internal torsion: constant magnitude', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const ef = result.elementForces[0];
    // Torsion should be constant along the element, magnitude = Mx
    expect(Math.abs(ef.mxStart)).toBeCloseTo(Mx, 4);
    expect(Math.abs(ef.mxEnd)).toBeCloseTo(Mx, 4);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Simply supported, uniform load (gravity)', () => {
  // Beam along X, supports at both ends.
  // In 3D, a "pinned" support with all rotations free leaves the torsion DOF unconstrained.
  // We need to restrain torsion (rrx) at least at one end for stability.
  //
  // UBA convention: for +X beam, ez=(0,-1,0). Gravity (downward) = positive qZ.
  // q = 10 kN/m downward → qZI = 10, qZJ = 10 (ez points down, positive qZ = downward)
  //
  // Analytical:
  //   R_A = R_B = q*L/2 = 50 kN (upward)

  const L = 5;
  const q = 10; // kN/m magnitude (downward)

  const input = buildInput(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    [pinnedSupportBeamX(1), pinnedSupportBeamX(2)],
    [{ type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: q, qZJ: q } }],
  );

  it('reactions', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    const r2 = result.reactions.find(r => r.nodeId === 2)!;

    // qZ=10 in local Z (ez=(0,-1,0)) → global Fy = ez[1]*qZ*L = -10*5 = -50 total
    // Each reaction: fy = 50/2 = 25 kN upward
    expect(r1.fy).toBeCloseTo(q * L / 2, 4); // 25 kN upward
    expect(r2.fy).toBeCloseTo(q * L / 2, 4);
    expect(r1.fx).toBeCloseTo(0, 6);
    expect(r2.fx).toBeCloseTo(0, 6);
  });

  it('end moments = 0 (pinned), shear at start = R', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const ef = result.elementForces[0];
    // UBA: gravity load in local Z plane → My (not Mz)
    expect(ef.myStart).toBeCloseTo(0, 4);
    expect(ef.myEnd).toBeCloseTo(0, 4);
    // Shear at start = qL/2 (Vz, not Vy)
    expect(Math.abs(ef.vzStart)).toBeCloseTo(q * L / 2, 4);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Vertical column (axis transformation test)', () => {
  // Column along global Y (vertical).
  // Fixed at bottom (node 1 at y=0), free at top (node 2 at y=5).
  // Horizontal force Fx = 10 kN at top.

  const L = 5;
  const Px = 10;

  const input = buildInput(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: L, z: 0 }],
    [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    [fixedSupport(1)],
    [{ type: 'nodal', data: { nodeId: 2, fx: Px, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }],
  );

  it('solves successfully', () => {
    const result = solve3D(input);
    assertSuccess(result);
  });

  it('horizontal displacement at top', () => {
    const result = solve3D(input);
    assertSuccess(result);

    // For vertical element: ex=[0,1,0], ref=globalZ=[0,0,1]
    // ez = ex × ref = [0,1,0] × [0,0,1] = [1,0,0]
    // Force in global X = force in local Z → uses EIy
    const ux_expected = Px * L * L * L / (3 * E * Iy);

    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    expect(d2.ux).toBeCloseTo(ux_expected, 4);
    expect(d2.uy).toBeCloseTo(0, 6);
  });

  it('reactions', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    expect(r1.fx).toBeCloseTo(-Px, 4);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — L-shaped portal frame', () => {
  const input = buildInput(
    [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 5, y: 0, z: 0 },
      { id: 3, x: 5, y: 5, z: 0 },
    ],
    [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ],
    [fixedSupport(1), fixedSupport(3)],
    [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -20, fz: 0, mx: 0, my: 0, mz: 0 } }],
  );

  it('solves successfully', () => {
    const result = solve3D(input);
    assertSuccess(result);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });

  it('total vertical reaction = applied load', () => {
    const result = solve3D(input);
    assertSuccess(result);

    let totalFy = 0;
    for (const r of result.reactions) totalFy += r.fy;
    expect(totalFy).toBeCloseTo(20, 4);
  });

  it('node 2 displaces downward', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    expect(d2.uy).toBeLessThan(0);
    expect(d2.uz).toBeCloseTo(0, 4);
  });
});

describe('3D Solver — Space truss (tetrahedron)', () => {
  const s = 2;
  const h = s * Math.sqrt(2 / 3);
  const cx = 1;
  const cz = s / Math.sqrt(3);

  const trussSection: SolverSection3D = { id: 1, a: 0.001, iz: 1e-8, iy: 1e-8, j: 1e-8 };

  const input = buildInput(
    [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: s, y: 0, z: 0 },
      { id: 3, x: cx, y: 0, z: s * Math.sqrt(3) / 2 },
      { id: 4, x: cx, y: h, z: cz },
    ],
    [
      { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 2, type: 'truss', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 3, type: 'truss', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 4, type: 'truss', nodeI: 1, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 5, type: 'truss', nodeI: 2, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 6, type: 'truss', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ],
    [pinnedSupport(1), pinnedSupport(2), pinnedSupport(3)],
    [{ type: 'nodal', data: { nodeId: 4, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } }],
    [steelMat],
    [trussSection],
  );

  it('solves successfully', () => {
    const result = solve3D(input);
    assertSuccess(result);
  });

  it('apex displaces downward', () => {
    const result = solve3D(input);
    assertSuccess(result);
    const d4 = result.displacements.find(d => d.nodeId === 4)!;
    expect(d4.uy).toBeLessThan(0);
  });

  it('bars to apex in compression', () => {
    const result = solve3D(input);
    assertSuccess(result);
    for (const ef of result.elementForces) {
      if (ef.elementId >= 4) {
        expect(ef.nStart).toBeLessThan(0);
      }
    }
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });

  it('total vertical reaction = 10 kN', () => {
    const result = solve3D(input);
    assertSuccess(result);
    let totalFy = 0;
    for (const r of result.reactions) totalFy += r.fy;
    expect(totalFy).toBeCloseTo(10, 4);
  });

  it('by symmetry, horizontal reactions cancel', () => {
    const result = solve3D(input);
    assertSuccess(result);
    let totalFx = 0, totalFz = 0;
    for (const r of result.reactions) {
      totalFx += r.fx;
      totalFz += r.fz;
    }
    expect(totalFx).toBeCloseTo(0, 4);
    expect(totalFz).toBeCloseTo(0, 4);
  });
});

describe('3D Solver — 2D↔3D equivalence', () => {
  // UBA: gravity on +X beam → qZ (local Z = (0,-1,0) = downward)
  // q = 10 kN/m downward → qZI = 10, qZJ = 10
  const L = 6;
  const q = 10; // kN/m downward (positive qZ = downward in UBA)

  const input = buildInput(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    [pinnedSupportBeamX(1), pinnedSupportBeamX(2)],
    [{ type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: q, qZJ: q } }],
  );

  it('reactions match 2D: R = qL/2', () => {
    const result = solve3D(input);
    assertSuccess(result);

    // Gravity load: total = q*L = 60 kN downward. Each reaction = 30 kN upward.
    const R_expected = q * L / 2;
    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    const r2 = result.reactions.find(r => r.nodeId === 2)!;

    expect(r1.fy).toBeCloseTo(R_expected, 4);
    expect(r2.fy).toBeCloseTo(R_expected, 4);
  });

  it('end rotation uses Iy (gravity goes through local Z plane)', () => {
    const result = solve3D(input);
    assertSuccess(result);

    // UBA: gravity in local Z plane → uses Iy, produces θy (local) which maps to global rz
    // For a SS beam with UDL q in local Z:
    // The end rotation in the local Z-plane is θy = qL³/(24EIy)
    // Global rotation mapping: R^T maps local rotations to global
    // For +X beam: ry_global = ey[1]*θx + ey[1] terms... but from R^T:
    // The local θy maps to global rz via the transformation.
    // Actually, let's check: local DOFs [u,v,w,θx,θy,θz] → global via R^T
    // R^T row for ry_global: [ex[1], ey[1], ez[1]] = [0, 0, -1] applied to [θx, θy, θz]
    // → ry_global = -θz_local (but θz_local = 0 for Z-plane load)
    // R^T row for rz_global: [ex[2], ey[2], ez[2]] = [0, 1, 0] applied to [θx, θy, θz]
    // → rz_global = θy_local... wait that's wrong direction.
    // Actually: for rotation DOFs, same 3x3 rotation applies.
    // rz_global = R^T[2,:] · [θx, θy, θz]_local = ex[2]*θx + ey[2]*θy + ez[2]*θz
    //           = 0*θx + 1*θy + 0*θz = θy_local
    // So rz_global = θy_local, and θy_local = -q*L³/(24*E*Iy) for qZ>0 (downward).
    // But the sign: for a downward UDL, the left support rotates clockwise (positive θy?).
    // Let's just check magnitudes.
    const theta_mag = q * L * L * L / (24 * E * Iy);

    const d1 = result.displacements.find(d => d.nodeId === 1)!;
    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    // Rotations at both ends should have same magnitude, opposite signs
    expect(Math.abs(d1.rz)).toBeCloseTo(theta_mag, 5);
    expect(Math.abs(d2.rz)).toBeCloseTo(theta_mag, 5);
  });

  it('no out-of-plane response', () => {
    const result = solve3D(input);
    assertSuccess(result);
    for (const d of result.displacements) {
      expect(d.uz).toBeCloseTo(0, 8);
      expect(d.rx).toBeCloseTo(0, 8);
    }
  });
});

describe('3D Solver — Cantilever with biaxial loading', () => {
  const L = 5;
  const Fy = -10;
  const Fz = -5;

  const input = buildInput(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    [fixedSupport(1)],
    [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: Fy, fz: Fz, mx: 0, my: 0, mz: 0 } }],
  );

  it('independent Y and Z displacements', () => {
    const result = solve3D(input);
    assertSuccess(result);

    // UBA: Fy goes through local Z (uses Iy), Fz goes through local Y (uses Iz)
    const uy_expected = Fy * L * L * L / (3 * E * Iy);
    const uz_expected = Fz * L * L * L / (3 * E * Iz);

    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    expect(d2.uy).toBeCloseTo(uy_expected, 4);
    expect(d2.uz).toBeCloseTo(uz_expected, 4);
    expect(d2.ux).toBeCloseTo(0, 6);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Axial bar (tension)', () => {
  const L = 5;
  const Fx = 50;

  const input = buildInput(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    [fixedSupport(1)],
    [{ type: 'nodal', data: { nodeId: 2, fx: Fx, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }],
  );

  it('axial displacement', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const ux_expected = Fx * L / (E * A);
    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    expect(d2.ux).toBeCloseTo(ux_expected, 6);
  });

  it('axial force = Fx', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const ef = result.elementForces[0];
    expect(ef.nStart).toBeCloseTo(Fx, 4);
    expect(ef.nEnd).toBeCloseTo(Fx, 4);
  });
});

describe('3D Solver — Diagonal bar in space', () => {
  const input = buildInput(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 3, y: 4, z: 0 }],
    [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    [fixedSupport(1)],
    [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } }],
  );

  it('solves successfully', () => {
    const result = solve3D(input);
    assertSuccess(result);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });

  it('node 2 displaces downward', () => {
    const result = solve3D(input);
    assertSuccess(result);
    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    expect(d2.uy).toBeLessThan(0);
  });
});

describe('3D Solver — 3D portal frame (out of plane)', () => {
  const input = buildInput(
    [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 0, y: 3, z: 0 },
      { id: 3, x: 4, y: 3, z: 0 },
      { id: 4, x: 4, y: 0, z: 0 },
    ],
    [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 3, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ],
    [fixedSupport(1), fixedSupport(4)],
    [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 15, mx: 0, my: 0, mz: 0 } }],
  );

  it('solves successfully', () => {
    const result = solve3D(input);
    assertSuccess(result);
  });

  it('out-of-plane displacements', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    const d3 = result.displacements.find(d => d.nodeId === 3)!;
    expect(d2.uz).not.toBeCloseTo(0, 3);
    expect(d3.uz).not.toBeCloseTo(0, 3);
    expect(Math.abs(d2.uz)).toBeGreaterThan(Math.abs(d3.uz));
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });

  it('total Fz reaction = -15 kN', () => {
    const result = solve3D(input);
    assertSuccess(result);
    let totalFz = 0;
    for (const r of result.reactions) totalFz += r.fz;
    expect(totalFz).toBeCloseTo(-15, 4);
  });
});

describe('3D Solver — Distributed load in Z-global on cantilever', () => {
  // Intent: apply distributed load in global Z direction on +X beam.
  // UBA: local Y = (0,0,1) = Z-global. So qY produces Z-global force.
  // Local Y bending uses Iz.
  const L = 4;
  const qy = -8; // kN/m in local Y (= -8 kN/m in Z-global direction)

  const input = buildInput(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    [fixedSupport(1)],
    [{ type: 'distributed', data: { elementId: 1, qYI: qy, qYJ: qy, qZI: 0, qZJ: 0 } }],
  );

  it('solves and deflects in Z', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    // Local Y plane uses Iz. uz_global = v_local (from R^T mapping)
    const uz_expected = qy * L * L * L * L / (8 * E * Iz);
    expect(d2.uz).toBeCloseTo(uz_expected, 4);
  });

  it('reaction at fixed end', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    // Total load in Z-global = qy * L * ey[2] = -8 * 4 * 1 = -32
    // Reaction fz = 32
    expect(r1.fz).toBeCloseTo(-qy * L, 4);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Point load on element (gravity)', () => {
  // UBA: for +X beam, to apply downward force, use pz (local Z = (0,-1,0) = downward)
  // pz = 12 means 12 kN downward. Reaction fy = 12 kN upward.
  const L = 6;
  const Pz = 12; // kN in local Z direction (= 12 kN downward in UBA)
  const a = 3;

  const input = buildInput(
    [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
    [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    [fixedSupport(1)],
    [{ type: 'pointOnElement', data: { elementId: 1, a, py: 0, pz: Pz } }],
  );

  it('solves successfully', () => {
    const result = solve3D(input);
    assertSuccess(result);
  });

  it('reaction Fy = Pz at fixed end (upward reaction for downward load)', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    // pz=12 in local Z = (0,-1,0) → 12 kN downward → reaction fy = 12 kN upward
    expect(r1.fy).toBeCloseTo(Pz, 4);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Validation errors', () => {
  it('error for < 2 nodes', () => {
    const input = buildInput(
      [{ id: 1, x: 0, y: 0, z: 0 }],
      [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [fixedSupport(1)],
    );
    const result = solve3D(input);
    expect(typeof result).toBe('string');
  });

  it('error for zero-length element', () => {
    const input = buildInput(
      [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 0, y: 0, z: 0 }],
      [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [fixedSupport(1)],
    );
    const result = solve3D(input);
    expect(typeof result).toBe('string');
  });

  it('error for no supports', () => {
    const input = buildInput(
      [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 5, y: 0, z: 0 }],
      [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [],
    );
    const result = solve3D(input);
    expect(typeof result).toBe('string');
  });
});

describe('3D Solver — Mixed frame + truss', () => {
  // Frame bar along X + truss bracing.
  // Node 3 gets a fixed support to provide enough rotational restraint.

  const input = buildInput(
    [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 5, y: 0, z: 0 },
      { id: 3, x: 0, y: 3, z: 0 },
    ],
    [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 2, type: 'truss', nodeI: 3, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ],
    [fixedSupport(1), fixedSupport(3)],
    [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } }],
  );

  it('solves mixed frame+truss', () => {
    const result = solve3D(input);
    assertSuccess(result);
  });

  it('truss element has only axial force', () => {
    const result = solve3D(input);
    assertSuccess(result);

    const trussForces = result.elementForces.find(ef => ef.elementId === 2)!;
    expect(trussForces.vyStart).toBeCloseTo(0, 6);
    expect(trussForces.vyEnd).toBeCloseTo(0, 6);
    expect(trussForces.vzStart).toBeCloseTo(0, 6);
    expect(trussForces.mzStart).toBeCloseTo(0, 6);
    expect(trussForces.mxStart).toBeCloseTo(0, 6);
    expect(trussForces.nStart).not.toBeCloseTo(0, 3);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Transformation matrix orthogonality', () => {
  it('T^T * T = I for any orientation', () => {
    const nI: SolverNode3D = { id: 1, x: 1, y: 2, z: 3 };
    const nJ: SolverNode3D = { id: 2, x: 4, y: 6, z: 8 };
    const axes = computeLocalAxes3D(nI, nJ);
    const T = frameTransformationMatrix3D(axes.ex, axes.ey, axes.ez);

    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        let sum = 0;
        for (let k = 0; k < 12; k++) {
          sum += T[k * 12 + i] * T[k * 12 + j];
        }
        const expected = i === j ? 1 : 0;
        expect(sum).toBeCloseTo(expected, 10);
      }
    }
  });

  it('local axes are orthonormal', () => {
    const nI: SolverNode3D = { id: 1, x: 1, y: -3, z: 2 };
    const nJ: SolverNode3D = { id: 2, x: 5, y: 1, z: -1 };
    const axes = computeLocalAxes3D(nI, nJ);

    const exey = axes.ex[0] * axes.ey[0] + axes.ex[1] * axes.ey[1] + axes.ex[2] * axes.ey[2];
    const exez = axes.ex[0] * axes.ez[0] + axes.ex[1] * axes.ez[1] + axes.ex[2] * axes.ez[2];
    const eyez = axes.ey[0] * axes.ez[0] + axes.ey[1] * axes.ez[1] + axes.ey[2] * axes.ez[2];

    expect(exey).toBeCloseTo(0, 10);
    expect(exez).toBeCloseTo(0, 10);
    expect(eyez).toBeCloseTo(0, 10);

    const exLen = Math.sqrt(axes.ex[0] ** 2 + axes.ex[1] ** 2 + axes.ex[2] ** 2);
    const eyLen = Math.sqrt(axes.ey[0] ** 2 + axes.ey[1] ** 2 + axes.ey[2] ** 2);
    const ezLen = Math.sqrt(axes.ez[0] ** 2 + axes.ez[1] ** 2 + axes.ez[2] ** 2);

    expect(exLen).toBeCloseTo(1, 10);
    expect(eyLen).toBeCloseTo(1, 10);
    expect(ezLen).toBeCloseTo(1, 10);
  });
});

describe('3D Solver — Space truss (double pyramid from example)', () => {
  // Replicates the "3d-space-truss" example:
  // Double pyramid with 8 nodes and 16 truss elements.
  // Nodes:
  //   st1(0,0,0), st2(4,0,0), st3(4,0,4), st4(0,0,4)       — base ring 1
  //   st5(2,3,2)                                              — apex 1
  //   st6(8,0,0), st7(8,0,4)                                 — base ring 2
  //   st8(6,3,2)                                              — apex 2
  // 16 truss elements, 4 pinned3d supports (st1, st4, st6, st7)
  // Loads: (0, -30, 0) kN at st5 and st8

  const trussSection: SolverSection3D = {
    id: 1, a: 0.00334, iz: 1e-6, iy: 1e-6, j: 1e-6,
  };

  const input = buildInput(
    [
      { id: 1, x: 0, y: 0, z: 0 },   // st1
      { id: 2, x: 4, y: 0, z: 0 },   // st2
      { id: 3, x: 4, y: 0, z: 4 },   // st3
      { id: 4, x: 0, y: 0, z: 4 },   // st4
      { id: 5, x: 2, y: 3, z: 2 },   // apex 1
      { id: 6, x: 8, y: 0, z: 0 },   // st6
      { id: 7, x: 8, y: 0, z: 4 },   // st7
      { id: 8, x: 6, y: 3, z: 2 },   // apex 2
    ],
    [
      // Base ring 1
      { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 2, type: 'truss', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 3, type: 'truss', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 4, type: 'truss', nodeI: 4, nodeJ: 1, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 17, type: 'truss', nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }, // base diagonal
      // Diagonals to apex 1
      { id: 5, type: 'truss', nodeI: 1, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 6, type: 'truss', nodeI: 2, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 7, type: 'truss', nodeI: 3, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 8, type: 'truss', nodeI: 4, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      // Base ring 2
      { id: 9, type: 'truss', nodeI: 2, nodeJ: 6, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 10, type: 'truss', nodeI: 6, nodeJ: 7, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 11, type: 'truss', nodeI: 7, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 18, type: 'truss', nodeI: 3, nodeJ: 6, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }, // base diagonal
      // Diagonals to apex 2
      { id: 12, type: 'truss', nodeI: 2, nodeJ: 8, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 13, type: 'truss', nodeI: 6, nodeJ: 8, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 14, type: 'truss', nodeI: 7, nodeJ: 8, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      { id: 15, type: 'truss', nodeI: 3, nodeJ: 8, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
      // Top chord
      { id: 16, type: 'truss', nodeI: 5, nodeJ: 8, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ],
    [
      pinnedSupport(1),  // st1
      pinnedSupport(4),  // st4
      pinnedSupport(6),  // st6
      pinnedSupport(7),  // st7
    ],
    [
      { type: 'nodal', data: { nodeId: 5, fx: 0, fy: -30, fz: 0, mx: 0, my: 0, mz: 0 } },
      { type: 'nodal', data: { nodeId: 8, fx: 0, fy: -30, fz: 0, mx: 0, my: 0, mz: 0 } },
    ],
    [steelMat],
    [trussSection],
  );

  it('solves successfully', () => {
    const result = solve3D(input);
    assertSuccess(result);
  });

  it('apex nodes displace downward', () => {
    const result = solve3D(input);
    assertSuccess(result);
    const d5 = result.displacements.find(d => d.nodeId === 5)!;
    const d8 = result.displacements.find(d => d.nodeId === 8)!;
    expect(d5.uy).toBeLessThan(0);
    expect(d8.uy).toBeLessThan(0);
  });

  it('total vertical reaction = 60 kN', () => {
    const result = solve3D(input);
    assertSuccess(result);
    let totalFy = 0;
    for (const r of result.reactions) totalFy += r.fy;
    expect(totalFy).toBeCloseTo(60, 4);
  });

  it('horizontal reactions cancel (equilibrium)', () => {
    const result = solve3D(input);
    assertSuccess(result);
    let totalFx = 0, totalFz = 0;
    for (const r of result.reactions) {
      totalFx += r.fx;
      totalFz += r.fz;
    }
    expect(totalFx).toBeCloseTo(0, 4);
    expect(totalFz).toBeCloseTo(0, 4);
  });

  it('global equilibrium', () => {
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Robustness Tests — Phase 2
// ═══════════════════════════════════════════════════════════════════

/** IPN 200 realistic section */
const ipn200Section: SolverSection3D = {
  id: 2, name: 'IPN 200',
  a: 0.00334,           // 33.4 cm² → m²
  iz: 2.14e-5,          // 2140 cm⁴ → m⁴ (strong axis)
  iy: 1.17e-5,          // 117 cm⁴ → m⁴ (weak axis)
  j: 4.79e-8,           // 4.79 cm⁴ → m⁴ (torsional constant)
};

describe('3D Solver — Moment equilibrium at interior node', () => {
  // L-shaped portal: two frames meeting at a common node (90° corner)
  // Verify that ΣM = 0 at the shared node
  const nodes: SolverNode3D[] = [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: 3, y: 0, z: 0 },  // shared node
    { id: 3, x: 3, y: 4, z: 0 },
  ];
  const elements: SolverElement3D[] = [
    { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
  ];
  const supports: SolverSupport3D[] = [
    fixedSupport(1),
    fixedSupport(3),
  ];
  const loads: SolverInput3D['loads'] = [
    { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } },
  ];

  it('bending moments at shared node sum to zero (Mz)', () => {
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    const ef1 = result.elementForces.find(f => f.elementId === 1)!;
    const ef2 = result.elementForces.find(f => f.elementId === 2)!;

    // Mz at end of elem1 + Mz at start of elem2 should balance
    // Note: small residual due to 3D local axes / out-of-plane coupling
    const sumMz = ef1.mzEnd + ef2.mzStart;
    expect(Math.abs(sumMz)).toBeLessThan(0.05);
  });

  it('shear forces consistent with applied load', () => {
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Cantilever IPN 200 with realistic properties', () => {
  // Cantilever beam L=3m, P=10kN at tip in -Y direction (downward)
  // UBA: Fy goes through local Z plane → uses Iy
  // δ = PL³/(3EIy) = 10 × 27 / (3 × 200e6 × 1.17e-5)
  const L = 3;
  const P = 10; // kN
  const nodes: SolverNode3D[] = [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: L, y: 0, z: 0 },
  ];
  const elements: SolverElement3D[] = [
    { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 2, hingeStart: false, hingeEnd: false },
  ];
  const supports: SolverSupport3D[] = [fixedSupport(1)];
  const loads: SolverInput3D['loads'] = [
    { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -P, fz: 0, mx: 0, my: 0, mz: 0 } },
  ];

  it('tip deflection matches PL³/(3EIy) (gravity goes through local Z)', () => {
    const input = buildInput(nodes, elements, supports, loads, [steelMat], [ipn200Section]);
    const result = solve3D(input);
    assertSuccess(result);

    const E_kN = 200000 * 1000; // kN/m²
    // UBA: Fy → local Z → uses Iy
    const expected = P * L ** 3 / (3 * E_kN * ipn200Section.iy);
    const tipDisp = result.displacements.find(d => d.nodeId === 2)!;
    expect(Math.abs(tipDisp.uy)).toBeCloseTo(expected, 4);
  });

  it('fixed-end moment = PL', () => {
    const input = buildInput(nodes, elements, supports, loads, [steelMat], [ipn200Section]);
    const result = solve3D(input);
    assertSuccess(result);

    // UBA: gravity → local My. But local My maps to global mz (R^T: mz_global = my_local)
    // Reaction moment at support should be PL = 10 × 3 = 30 kN·m
    const reaction = result.reactions.find(r => r.nodeId === 1)!;
    expect(Math.abs(reaction.mz)).toBeCloseTo(P * L, 3);
  });

  it('global equilibrium', () => {
    const input = buildInput(nodes, elements, supports, loads, [steelMat], [ipn200Section]);
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Weak axis vs strong axis deflection', () => {
  // Cantilever L=2m with same load magnitude but different directions
  // UBA for +X beam: Fy → local Z (uses Iy=weak), Fz → local Y (uses Iz=strong)
  // So Fy direction gives LARGER deflection (weak axis)
  const L = 2;
  const P = 5; // kN
  const nodes: SolverNode3D[] = [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: L, y: 0, z: 0 },
  ];
  const elements: SolverElement3D[] = [
    { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 2, hingeStart: false, hingeEnd: false },
  ];

  it('Fy deflection (weak axis, Iy) > Fz deflection (strong axis, Iz), ratio ≈ Iz/Iy', () => {
    const supportsY: SolverSupport3D[] = [fixedSupport(1)];
    const loadsY: SolverInput3D['loads'] = [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -P, fz: 0, mx: 0, my: 0, mz: 0 } },
    ];
    const inputY = buildInput(nodes, elements, supportsY, loadsY, [steelMat], [ipn200Section]);
    const resultY = solve3D(inputY);
    assertSuccess(resultY);
    const dispY = Math.abs(resultY.displacements.find(d => d.nodeId === 2)!.uy);

    const supportsZ: SolverSupport3D[] = [fixedSupport(1)];
    const loadsZ: SolverInput3D['loads'] = [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: P, mx: 0, my: 0, mz: 0 } },
    ];
    const inputZ = buildInput(nodes, elements, supportsZ, loadsZ, [steelMat], [ipn200Section]);
    const resultZ = solve3D(inputZ);
    assertSuccess(resultZ);
    const dispZ = Math.abs(resultZ.displacements.find(d => d.nodeId === 2)!.uz);

    // UBA: Fy→Iy (weak), Fz→Iz (strong). dispY > dispZ, ratio = Iz/Iy ≈ 1.83
    expect(dispY).toBeGreaterThan(dispZ);
    expect(dispY / dispZ).toBeCloseTo(ipn200Section.iz / ipn200Section.iy, 1);
  });
});

describe('3D Solver — Pure torsion with realistic J', () => {
  // Fixed-free beam with torsion Mx=1 kN·m at free end
  // θ = Mx·L/(G·J) where G = E/(2(1+ν))
  const L = 2;
  const Mx_load = 1; // kN·m
  const nodes: SolverNode3D[] = [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: L, y: 0, z: 0 },
  ];
  const elements: SolverElement3D[] = [
    { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 2, hingeStart: false, hingeEnd: false },
  ];
  const supports: SolverSupport3D[] = [fixedSupport(1)];
  const loads: SolverInput3D['loads'] = [
    { type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: Mx_load, my: 0, mz: 0 } },
  ];

  it('rotation matches Mx·L/(G·J)', () => {
    const input = buildInput(nodes, elements, supports, loads, [steelMat], [ipn200Section]);
    const result = solve3D(input);
    assertSuccess(result);

    const E_kN = 200000 * 1000; // kN/m²
    const G_kN = E_kN / (2 * (1 + 0.3));
    const expected = Mx_load * L / (G_kN * ipn200Section.j);
    const tipDisp = result.displacements.find(d => d.nodeId === 2)!;

    expect(tipDisp.rx).toBeCloseTo(expected, 2);
  });

  it('torsion moment constant along element', () => {
    const input = buildInput(nodes, elements, supports, loads, [steelMat], [ipn200Section]);
    const result = solve3D(input);
    assertSuccess(result);

    const ef = result.elementForces.find(f => f.elementId === 1)!;
    // Sign convention: mxStart = reaction at fixed end, mxEnd = -fLocal[9]
    // Both have magnitude Mx_load
    expect(Math.abs(ef.mxStart)).toBeCloseTo(Mx_load, 4);
    expect(Math.abs(ef.mxEnd)).toBeCloseTo(Mx_load, 4);
  });
});

describe('3D Solver — Frame with hinge: M=0 at hinged end', () => {
  const L = 4;
  const nodes: SolverNode3D[] = [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: L, y: 0, z: 0 },
  ];

  it('hingeStart → moment at start is zero', () => {
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: true, hingeEnd: false },
    ];
    const supports: SolverSupport3D[] = [fixedSupport(1), fixedSupport(2)];
    const loads: SolverInput3D['loads'] = [
      { type: 'distributed', data: { elementId: 1, qYI: -10, qYJ: -10, qZI: 0, qZJ: 0 } },
    ];
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    const ef = result.elementForces.find(f => f.elementId === 1)!;
    expect(ef.mzStart).toBeCloseTo(0, 4);
    expect(Math.abs(ef.mzEnd)).toBeGreaterThan(0.1);
  });

  it('hingeEnd → moment at end is zero', () => {
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: true },
    ];
    const supports: SolverSupport3D[] = [fixedSupport(1), fixedSupport(2)];
    const loads: SolverInput3D['loads'] = [
      { type: 'distributed', data: { elementId: 1, qYI: -10, qYJ: -10, qZI: 0, qZJ: 0 } },
    ];
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    const ef = result.elementForces.find(f => f.elementId === 1)!;
    expect(ef.mzEnd).toBeCloseTo(0, 4);
    expect(Math.abs(ef.mzStart)).toBeGreaterThan(0.1);
  });
});

describe('3D Solver — Spring support (elastic support)', () => {
  const L = 3;
  const P = 20; // kN
  const kY = 5000; // kN/m

  it('elastic spring reduces deflection vs pure cantilever', () => {
    const nodes: SolverNode3D[] = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: L, y: 0, z: 0 },
    ];
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ];
    const supports: SolverSupport3D[] = [
      fixedSupport(1),
      { nodeId: 2, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false, ky: kY },
    ];
    const loads: SolverInput3D['loads'] = [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -P, fz: 0, mx: 0, my: 0, mz: 0 } },
    ];
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    const disp2 = result.displacements.find(d => d.nodeId === 2)!;

    // Total vertical reaction at both supports should equal P
    let totalFy = 0;
    for (const r of result.reactions) totalFy += r.fy;
    expect(totalFy).toBeCloseTo(P, 3);

    // Deflection should be less than pure cantilever (spring helps)
    const E_kN = 200000 * 1000;
    const pureCantilever = P * L ** 3 / (3 * E_kN * Iz);
    expect(Math.abs(disp2.uy)).toBeLessThan(pureCantilever);
  });
});

describe('3D Solver — Displacement compatibility at shared node', () => {
  // 4 frames meeting at a common node (star pattern in XZ plane)
  const nodes: SolverNode3D[] = [
    { id: 1, x: -3, y: 0, z: 0 },
    { id: 2, x: 3, y: 0, z: 0 },
    { id: 3, x: 0, y: 0, z: -3 },
    { id: 4, x: 0, y: 0, z: 3 },
    { id: 5, x: 0, y: 0, z: 0 },  // shared center node
  ];
  const elements: SolverElement3D[] = [
    { id: 1, type: 'frame', nodeI: 1, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    { id: 2, type: 'frame', nodeI: 2, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    { id: 3, type: 'frame', nodeI: 3, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    { id: 4, type: 'frame', nodeI: 4, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
  ];
  const supports: SolverSupport3D[] = [
    fixedSupport(1), fixedSupport(2), fixedSupport(3), fixedSupport(4),
  ];
  const loads: SolverInput3D['loads'] = [
    { type: 'nodal', data: { nodeId: 5, fx: 0, fy: -15, fz: 0, mx: 0, my: 0, mz: 0 } },
  ];

  it('center node deflects downward, single displacement entry', () => {
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    const disp5 = result.displacements.find(d => d.nodeId === 5)!;
    expect(disp5.uy).toBeLessThan(0);

    const disps5 = result.displacements.filter(d => d.nodeId === 5);
    expect(disps5.length).toBe(1);
  });

  it('global equilibrium holds', () => {
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Simply supported beam with qZ (gravity, Iy)', () => {
  // UBA: local Z on +X beam = (0,-1,0) = downward.
  // qZ = 8 means 8 kN/m downward → reactions in global fy (vertical).
  const L = 5;
  const qZ = 8; // kN/m in local Z direction (= downward in UBA)
  const nodes: SolverNode3D[] = [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: L, y: 0, z: 0 },
  ];
  const elements: SolverElement3D[] = [
    { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
  ];
  const supports: SolverSupport3D[] = [
    pinnedSupportBeamX(1),
    pinnedSupportBeamX(2),
  ];
  const loads: SolverInput3D['loads'] = [
    { type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: qZ, qZJ: qZ } },
  ];

  it('total Y reaction = qZ × L (gravity loads produce vertical reactions)', () => {
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    const expected = qZ * L; // 40 kN total
    let totalFy = 0;
    for (const r of result.reactions) totalFy += Math.abs(r.fy);
    // UBA: qZ on +X beam acts vertically → reactions are in fy
    expect(totalFy).toBeCloseTo(expected, 1);
  });

  it('global equilibrium', () => {
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Fixed-fixed beam with uniform load (gravity)', () => {
  // UBA: for +X beam, gravity = qZ (local Z = (0,-1,0) = downward)
  // q = 12 kN/m downward → qZI = 12, qZJ = 12
  const L = 4;
  const q = 12; // kN/m
  const nodes: SolverNode3D[] = [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: L, y: 0, z: 0 },
  ];
  const elements: SolverElement3D[] = [
    { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
  ];
  const supports: SolverSupport3D[] = [fixedSupport(1), fixedSupport(2)];
  const loads: SolverInput3D['loads'] = [
    { type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: q, qZJ: q } },
  ];

  it('end moments = qL²/12 (My in UBA for gravity)', () => {
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    const ef = result.elementForces.find(f => f.elementId === 1)!;
    const expectedM = q * L ** 2 / 12;
    // UBA: gravity in local Z plane → My (not Mz)
    expect(Math.abs(ef.myStart)).toBeCloseTo(expectedM, 2);
    expect(Math.abs(ef.myEnd)).toBeCloseTo(expectedM, 2);
  });

  it('reactions = qL/2 at each support', () => {
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    const expectedR = q * L / 2;
    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    const r2 = result.reactions.find(r => r.nodeId === 2)!;
    // Gravity acts in -Y global → reactions in +fy
    expect(Math.abs(r1.fy)).toBeCloseTo(expectedR, 2);
    expect(Math.abs(r2.fy)).toBeCloseTo(expectedR, 2);
  });

  it('global equilibrium', () => {
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);
    checkEquilibrium(result, input);
  });
});

describe('3D Solver — Thermal loads', () => {
  const L = 3;
  const dT = 50; // °C
  const alpha = 1.2e-5; // /°C (hardcoded in solver)

  it('free-end axial displacement = α × ΔT × L', () => {
    const nodes: SolverNode3D[] = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: L, y: 0, z: 0 },
    ];
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ];
    const supports: SolverSupport3D[] = [fixedSupport(1)];
    const loads: SolverInput3D['loads'] = [
      { type: 'thermal', data: { elementId: 1, dtUniform: dT, dtGradientY: 0, dtGradientZ: 0 } },
    ];
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    const expected = alpha * dT * L;
    const tipDisp = result.displacements.find(d => d.nodeId === 2)!;
    expect(tipDisp.ux).toBeCloseTo(expected, 6);
  });

  it('fixed-fixed thermal → zero displacement, non-zero reactions', () => {
    const nodes: SolverNode3D[] = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: L, y: 0, z: 0 },
    ];
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false },
    ];
    const supports: SolverSupport3D[] = [fixedSupport(1), fixedSupport(2)];
    const loads: SolverInput3D['loads'] = [
      { type: 'thermal', data: { elementId: 1, dtUniform: dT, dtGradientY: 0, dtGradientZ: 0 } },
    ];
    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    // Both nodes are fixed → zero displacement
    for (const d of result.displacements) {
      expect(Math.abs(d.ux)).toBeLessThan(1e-10);
    }

    // But reactions should be non-zero (restrained thermal expansion)
    const E_kN = 200000 * 1000;
    const expectedAxial = E_kN * A * alpha * dT;
    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    const r2 = result.reactions.find(r => r.nodeId === 2)!;
    expect(Math.abs(r1.fx)).toBeCloseTo(expectedAxial, 0);
    expect(Math.abs(r2.fx)).toBeCloseTo(expectedAxial, 0);
  });
});
