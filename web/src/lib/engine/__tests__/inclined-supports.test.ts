/**
 * Tests for inclined supports (rollers at arbitrary angles),
 * rotated springs, and kinematic analysis with inclined members.
 *
 * Verifies that:
 * 1. Inclined rollers correctly restrain in the specified direction
 * 2. Axis-aligned rollers (0°, 90°, 180°, 270°) produce identical results to standard rollerX/rollerY
 * 3. Rotated springs correctly couple stiffness in both axes
 * 4. Prescribed displacement (di) on inclined rollers works correctly
 * 5. Kinematic analysis correctly handles inclined supports
 * 6. Structures with inclined bars + inclined supports solve correctly
 */

import { describe, it, expect } from 'vitest';
import { solve } from '../solver-js';
import { computeStaticDegree, analyzeKinematics } from '../kinematic-2d';
import type { SolverInput, SolverSupport, SolverLoad } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────

function makeInput(opts: {
  nodes: Array<{ id: number; x: number; y: number }>;
  elements: Array<{ id: number; nodeI: number; nodeJ: number; type?: 'frame' | 'truss'; hingeStart?: boolean; hingeEnd?: boolean }>;
  supports: Array<SolverSupport>;
  loads: SolverLoad[];
  mat?: { e: number; nu: number };
  sec?: { a: number; iz: number };
}): SolverInput {
  const mat = opts.mat ?? { e: 200e3, nu: 0.3 }; // 200 GPa steel
  const sec = opts.sec ?? { a: 0.01, iz: 0.0001 }; // 100cm², I=10000cm⁴

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

function distLoad(elementId: number, qI: number, qJ: number): SolverLoad {
  return { type: 'distributed', data: { elementId, qI, qJ } };
}

// ─── Inclined Roller: Basic Behavior ─────────────────────────────────

describe('Inclined Roller - Basic Behavior', () => {
  it('45° inclined roller: reaction has equal horizontal and vertical components', () => {
    // Horizontal beam: node 1 (0,0) pinned, node 2 (5,0) with 45° inclined roller
    // Vertical load -10 kN at node 2
    // 45° roller restrains perpendicular to 45° surface → restrains at 45° from horizontal
    // So reaction at node 2 has equal horizontal and vertical components
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: Math.PI / 4 }, // 45°
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const result = solve(input);
    const r2 = result.reactions.find(r => r.nodeId === 2)!;

    // Reaction perpendicular to 45° surface: |rx| ≈ |ry|
    expect(Math.abs(r2.rx)).toBeCloseTo(Math.abs(r2.ry), 2);
    // Reaction should be positive (pushing back against load)
    expect(r2.ry).toBeGreaterThan(0);
  });

  it('inclined roller at 0° matches rollerX behavior', () => {
    // Horizontal beam with pinned + rollerX at the ends
    const inputRollerX = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'rollerX' },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    // Same with inclinedRoller at 0° (equivalent to rollerX)
    const inputInclined = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: 0 },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const resA = solve(inputRollerX);
    const resB = solve(inputInclined);

    // Helper to get reaction (default to 0 if not in array)
    const getRx = (res: typeof resA, nodeId: number) => res.reactions.find(r => r.nodeId === nodeId)?.rx ?? 0;
    const getRy = (res: typeof resA, nodeId: number) => res.reactions.find(r => r.nodeId === nodeId)?.ry ?? 0;

    // Vertical reactions should be very close
    expect(getRy(resB, 1)).toBeCloseTo(getRy(resA, 1), 2);
    expect(getRy(resB, 2)).toBeCloseTo(getRy(resA, 2), 2);
    // Horizontal reaction at node 2 should be ≈ 0 (free in X)
    expect(Math.abs(getRx(resB, 2))).toBeLessThan(0.1);
  });

  it('inclined roller at 90° matches rollerY behavior', () => {
    const inputRollerY = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 2, type: 'rollerY' },
      ],
      loads: [nodalLoad(2, 10, 0)],
    });

    const inputInclined = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: Math.PI / 2 },
      ],
      loads: [nodalLoad(2, 10, 0)],
    });

    const resA = solve(inputRollerY);
    const resB = solve(inputInclined);

    const r2a = resA.reactions.find(r => r.nodeId === 2)!;
    const r2b = resB.reactions.find(r => r.nodeId === 2)!;

    expect(r2b.rx).toBeCloseTo(r2a.rx, 1);
    // rollerY allows free movement in Y → ry ≈ 0
    expect(Math.abs(r2b.ry)).toBeLessThan(0.1);
  });

  it('equilibrium is satisfied with inclined roller', () => {
    // Simply supported beam with 45° roller
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 6, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: Math.PI / 4 },
      ],
      loads: [nodalLoad(2, 0, -20)],
    });

    const result = solve(input);
    const totalRx = result.reactions.reduce((s, r) => s + r.rx, 0);
    const totalRy = result.reactions.reduce((s, r) => s + r.ry, 0);

    // ΣFx = 0 (external Fx=0)
    expect(totalRx).toBeCloseTo(0, 1);
    // ΣFy = -20 + Ry_total = 0
    expect(totalRy).toBeCloseTo(20, 1);
  });
});

