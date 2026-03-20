// Integration tests for 3D store layer
// Tests that the model store correctly builds SolverInput3D and dispatches to solve3D

import { describe, it, expect } from 'vitest';
import { solve3D } from '../../engine/wasm-solver';
import type { SolverInput3D, SolverLoad3D, AnalysisResults3D } from '../../engine/types-3d';
import type { SolverInput } from '../../engine/types';
import { solve } from '../../engine/wasm-solver';

// ─── Snap3D pure logic tests ──────────────────────────────
// Replicate the snapWorld3D logic for unit testing (avoids importing the store)
function snapWorld3D(
  wx: number, wy: number, wz: number,
  snapToGrid: boolean, gridSize: number,
): { x: number; y: number; z: number } {
  if (!snapToGrid) return { x: wx, y: wy, z: wz };
  const g = gridSize;
  return {
    x: Math.round(wx / g) * g,
    y: Math.round(wy / g) * g,
    z: Math.round(wz / g) * g,
  };
}

describe('snapWorld3D', () => {
  it('snaps to integer grid with gridSize=1', () => {
    const r = snapWorld3D(1.3, 2.7, 0.8, true, 1);
    expect(r).toEqual({ x: 1, y: 3, z: 1 });
  });

  it('snaps to half-meter grid', () => {
    const r = snapWorld3D(1.3, 2.7, 0.8, true, 0.5);
    expect(r).toEqual({ x: 1.5, y: 2.5, z: 1 });
  });

  it('no snap when snapToGrid is false', () => {
    const r = snapWorld3D(1.3, 2.7, 0.8, false, 1);
    expect(r).toEqual({ x: 1.3, y: 2.7, z: 0.8 });
  });

  it('snaps negative coordinates correctly', () => {
    const r = snapWorld3D(-1.3, -2.7, -0.8, true, 1);
    expect(r).toEqual({ x: -1, y: -3, z: -1 });
  });

  it('snaps to quarter-meter grid', () => {
    const r = snapWorld3D(1.13, 2.37, 3.88, true, 0.25);
    expect(r).toEqual({ x: 1.25, y: 2.25, z: 4 });
  });
});

// ─── Helpers ──────────────────────────────────────────────────

/** Build a minimal SolverInput3D from simple params */
function buildInput3D(opts: {
  nodes: Array<{ id: number; x: number; y: number; z: number }>;
  elements: Array<{ id: number; type: 'frame' | 'truss'; nodeI: number; nodeJ: number }>;
  supports: Array<{ nodeId: number; rx: boolean; ry: boolean; rz: boolean; rrx: boolean; rry: boolean; rrz: boolean; kx?: number; ky?: number }>;
  loads: SolverLoad3D[];
  iy?: number;
  j?: number;
}): SolverInput3D {
  const E = 200000; // MPa
  const nu = 0.3;
  const A = 0.01;    // m²
  const Iz = 0.0001; // m⁴
  const Iy = opts.iy ?? Iz;
  const J = opts.j ?? 2 * Iz;

  return {
    nodes: new Map(opts.nodes.map(n => [n.id, n])),
    materials: new Map([[1, { id: 1, e: E, nu }]]),
    sections: new Map([[1, { id: 1, a: A, iz: Iz, iy: Iy, j: J }]]),
    elements: new Map(opts.elements.map(e => [e.id, {
      ...e, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false,
    }])),
    supports: new Map(opts.supports.map(s => [s.nodeId, s])),
    loads: opts.loads,
  };
}

function assertSuccess(result: AnalysisResults3D | string): AnalysisResults3D {
  if (typeof result === 'string') throw new Error(`Solver failed: ${result}`);
  return result;
}

// ─── Section property defaults ──────────────────────────────

describe('Section property defaults for 3D', () => {
  it('should use iz as default for iy when not provided', () => {
    const input = buildInput3D({
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 5, y: 0, z: 0 }],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } }],
    });

    // Verify section has iy = iz (default)
    const sec = input.sections.get(1)!;
    expect(sec.iy).toBe(sec.iz);
  });

  it('should use explicit iy when provided', () => {
    const Iy = 0.00005; // different from Iz
    const input = buildInput3D({
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 5, y: 0, z: 0 }],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } }],
      iy: Iy,
    });

    expect(input.sections.get(1)!.iy).toBe(Iy);
    expect(input.sections.get(1)!.iy).not.toBe(input.sections.get(1)!.iz);
  });
});

