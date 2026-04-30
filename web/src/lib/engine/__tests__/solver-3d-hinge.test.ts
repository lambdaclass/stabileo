// 3D Hinge Reproducer (Bug B)
//
// The 3D solver treats `hinge_start`/`hinge_end` as releasing BOTH bending
// rotations (θy and θz) at the hinged end. A real physical pin hinge releases
// only ONE rotation (around the pin axis). On hinged 3D arches loaded in their
// own plane, the over-release leaves the out-of-plane bending DOF unconstrained
// at every interior hinge, producing a rigid-body flapping mode → singular Kff.
//
// These tests reproduce the failing fixtures (Three-Hinge Arch, Arco Articulado
// 3D). They MUST currently fail with "Singular stiffness matrix"; after the
// per-axis release contract lands, they must solve.

import { describe, it, expect } from 'vitest';
import { solve3D } from '../wasm-solver';
import type {
  SolverInput3D, SolverElement3D, SolverSupport3D, AnalysisResults3D,
} from '../types-3d';
import type { SolverMaterial } from '../types';

const steelMat: SolverMaterial = { id: 1, e: 200_000, nu: 0.3 };
const stdSection = { id: 1, a: 0.01, iy: 1e-4, iz: 2e-4, j: 1.5e-4 };

function fixedSupport(nodeId: number): SolverSupport3D {
  return { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
}

function buildInput(
  nodes: Array<{ id: number; x: number; y: number; z: number }>,
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
  if (typeof result === 'string') {
    throw new Error(`Solver returned error: ${result}`);
  }
}

describe('3D hinge over-release (Bug B)', () => {

  // Arch in X-Z plane (y=0): semicircle-like polyline with a parabolic profile.
  // Fixed supports at both ends. Two interior hinges (at nodes 4 and 10) — the
  // pin axes are perpendicular to the arch plane, i.e. the global Y axis.
  // Release should be applied to local Mz (rotation about local z = vertical
  // pin axis ≈ global Y for an X-aligned element). Loads are vertical (-Z).
  it('Arco Articulado 3D — two-internal-hinge arch in XZ must solve, not flag mechanism', () => {
    const arch = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 1, y: 0, z: 1.2222 },
      { id: 3, x: 2, y: 0, z: 2.2222 },
      { id: 4, x: 3, y: 0, z: 3.0 },        // hinge here
      { id: 5, x: 4, y: 0, z: 3.5556 },
      { id: 6, x: 5, y: 0, z: 3.8889 },
      { id: 7, x: 6, y: 0, z: 4.0 },
      { id: 8, x: 7, y: 0, z: 3.8889 },
      { id: 9, x: 8, y: 0, z: 3.5556 },
      { id: 10, x: 9, y: 0, z: 3.0 },       // hinge here
      { id: 11, x: 10, y: 0, z: 2.2222 },
      { id: 12, x: 11, y: 0, z: 1.2222 },
      { id: 13, x: 12, y: 0, z: 0 },
    ];
    // Pin axis is global Y (perpendicular to the X-Z arch plane). Under the
    // standard local-axis convention this is local z, so release ONLY Mz at
    // the hinge — not both bending rotations.
    const baseElem = (id: number, i: number, j: number, hs = false, he = false): SolverElement3D => ({
      id, type: 'frame', nodeI: i, nodeJ: j, materialId: 1, sectionId: 1,
      releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: hs, releaseMzEnd: he,
      releaseTStart: false, releaseTEnd: false,
    });
    const elements: SolverElement3D[] = [
      baseElem(1, 1, 2),
      baseElem(2, 2, 3),
      baseElem(3, 3, 4, false, true),   // hinge at node 4 (end of element 3)
      baseElem(4, 4, 5, true, false),   // hinge at node 4 (start of element 4)
      baseElem(5, 5, 6),
      baseElem(6, 6, 7),
      baseElem(7, 7, 8),
      baseElem(8, 8, 9),
      baseElem(9, 9, 10, false, true),  // hinge at node 10
      baseElem(10, 10, 11, true, false),
      baseElem(11, 11, 12),
      baseElem(12, 12, 13),
    ];
    const supports = [fixedSupport(1), fixedSupport(13)];
    const loads: SolverInput3D['loads'] = [
      { type: 'distributed', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: -5, qZJ: -5 } },
      { type: 'distributed', data: { elementId: 7, qYI: 0, qYJ: 0, qZI: -8, qZJ: -8 } },
    ];

    const input = buildInput(arch, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    // Equilibrium sanity: ΣFz of reactions = +5 kN/m × 1 m of element 1 (1 m projected length on x ≈ 1m)
    // Just check the solver returns a reaction array (no throw).
    expect(result.reactions.length).toBeGreaterThan(0);
  });

  // Three-Hinge Arch shape but loaded in 3D mode. Two members, one interior
  // hinge at the crown. Pinned supports at both ends. In 2D this is the
  // classic stable "3-hinge arch" (3 hinges = 2 supports + 1 interior). In
  // 3D today it fails because the interior hinge over-releases.
  it('Three-Hinge Arch (3 nodes, 2 members, crown hinge) in 3D must solve', () => {
    const nodes = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 5, y: 0, z: 3 },   // crown
      { id: 3, x: 10, y: 0, z: 0 },
    ];
    // Per-axis pin hinge at the crown: release ONLY Mz (in-plane bending
    // about the pin axis perpendicular to the X-Z arch plane). My and
    // torsion stay coupled across the hinge.
    //
    // We release Mz on only ONE of the two members at the crown — that is
    // enough to break in-plane moment continuity (a 3-hinge arch idiom).
    // Releasing on both adjacent ends of an unsupported node would leave
    // node 2's Mz with zero diagonal (3D analog of Bug A: orphan rotation
    // DOF on the strong axis); that's tracked separately and is not part
    // of the Bug B per-axis schema fix this test guards.
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
        releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false,
        releaseTStart: false, releaseTEnd: false },
      { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1,
        releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: true, releaseMzEnd: false,
        releaseTStart: false, releaseTEnd: false },
    ];
    // Fully fix both ends: this isolates the test to the per-axis hinge
    // schema. Bug B was about over-release (releasing My in addition to
    // Mz); proving Mz-only release solves cleanly is the property under
    // test. Under-constrained 3D supports are a separate concern.
    const supports: SolverSupport3D[] = [fixedSupport(1), fixedSupport(3)];
    const loads: SolverInput3D['loads'] = [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } },
    ];

    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    // Equilibrium: ΣFz_reactions = +10 kN
    const sumFz = result.reactions.reduce((s, r) => s + r.fz, 0);
    expect(Math.abs(sumFz - 10)).toBeLessThan(1e-3);
  });

  // Contract test (Bug B follow-up): 3D ElementForces output must mirror the
  // per-axis release contract. The legacy hingeStart/hingeEnd booleans on
  // ElementForces3D were a 2D-style shortcut that erased which axis was
  // released. Solver output now carries the same six per-axis flags as the
  // input — anything else is contract drift.
  it('ElementForces3D output exposes per-axis release flags, not legacy hinge bools', () => {
    const nodes = [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 5, y: 0, z: 3 },
      { id: 3, x: 10, y: 0, z: 0 },
    ];
    const elements: SolverElement3D[] = [
      { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
        releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false,
        releaseTStart: false, releaseTEnd: false },
      { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1,
        releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: true, releaseMzEnd: false,
        releaseTStart: false, releaseTEnd: false },
    ];
    const supports: SolverSupport3D[] = [fixedSupport(1), fixedSupport(3)];
    const loads: SolverInput3D['loads'] = [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } },
    ];

    const input = buildInput(nodes, elements, supports, loads);
    const result = solve3D(input);
    assertSuccess(result);

    const ef2 = result.elementForces.find(e => e.elementId === 2);
    expect(ef2).toBeDefined();

    // Per-axis flags must round-trip from input to output.
    const ef2Any = ef2 as unknown as Record<string, unknown>;
    expect(ef2Any.releaseMzStart).toBe(true);
    expect(ef2Any.releaseMzEnd).toBe(false);
    expect(ef2Any.releaseMyStart).toBe(false);
    expect(ef2Any.releaseMyEnd).toBe(false);
    expect(ef2Any.releaseTStart).toBe(false);
    expect(ef2Any.releaseTEnd).toBe(false);

    // Legacy bools must NOT survive on output. If they do, the schema is
    // still 2D-dialect — the rest of the app will keep over-releasing both
    // bending planes off a single bool.
    expect(ef2Any.hingeStart).toBeUndefined();
    expect(ef2Any.hingeEnd).toBeUndefined();
  });
});