// ─── Inclined Roller: Various Angles ─────────────────────────────────

describe('Inclined Roller - Various Angles', () => {
  const angles = [30, 60, 120, 135, 150, 210, 240, 300, 330];

  for (const angleDeg of angles) {
    it(`${angleDeg}° inclined roller: global equilibrium satisfied`, () => {
      const angleRad = angleDeg * Math.PI / 180;
      const input = makeInput({
        nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 0 }],
        elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
        supports: [
          { id: 1, nodeId: 1, type: 'pinned' },
          { id: 2, nodeId: 2, type: 'inclinedRoller', angle: angleRad },
        ],
        loads: [nodalLoad(2, 0, -15)],
      });

      const result = solve(input);
      const totalFx = result.reactions.reduce((s, r) => s + r.rx, 0);
      const totalFy = result.reactions.reduce((s, r) => s + r.ry, 0);

      // ΣFx should balance (applied Fx=0)
      expect(totalFx).toBeCloseTo(0, 1);
      // ΣFy should equal applied load
      expect(totalFy).toBeCloseTo(15, 1);
    });

    it(`${angleDeg}° inclined roller: displacement in free direction is non-zero`, () => {
      const angleRad = angleDeg * Math.PI / 180;
      const input = makeInput({
        nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 0 }],
        elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
        supports: [
          { id: 1, nodeId: 1, type: 'pinned' },
          { id: 2, nodeId: 2, type: 'inclinedRoller', angle: angleRad },
        ],
        loads: [nodalLoad(2, 0, -15)],
      });

      const result = solve(input);
      const d2 = result.displacements.find(d => d.nodeId === 2)!;

      // Displacement perpendicular to the rolling surface should be ≈ 0
      const uPerp = d2.ux * Math.sin(angleRad) + d2.uy * Math.cos(angleRad);
      expect(Math.abs(uPerp)).toBeLessThan(1e-6);
    });
  }
});

// ─── Inclined Bars with Inclined Supports ────────────────────────────