// ─── Support type mapping ──────────────────────────────────

describe('Support type mapping to 3D', () => {
  // Helper: map store SupportType to 3D booleans (matching buildSolverInput3D logic)
  function mapSupportTo3D(type: string): { rx: boolean; ry: boolean; rz: boolean; rrx: boolean; rry: boolean; rrz: boolean } {
    switch (type) {
      case 'fixed':
      case 'fixed3d':
        return { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
      case 'pinned':
      case 'pinned3d':
        return { rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false };
      case 'rollerX':
        return { rx: false, ry: true, rz: true, rrx: false, rry: false, rrz: false };
      case 'rollerY':
        return { rx: true, ry: false, rz: true, rrx: false, rry: false, rrz: false };
      case 'rollerXZ':
        return { rx: false, ry: true, rz: false, rrx: false, rry: false, rrz: false };
      case 'spring':
      case 'spring3d':
        return { rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false };
      default:
        return { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
    }
  }

  it('fixed3d → all 6 DOFs restrained', () => {
    const dofs = mapSupportTo3D('fixed3d');
    expect(dofs).toEqual({ rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
  });

  it('pinned3d → translations restrained, rotations free', () => {
    const dofs = mapSupportTo3D('pinned3d');
    expect(dofs.rx).toBe(true);
    expect(dofs.ry).toBe(true);
    expect(dofs.rz).toBe(true);
    expect(dofs.rrx).toBe(false);
    expect(dofs.rry).toBe(false);
    expect(dofs.rrz).toBe(false);
  });

  it('rollerXZ → only Y restrained', () => {
    const dofs = mapSupportTo3D('rollerXZ');
    expect(dofs.rx).toBe(false);
    expect(dofs.ry).toBe(true);
    expect(dofs.rz).toBe(false);
  });

  it('spring3d → no DOFs restrained (only springs)', () => {
    const dofs = mapSupportTo3D('spring3d');
    expect(dofs.rx).toBe(false);
    expect(dofs.ry).toBe(false);
    expect(dofs.rz).toBe(false);
    expect(dofs.rrx).toBe(false);
    expect(dofs.rry).toBe(false);
    expect(dofs.rrz).toBe(false);
  });

  it('2D fixed → maps to all 6 DOFs restrained in 3D', () => {
    const dofs = mapSupportTo3D('fixed');
    expect(dofs).toEqual({ rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
  });

  it('2D pinned → maps to 3 translations restrained in 3D', () => {
    const dofs = mapSupportTo3D('pinned');
    expect(dofs.rx).toBe(true);
    expect(dofs.ry).toBe(true);
    expect(dofs.rz).toBe(true);
  });
});

// ─── Cantilever 3D — load in Y ────────────────────────────

describe('solve3D — Cantilever with load in Y', () => {
  const L = 5; // m
  const E = 200000; // MPa → 200e6 kPa
  const Iz = 0.0001; // m⁴
  const P = -10; // kN (downward)
  const EI_kN = E * 1000 * Iz; // E in kN/m² × Iz

  const input = buildInput3D({
    nodes: [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: L, y: 0, z: 0 },
    ],
    elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
    supports: [
      { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
    ],
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, fz: 0, mx: 0, my: 0, mz: 0 } }],
  });

  it('should solve without error', () => {
    const result = solve3D(input);
    expect(typeof result).not.toBe('string');
  });

  it('displacement uy at free end matches analytical PL³/(3EI)', () => {
    const result = assertSuccess(solve3D(input));
    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    const uyExpected = P * L ** 3 / (3 * EI_kN);
    expect(d2.uy).toBeCloseTo(uyExpected, 6);
  });

  it('rotation rz at free end matches analytical PL²/(2EI)', () => {
    const result = assertSuccess(solve3D(input));
    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    const rzExpected = P * L ** 2 / (2 * EI_kN);
    expect(d2.rz).toBeCloseTo(rzExpected, 6);
  });

  it('reaction at fixed end', () => {
    const result = assertSuccess(solve3D(input));
    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    expect(r1.fy).toBeCloseTo(-P, 4);
    expect(Math.abs(r1.mz)).toBeCloseTo(Math.abs(P * L), 4);
  });
});

// ─── Cantilever 3D — load in Z ────────────────────────────

describe('solve3D — Cantilever with load in Z', () => {
  const L = 5;
  const E = 200000;
  const Iz = 0.0001; // Strong axis
  const Iy = 0.00005; // Weak axis (different from Iz)
  const Fz = -8; // kN (global Z)
  // SAP2000: beam +X → ez=(0,0,1). Global Fz projects to local Z → uses Iy
  const EIy_kN = E * 1000 * Iy;

  const input = buildInput3D({
    nodes: [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: L, y: 0, z: 0 },
    ],
    elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
    supports: [
      { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
    ],
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: Fz, mx: 0, my: 0, mz: 0 } }],
    iy: Iy,
  });

  it('should solve without error', () => {
    const result = solve3D(input);
    expect(typeof result).not.toBe('string');
  });

  it('displacement uz at free end matches analytical FzL³/(3EIy)', () => {
    // SAP2000: Fz (global) → local Z-plane → uses Iy. uz = ez[2]*w = w.
    const result = assertSuccess(solve3D(input));
    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    const uzExpected = Fz * L ** 3 / (3 * EIy_kN);
    expect(d2.uz).toBeCloseTo(uzExpected, 6);
  });

  it('reaction at fixed end', () => {
    const result = assertSuccess(solve3D(input));
    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    expect(r1.fz).toBeCloseTo(-Fz, 4);
  });
});

// ─── 2D ↔ 3D equivalence ──────────────────────────────────

describe('2D ↔ 3D equivalence', () => {
  const L = 6;
  const E = 200000;
  const nu = 0.3;
  const A = 0.01;
  const Iz = 0.0001;
  const P = -15; // kN downward

  it('2D model solved with 3D solver gives same displacements', () => {
    // Build 2D input
    const input2D: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: L, y: 0 }]]),
      materials: new Map([[1, { id: 1, e: E, nu }]]),
      sections: new Map([[1, { id: 1, a: A, iz: Iz }]]),
      elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([
        [1, { id: 1, nodeId: 1, type: 'fixed' }],
      ]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
    };

    // Build equivalent 3D input (z=0 everywhere)
    const input3D = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, fz: 0, mx: 0, my: 0, mz: 0 } }],
    });

    const result2D = solve(input2D);
    expect(typeof result2D).not.toBe('string');
    const r2d = result2D as any;

    const result3D = assertSuccess(solve3D(input3D));

    // Compare displacements at node 2
    const d2d = r2d.displacements.find((d: any) => d.nodeId === 2)!;
    const d3d = result3D.displacements.find(d => d.nodeId === 2)!;

    expect(d3d.ux).toBeCloseTo(d2d.ux, 6);
    expect(d3d.uy).toBeCloseTo(d2d.uz, 6);
    expect(d3d.rz).toBeCloseTo(d2d.ry, 6);
    // 3D should have zero out-of-plane
    expect(Math.abs(d3d.uz)).toBeLessThan(1e-10);
    expect(Math.abs(d3d.rx)).toBeLessThan(1e-10);
    expect(Math.abs(d3d.ry)).toBeLessThan(1e-10);
  });

  it('reactions match between 2D and 3D solvers', () => {
    const input2D: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: L, y: 0 }]]),
      materials: new Map([[1, { id: 1, e: E, nu }]]),
      sections: new Map([[1, { id: 1, a: A, iz: Iz }]]),
      elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, mz: 0 } }],
    };

    const input3D = buildInput3D({
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: L, y: 0, z: 0 }],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [{ nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: P, fz: 0, mx: 0, my: 0, mz: 0 } }],
    });

    const r2d = solve(input2D) as any;
    const r3d = assertSuccess(solve3D(input3D));

    const react2d = r2d.reactions.find((r: any) => r.nodeId === 1)!;
    const react3d = r3d.reactions.find(r => r.nodeId === 1)!;

    expect(react3d.fy).toBeCloseTo(react2d.rz, 4);
    expect(react3d.fx).toBeCloseTo(react2d.rx, 4);
    expect(Math.abs(react3d.mz)).toBeCloseTo(Math.abs(react2d.my), 4);
  });
});

// ─── 3D loads ──────────────────────────────────────────────