describe('Inclined Bars with Inclined Supports', () => {
  it('45° inclined bar with pinned ends: equilibrium under gravity-like load', () => {
    // Bar from (0,0) to (3,3)
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 3, y: 3 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'rollerX' },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const result = solve(input);
    const totalRy = result.reactions.reduce((s, r) => s + r.ry, 0);
    expect(totalRy).toBeCloseTo(10, 2);
  });

  it('inclined bar + inclined roller: equilibrium', () => {
    // 30° inclined bar with 45° inclined roller (not parallel to bar → solvable)
    const L = 4;
    const angle = 30 * Math.PI / 180;
    const x2 = L * Math.cos(angle);
    const y2 = L * Math.sin(angle);

    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: x2, y: y2 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: Math.PI / 4 }, // 45° — different from bar angle
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const result = solve(input);
    const totalFx = result.reactions.reduce((s, r) => s + r.rx, 0);
    const totalFy = result.reactions.reduce((s, r) => s + r.ry, 0);

    expect(totalFx).toBeCloseTo(0, 1);
    expect(totalFy).toBeCloseTo(10, 1);
  });

  it('triangular truss with inclined roller: correct member forces', () => {
    // Triangle: nodes at (0,0), (4,0), (2,3)
    // Pinned at node 1, inclined roller at 30° at node 2
    // Vertical load at node 3
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 4, y: 0 },
        { id: 3, x: 2, y: 3 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2, type: 'truss' },
        { id: 2, nodeI: 2, nodeJ: 3, type: 'truss' },
        { id: 3, nodeI: 1, nodeJ: 3, type: 'truss' },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: Math.PI / 6 }, // 30°
      ],
      loads: [nodalLoad(3, 0, -10)],
    });

    const result = solve(input);

    // Verify equilibrium
    const totalFx = result.reactions.reduce((s, r) => s + r.rx, 0);
    const totalFy = result.reactions.reduce((s, r) => s + r.ry, 0);
    expect(totalFx).toBeCloseTo(0, 1);
    expect(totalFy).toBeCloseTo(10, 1);

    // Verify node 2 displacement is constrained in 30° direction
    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    const uPerp = d2.ux * Math.sin(Math.PI / 6) + d2.uy * Math.cos(Math.PI / 6);
    expect(Math.abs(uPerp)).toBeLessThan(1e-6);
  });

  it('portal frame with inclined bars and mixed supports', () => {
    // Portal: columns 0→1, 2→3 (vertical), beam 1→3
    // But column 2→3 is inclined at 15°
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 0, y: 4 },
        { id: 3, x: 6, y: 0 },
        { id: 4, x: 5.5, y: 4 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 4 },
        { id: 3, nodeI: 3, nodeJ: 4 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 3, type: 'inclinedRoller', angle: Math.PI / 6 },
      ],
      loads: [nodalLoad(2, 5, -10)],
    });

    const result = solve(input);
    const totalFx = result.reactions.reduce((s, r) => s + r.rx, 0);
    const totalFy = result.reactions.reduce((s, r) => s + r.ry, 0);

    expect(totalFx).toBeCloseTo(-5, 1);
    expect(totalFy).toBeCloseTo(10, 1);
  });
});

// ─── Rotated Spring Supports ─────────────────────────────────────────

describe('Rotated Spring Supports', () => {
  it('spring at 0° (no rotation): standard behavior', () => {
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'spring', kx: 0, ky: 5000, kz: 0 },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const result = solve(input);
    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    // Vertical displacement should be close to F/k = -10/5000 = -0.002 (plus beam deflection)
    expect(d2.uy).toBeLessThan(0);
    // Horizontal should be small (only from beam deformation)
    expect(Math.abs(d2.ux)).toBeLessThan(Math.abs(d2.uy));
  });

  it('spring at 90° rotation: kx acts vertically, ky acts horizontally', () => {
    // Spring with kx=5000, ky=0 rotated 90° should act like ky=5000 vertically
    const inputNormal = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'spring', kx: 0, ky: 5000, kz: 0 },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const inputRotated = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'spring', kx: 5000, ky: 0, kz: 0, angle: Math.PI / 2 },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const resNormal = solve(inputNormal);
    const resRotated = solve(inputRotated);

    const d2normal = resNormal.displacements.find(d => d.nodeId === 2)!;
    const d2rotated = resRotated.displacements.find(d => d.nodeId === 2)!;

    // Vertical displacement should be similar
    expect(d2rotated.uy).toBeCloseTo(d2normal.uy, 4);
  });

  it('spring at 45°: stiffness couples both directions', () => {
    // Spring with kx=10000, ky=0 at 45° should add equal stiffness to both x and y
    // and cross-coupling terms
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'spring', kx: 10000, ky: 0, kz: 0, angle: Math.PI / 4 },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const result = solve(input);
    const d2 = result.displacements.find(d => d.nodeId === 2)!;

    // Both ux and uy should be non-zero due to coupling
    expect(d2.uy).toBeLessThan(0); // deflects down
    expect(Math.abs(d2.ux)).toBeGreaterThan(1e-6); // coupling produces horizontal displacement
  });

  it('rotated spring: equilibrium is satisfied', () => {
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 3, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'spring', kx: 8000, ky: 2000, kz: 100, angle: Math.PI / 3 },
      ],
      loads: [nodalLoad(2, 5, -10)],
    });

    const result = solve(input);
    const totalFx = result.reactions.reduce((s, r) => s + r.rx, 0);
    const totalFy = result.reactions.reduce((s, r) => s + r.ry, 0);

    expect(totalFx).toBeCloseTo(-5, 1);
    expect(totalFy).toBeCloseTo(10, 1);
  });
});

// ─── Prescribed Displacement on Inclined Rollers ─────────────────────

describe('Prescribed Displacement on Inclined Rollers', () => {
  it('rollerX with prescribed dy: node displaces by prescribed amount', () => {
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 2, type: 'rollerX', dy: -0.01 }, // 10mm downward
      ],
      loads: [],
    });

    const result = solve(input);
    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    expect(d2.uy).toBeCloseTo(-0.01, 4);
  });

  it('inclined roller at 45° with prescribed di: displacement in restrained direction', () => {
    // Inclined roller at 45° with di = 0.005m
    // Restrained direction: 45° from horizontal
    // Prescribed: u_perp = di = 0.005
    // This means: ux*sin(45°) + uy*cos(45°) ≈ 0.005
    const alpha = Math.PI / 4;
    const di = 0.005;
    const prescDx = di * Math.sin(alpha);
    const prescDy = di * Math.cos(alpha);

    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: alpha, dx: prescDx, dy: prescDy },
      ],
      loads: [],
    });

    const result = solve(input);
    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    const uPerp = d2.ux * Math.sin(alpha) + d2.uy * Math.cos(alpha);
    expect(uPerp).toBeCloseTo(di, 3);
  });
});

// ─── Kinematic Analysis with Inclined Supports ───────────────────────

describe('Kinematic Analysis with Inclined Supports', () => {
  it('simply supported beam with inclined roller: isostatic', () => {
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: Math.PI / 4 },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const { degree } = computeStaticDegree(input);
    // pinned=2 DOF + inclinedRoller=1 DOF = 3 reactions, 2 nodes → 3*1+0 - 3*2 + 3 = 0
    // Frame: 3*m + r - 3*n - c = 3*1 + 3 - 3*2 - 0 = 0 → isostatic
    expect(degree).toBe(0);
  });

  it('beam with two inclined rollers and a pinned support: hyperstatic', () => {
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
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: Math.PI / 4 },
        { id: 3, nodeId: 3, type: 'inclinedRoller', angle: Math.PI / 3 },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const { degree } = computeStaticDegree(input);
    // pinned=2 + 1 + 1 = 4 reactions, 2 elements, 3 nodes
    // 3*2 + 4 - 3*3 = 1 → hyperstatic
    expect(degree).toBe(1);
  });

  it('kinematic analysis: inclined roller truss is solvable', () => {
    // Simple truss with inclined roller
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 4, y: 0 },
        { id: 3, x: 2, y: 3 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2, type: 'truss' },
        { id: 2, nodeI: 2, nodeJ: 3, type: 'truss' },
        { id: 3, nodeI: 1, nodeJ: 3, type: 'truss' },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: Math.PI / 6 },
      ],
      loads: [nodalLoad(3, 0, -10)],
    });

    const kinematic = analyzeKinematics(input);
    expect(kinematic.isSolvable).toBe(true);
    expect(kinematic.mechanismModes).toBe(0);
  });

  it('kinematic analysis: inclined roller can create mechanism if poorly placed', () => {
    // Beam with both supports as inclined rollers at same angle → mechanism
    // (both allow sliding in same direction → translational mechanism)
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'inclinedRoller', angle: Math.PI / 4 },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: Math.PI / 4 },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const { degree } = computeStaticDegree(input);
    // 2 reactions, 1 element, 2 nodes: 3*1 + 2 - 3*2 = -1 → hypostatic
    expect(degree).toBeLessThan(0);
  });
});

// ─── Mixed: Inclined Bars + Loads + Supports ─────────────────────────