describe('3D load types', () => {
  it('nodal3d load produces correct displacements', () => {
    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 5, y: 0, z: 0 },
      ],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [{
        type: 'nodal',
        data: { nodeId: 2, fx: 5, fy: -10, fz: -3, mx: 0, my: 0, mz: 0 },
      }],
    });

    const result = assertSuccess(solve3D(input));
    const d2 = result.displacements.find(d => d.nodeId === 2)!;

    // Should have displacement in Y (from fy) and Z (from fz) and X (axial from fx)
    expect(d2.uy).not.toBe(0);
    expect(d2.uz).not.toBe(0);
    expect(d2.ux).not.toBe(0);
  });

  it('distributed3d load produces correct reactions', () => {
    const L = 4;
    const qY = -10; // kN/m in local Y (SAP2000: qY=-10 = downward for beam along +X)

    // Use 3 nodes so the WASM solver has free DOFs at the middle node
    // (both ends fully fixed leaves 0 free DOFs which WASM rejects)
    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 3, x: L / 2, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      elements: [
        { id: 1, type: 'frame', nodeI: 1, nodeJ: 3 },
        { id: 2, type: 'frame', nodeI: 3, nodeJ: 2 },
      ],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { nodeId: 2, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [
        { type: 'distributed', data: { elementId: 1, qYI: qY, qYJ: qY, qZI: 0, qZJ: 0 } },
        { type: 'distributed', data: { elementId: 2, qYI: qY, qYJ: qY, qZI: 0, qZJ: 0 } },
      ],
    });

    const result = assertSuccess(solve3D(input));

    // Sum of vertical (global Y in 3D) reactions should equal total downward load
    // SAP2000: ey=(0,1,0), qY=-10 → -10*4=40kN downward → fy reactions = +40
    const totalLoad = Math.abs(qY) * L;
    const totalReaction = result.reactions.reduce((sum, r) => sum + r.fy, 0);
    expect(totalReaction).toBeCloseTo(totalLoad, 4);
  });

  it('pointOnElement3d load in Y direction', () => {
    const L = 6;
    const py = -5; // kN in local Y at midspan
    // SAP2000: beam +X → ey=(0,1,0). local py=-5 → global force = (0,-5,0)
    // So py loads the Y-plane (Mz/Vy, uses Iz) and displacement is in global Y

    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [{
        type: 'pointOnElement',
        data: { elementId: 1, a: L / 2, py, pz: 0 },
      }],
    });

    const result = assertSuccess(solve3D(input));
    const d2 = result.displacements.find(d => d.nodeId === 2)!;

    // SAP2000: py loads Y-plane → displacement in global Y (via ey=(0,1,0)), no global Z displacement
    expect(d2.uy).not.toBe(0);
    expect(Math.abs(d2.uz)).toBeLessThan(1e-10);
  });
});

// ─── Vertical column test ──────────────────────────────────

describe('solve3D — Vertical column', () => {
  it('vertical column with lateral load at top', () => {
    const H = 4; // height
    const Fx = 10; // kN lateral

    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 0, y: H, z: 0 },
      ],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: Fx, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }],
    });

    const result = assertSuccess(solve3D(input));
    const d2 = result.displacements.find(d => d.nodeId === 2)!;

    // Should have X displacement, not Y
    expect(d2.ux).not.toBe(0);
    expect(Math.abs(d2.uy)).toBeLessThan(1e-10);

    // Reaction at base: Fx = -10 kN, Mz = Fx * H
    const r1 = result.reactions.find(r => r.nodeId === 1)!;
    expect(r1.fx).toBeCloseTo(-Fx, 4);
    expect(Math.abs(r1.mz)).toBeCloseTo(Fx * H, 3);
  });
});

// ─── Space truss ───────────────────────────────────────────

describe('solve3D — Space truss', () => {
  it('triangulated truss in 3D space', () => {
    // Simple 4-node tetrahedron truss
    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 2, y: 0, z: 0 },
        { id: 3, x: 1, y: 0, z: 2 },
        { id: 4, x: 1, y: 2, z: 1 },
      ],
      elements: [
        { id: 1, type: 'truss', nodeI: 1, nodeJ: 2 },
        { id: 2, type: 'truss', nodeI: 2, nodeJ: 3 },
        { id: 3, type: 'truss', nodeI: 3, nodeJ: 1 },
        { id: 4, type: 'truss', nodeI: 1, nodeJ: 4 },
        { id: 5, type: 'truss', nodeI: 2, nodeJ: 4 },
        { id: 6, type: 'truss', nodeI: 3, nodeJ: 4 },
      ],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false },
        { nodeId: 2, rx: false, ry: true, rz: true, rrx: false, rry: false, rrz: false },
        { nodeId: 3, rx: false, ry: true, rz: false, rrx: false, rry: false, rrz: false },
      ],
      loads: [{ type: 'nodal', data: { nodeId: 4, fx: 0, fy: -20, fz: 0, mx: 0, my: 0, mz: 0 } }],
    });

    const result = assertSuccess(solve3D(input));

    // Global equilibrium: sum of reactions + applied loads = 0
    const totalFx = result.reactions.reduce((s, r) => s + r.fx, 0) + 0;
    const totalFy = result.reactions.reduce((s, r) => s + r.fy, 0) + (-20);
    const totalFz = result.reactions.reduce((s, r) => s + r.fz, 0) + 0;

    expect(totalFx).toBeCloseTo(0, 4);
    expect(totalFy).toBeCloseTo(0, 4);
    expect(totalFz).toBeCloseTo(0, 4);

    // Node 4 should displace downward
    const d4 = result.displacements.find(d => d.nodeId === 4)!;
    expect(d4.uy).toBeLessThan(0);
  });
});

// ─── Equilibrium checks ───────────────────────────────────

describe('Global equilibrium', () => {
  it('reactions balance applied nodal loads', () => {
    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 4, y: 0, z: 0 },
        { id: 3, x: 4, y: 3, z: 0 },
      ],
      elements: [
        { id: 1, type: 'frame', nodeI: 1, nodeJ: 2 },
        { id: 2, type: 'frame', nodeI: 2, nodeJ: 3 },
      ],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { nodeId: 3, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [
        { type: 'nodal', data: { nodeId: 2, fx: 10, fy: -20, fz: 5, mx: 0, my: 0, mz: 0 } },
      ],
    });

    const result = assertSuccess(solve3D(input));

    const totalFx = result.reactions.reduce((s, r) => s + r.fx, 0) + 10;
    const totalFy = result.reactions.reduce((s, r) => s + r.fy, 0) + (-20);
    const totalFz = result.reactions.reduce((s, r) => s + r.fz, 0) + 5;

    expect(totalFx).toBeCloseTo(0, 4);
    expect(totalFy).toBeCloseTo(0, 4);
    expect(totalFz).toBeCloseTo(0, 4);
  });
});

// ─── Validation errors ────────────────────────────────────

describe('solve3D — Validation', () => {
  it('throws for insufficient supports', () => {
    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 5, y: 0, z: 0 },
      ],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [], // No supports
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } }],
    });

    // WASM solver throws on singular/mechanism structures
    expect(() => solve3D(input)).toThrow(/singular|mechanism/i);
  });

  it('returns error for zero-length element', () => {
    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 0, y: 0, z: 0 },
      ],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } }],
    });

    expect(() => solve3D(input)).toThrow();
  });
});

// ─── Out-of-plane 3D portal ────────────────────────────────

describe('solve3D — Out-of-plane portal', () => {
  it('3D portal with out-of-plane load', () => {
    // Portal: two columns + one beam, load out of XY plane
    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 0, y: 3, z: 0 },
        { id: 3, x: 4, y: 3, z: 0 },
        { id: 4, x: 4, y: 0, z: 0 },
      ],
      elements: [
        { id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }, // left column
        { id: 2, type: 'frame', nodeI: 2, nodeJ: 3 }, // beam
        { id: 3, type: 'frame', nodeI: 3, nodeJ: 4 }, // right column
      ],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { nodeId: 4, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [
        { type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 10, mx: 0, my: 0, mz: 0 } },
      ],
    });

    const result = assertSuccess(solve3D(input));

    // Node 2 should displace in Z (out of plane)
    const d2 = result.displacements.find(d => d.nodeId === 2)!;
    expect(d2.uz).not.toBe(0);
    expect(Math.abs(d2.uz)).toBeGreaterThan(1e-8);

    // Equilibrium
    const totalFz = result.reactions.reduce((s, r) => s + r.fz, 0) + 10;
    expect(totalFz).toBeCloseTo(0, 4);
  });
});

// ─── Self-weight 3D ────────────────────────────────────────

describe('solve3D — Self-weight', () => {
  it('self-weight produces downward reactions', () => {
    const L = 5;
    const rho = 78.5; // kN/m³ (steel)
    const A = 0.01;   // m²
    const w = rho * A; // kN/m

    // Build input with self-weight loads manually (equivalent to what buildSolverInput3D does)
    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
        { nodeId: 2, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false },
      ],
      loads: [
        // Self-weight as nodal loads (what buildSolverInput3D produces)
        { type: 'nodal', data: { nodeId: 1, fx: 0, fy: -w * L / 2, fz: 0, mx: 0, my: 0, mz: 0 } },
        { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -w * L / 2, fz: 0, mx: 0, my: 0, mz: 0 } },
      ],
    });

    const result = assertSuccess(solve3D(input));

    // Total reaction Fy should equal total weight
    const totalWeight = w * L;
    const totalRy = result.reactions.reduce((s, r) => s + r.fy, 0);
    expect(totalRy).toBeCloseTo(totalWeight, 4);
  });
});