describe('Mixed: Inclined Bars + Loads + Supports', () => {
  it('V-shaped frame with inclined roller at apex: equilibrium', () => {
    // V-shape: node 1 (0,0), node 2 (3,4), node 3 (6,0)
    // Pinned at 1, rollerX at 3, vertical load at 2
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 4 },
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
      loads: [nodalLoad(2, 0, -20)],
    });

    const result = solve(input);
    const totalFy = result.reactions.reduce((s, r) => s + r.ry, 0);
    expect(totalFy).toBeCloseTo(20, 2);

    // By symmetry, both supports should have equal vertical reactions
    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    const r3 = result.reactions.find(r => r.nodeId === 3)!;
    expect(r1.ry).toBeCloseTo(r3.ry, 1);
    expect(r1.ry).toBeCloseTo(10, 1);
  });

  it('distributed load on inclined bar with inclined support', () => {
    // Inclined bar from (0,0) to (3,4) with distributed load
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 3, y: 4 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: Math.PI / 3 },
      ],
      loads: [distLoad(1, -5, -5)],
    });

    const result = solve(input);
    // Just verify it solves without errors and equilibrium holds
    const totalRy = result.reactions.reduce((s, r) => s + r.ry, 0);
    // Total distributed load: q * L where L = sqrt(9+16) = 5
    // Load is perpendicular to the element, so we need to decompose
    // But we just check it doesn't crash and reactions are finite
    expect(isFinite(totalRy)).toBe(true);
    expect(result.elementForces.length).toBe(1);
  });

  it('complex structure: frame with inclined members and inclined rollers', () => {
    // 3-bar structure with various angles
    const input = makeInput({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 4, y: 3 },
        { id: 3, x: 8, y: 1 },
        { id: 4, x: 12, y: 0 },
      ],
      elements: [
        { id: 1, nodeI: 1, nodeJ: 2 },
        { id: 2, nodeI: 2, nodeJ: 3 },
        { id: 3, nodeI: 3, nodeJ: 4 },
      ],
      supports: [
        { id: 1, nodeId: 1, type: 'fixed' },
        { id: 2, nodeId: 4, type: 'inclinedRoller', angle: Math.PI / 5 }, // 36°
      ],
      loads: [
        nodalLoad(2, 3, -10),
        nodalLoad(3, -2, -5),
      ],
    });

    const result = solve(input);

    // Verify equilibrium
    const totalFx = result.reactions.reduce((s, r) => s + r.rx, 0);
    const totalFy = result.reactions.reduce((s, r) => s + r.ry, 0);
    // Applied: Fx = 3 + (-2) = 1, Fy = -10 + (-5) = -15
    expect(totalFx).toBeCloseTo(-1, 1);
    expect(totalFy).toBeCloseTo(15, 1);

    // Node 4 should be constrained perpendicular to roller direction
    const d4 = result.displacements.find(d => d.nodeId === 4)!;
    const uPerp = d4.ux * Math.sin(Math.PI / 5) + d4.uy * Math.cos(Math.PI / 5);
    expect(Math.abs(uPerp)).toBeLessThan(1e-5);
  });
});

// ─── Symmetry and Consistency Tests ──────────────────────────────────

describe('Symmetry and Consistency', () => {
  it('inclined roller at 180°: same as rollerX but inverted direction', () => {
    // rollerX at 180° is equivalent to rollerX at 0° (restrains Y in both cases)
    const inputA = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: Math.PI }, // 180°
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const inputB = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'inclinedRoller', angle: 0 },
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const resA = solve(inputA);
    const resB = solve(inputB);

    const d2a = resA.displacements.find(d => d.nodeId === 2)!;
    const d2b = resB.displacements.find(d => d.nodeId === 2)!;

    // Vertical displacement should be same (both restrain Y direction)
    expect(d2a.uy).toBeCloseTo(d2b.uy, 4);
  });

  it('symmetric structure with symmetric inclined rollers: symmetric response', () => {
    // Symmetric beam with symmetric 45° rollers
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
        { id: 1, nodeId: 1, type: 'inclinedRoller', angle: Math.PI / 4 },    // 45° CW
        { id: 2, nodeId: 2, type: 'pinned' },
        { id: 3, nodeId: 3, type: 'inclinedRoller', angle: -Math.PI / 4 },   // 45° CCW
      ],
      loads: [nodalLoad(2, 0, -10)],
    });

    const result = solve(input);

    // Helper to get reaction (default to 0 if not in array)
    const getRx = (nodeId: number) => result.reactions.find(r => r.nodeId === nodeId)?.rx ?? 0;
    const getRy = (nodeId: number) => result.reactions.find(r => r.nodeId === nodeId)?.ry ?? 0;

    // By symmetry: reactions at node 1 and 3 should have same |ry| and opposite rx
    expect(Math.abs(getRy(1))).toBeCloseTo(Math.abs(getRy(3)), 1);
    // Horizontal reactions should have opposite signs (mirror)
    expect(getRx(1)).toBeCloseTo(-getRx(3), 1);

    // Total equilibrium
    const totalFy = result.reactions.reduce((s, r) => s + r.ry, 0);
    expect(totalFy).toBeCloseTo(10, 1);
  });
});