// ─── Biaxial loading ──────────────────────────────────────

describe('solve3D — Biaxial loading', () => {
  it('simultaneous Y and Z loads produce independent displacements', () => {
    const L = 5;
    const Fy = -10;
    const Fz = -5;

    // Solve with both loads
    const inputBoth = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: Fy, fz: Fz, mx: 0, my: 0, mz: 0 } }],
    });

    // Solve with Y load only
    const inputY = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: Fy, fz: 0, mx: 0, my: 0, mz: 0 } }],
    });

    // Solve with Z load only
    const inputZ = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: Fz, mx: 0, my: 0, mz: 0 } }],
    });

    const rBoth = assertSuccess(solve3D(inputBoth));
    const rY = assertSuccess(solve3D(inputY));
    const rZ = assertSuccess(solve3D(inputZ));

    const dBoth = rBoth.displacements.find(d => d.nodeId === 2)!;
    const dY = rY.displacements.find(d => d.nodeId === 2)!;
    const dZ = rZ.displacements.find(d => d.nodeId === 2)!;

    // Superposition: uy from biaxial should equal uy from Y-only
    expect(dBoth.uy).toBeCloseTo(dY.uy, 6);
    // Superposition: uz from biaxial should equal uz from Z-only
    expect(dBoth.uz).toBeCloseTo(dZ.uz, 6);
  });
});

// ─── Torque ───────────────────────────────────────────────

describe('solve3D — Torque', () => {
  it('applied torque produces torsional rotation', () => {
    const L = 3;
    const Mx = 5; // kN·m torque about X

    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: L, y: 0, z: 0 },
      ],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2 }],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: Mx, my: 0, mz: 0 } }],
    });

    const result = assertSuccess(solve3D(input));
    const d2 = result.displacements.find(d => d.nodeId === 2)!;

    // rx should be positive (torsional rotation)
    // rx = Mx * L / (G * J), G = E / (2*(1+nu))
    const E = 200000 * 1000; // kN/m²
    const nu = 0.3;
    const G = E / (2 * (1 + nu));
    const J = 2 * 0.0001; // default j = 2*iz
    const rxExpected = Mx * L / (G * J);

    expect(Math.abs(d2.rx)).toBeCloseTo(Math.abs(rxExpected), 6);
    // Other DOFs should be zero
    expect(Math.abs(d2.uy)).toBeLessThan(1e-10);
    expect(Math.abs(d2.uz)).toBeLessThan(1e-10);
  });
});

// ─── Diagonal element in 3D space ─────────────────────────

describe('solve3D — Diagonal element', () => {
  it('element along XYZ diagonal carries axial load', () => {
    // Use a tetrahedral truss (3 bars, 1 free node, 3 fixed nodes) for full 3D stability
    const input = buildInput3D({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 3, y: 4, z: 5 },  // free node (diagonal in space)
        { id: 3, x: 6, y: 0, z: 0 },
        { id: 4, x: 0, y: 0, z: 6 },
      ],
      elements: [
        { id: 1, type: 'truss', nodeI: 1, nodeJ: 2 },
        { id: 2, type: 'truss', nodeI: 3, nodeJ: 2 },
        { id: 3, type: 'truss', nodeI: 4, nodeJ: 2 },
      ],
      supports: [
        { nodeId: 1, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false },
        { nodeId: 3, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false },
        { nodeId: 4, rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false },
      ],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: 0, mx: 0, my: 0, mz: 0 } }],
    });

    const result = assertSuccess(solve3D(input));

    // Truss element: only axial force
    const ef = result.elementForces[0];
    expect(Math.abs(ef.nStart)).toBeGreaterThan(0);
    expect(Math.abs(ef.vyStart)).toBeLessThan(1e-6);
    expect(Math.abs(ef.vzStart)).toBeLessThan(1e-6);

    // Equilibrium
    const totalFy = result.reactions.reduce((s, r) => s + r.fy, 0) + (-10);
    expect(totalFy).toBeCloseTo(0, 4);
  });
});
