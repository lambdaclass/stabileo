/**
 * Z-up field name regression tests.
 *
 * Bug 1: Canvas draw-deformed.ts / draw-modes.ts read `uy` and `rz` from 2D
 * Displacement objects, but after the Z-up migration those fields are `uz` and
 * `ry`. This causes deformed shapes and mode shapes to render as flat lines.
 *
 * Bug 2: 3D self-weight loads in solver-shells.ts and solver-service.ts apply
 * gravity to `fy` instead of `fz`, causing buildings to deflect sideways.
 */

import { describe, it, expect } from 'vitest';
import { solve, solve3D } from '../wasm-solver';
import type { SolverInput, SolverLoad } from '../types';
import type {
  SolverInput3D, SolverNode3D, SolverSection3D, SolverElement3D,
  SolverSupport3D, AnalysisResults3D,
} from '../types-3d';
import type { SolverMaterial } from '../types';
import { plateSelfWeightLoads, quadSelfWeightLoads, convertSurfaceLoad } from '../solver-shells';

// ─── Bug 1: 2D Displacement field names ────────────────────────

describe('Bug 1: 2D Displacement uses uz/ry (not uy/rz)', () => {
  const E = 200_000;
  const A = 0.01;
  const Iz = 1e-4;

  function makeCantilever(): SolverInput {
    return {
      nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 5, y: 0 }]]),
      materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: A, iz: Iz }]]),
      elements: new Map([[1, {
        id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2,
        materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false,
      }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as any }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }] as SolverLoad[],
    };
  }

  it('solver returns uz and ry fields on Displacement', () => {
    const results = solve(makeCantilever());
    const tipDisp = results.displacements.find(d => d.nodeId === 2)!;

    // Z-up fields must exist and be non-zero for a loaded cantilever
    expect(tipDisp).toHaveProperty('uz');
    expect(tipDisp).toHaveProperty('ry');
    expect(Math.abs(tipDisp.uz)).toBeGreaterThan(1e-10);
    expect(Math.abs(tipDisp.ry)).toBeGreaterThan(1e-10);

    // Old Y-up fields must NOT exist
    expect(tipDisp).not.toHaveProperty('uy');
    expect(tipDisp).not.toHaveProperty('rz');
  });

  it('draw-deformed dispMap type must use uz/ry', () => {
    // Verify the contract: canvas code must read uz/ry, not uy/rz.
    // If draw-deformed.ts reads .uy it gets undefined → zero displacement.
    const results = solve(makeCantilever());
    const tipDisp = results.displacements.find(d => d.nodeId === 2)!;

    const asAny = tipDisp as any;
    expect(asAny.uy).toBeUndefined();
    expect(asAny.rz).toBeUndefined();
    expect(Math.abs(tipDisp.uz)).toBeGreaterThan(1e-6);
    expect(Math.abs(tipDisp.ry)).toBeGreaterThan(1e-6);
  });
});

// ─── Bug 2: 3D self-weight loads use wrong axis ────────────────

describe('Bug 2: 3D self-weight must apply gravity to fz (not fy)', () => {
  it('plateSelfWeightLoads produces fz loads, not fy', () => {
    const plates = new Map([[1, {
      id: 1, nodes: [1, 2, 3] as [number, number, number],
      materialId: 1, thickness: 0.2,
    }]]);
    const nodes = new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 1, y: 0, z: 0 }],
      [3, { id: 3, x: 0, y: 1, z: 0 }],
    ]);
    const materials = new Map([[1, {
      id: 1, e: 200000, nu: 0.3, rho: 78.5, fy: 250,
    }]]);

    const loads = plateSelfWeightLoads(plates, nodes, materials as any);

    expect(loads.length).toBe(3);
    for (const load of loads) {
      expect(load.type).toBe('nodal');
      // Gravity must be in fz (downward = negative Z in Z-up)
      expect(load.data.fz).toBeLessThan(0);
      // fy must be zero — gravity does NOT act sideways
      expect(load.data.fy).toBe(0);
    }
  });

  it('quadSelfWeightLoads produces fz loads, not fy', () => {
    const quads = new Map([[1, {
      id: 1, nodes: [1, 2, 3, 4] as [number, number, number, number],
      materialId: 1, thickness: 0.2,
    }]]);
    const nodes = new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 1, y: 0, z: 0 }],
      [3, { id: 3, x: 1, y: 1, z: 0 }],
      [4, { id: 4, x: 0, y: 1, z: 0 }],
    ]);
    const materials = new Map([[1, {
      id: 1, e: 200000, nu: 0.3, rho: 78.5, fy: 250,
    }]]);

    const loads = quadSelfWeightLoads(quads, nodes, materials as any);

    expect(loads.length).toBe(4);
    for (const load of loads) {
      expect(load.data.fz).toBeLessThan(0);
      expect(load.data.fy).toBe(0);
    }
  });

  it('convertSurfaceLoad should use fz not fy', () => {
    const quads = new Map([[1, {
      id: 1, nodes: [1, 2, 3, 4] as [number, number, number, number],
      materialId: 1, thickness: 0.2,
    }]]);
    const nodes = new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 1, y: 0, z: 0 }],
      [3, { id: 3, x: 1, y: 1, z: 0 }],
      [4, { id: 4, x: 0, y: 1, z: 0 }],
    ]);

    const surfaceLoad = { quadId: 1, q: 10 };
    const loads = convertSurfaceLoad(surfaceLoad as any, quads, nodes as any);

    expect(loads.length).toBe(4);
    for (const load of loads) {
      // Pressure on horizontal surface acts in Z
      expect(load.data.fz).not.toBe(0);
      expect(load.data.fy).toBe(0);
    }
  });

  it('3D cantilever with self-weight deflects in Z, not Y', () => {
    // Horizontal cantilever along X axis with self-weight
    // If gravity is correctly applied to fz, the beam deflects in Z (downward)
    // If buggy (applied to fy), it deflects in Y (sideways)
    const steelMat: SolverMaterial = { id: 1, e: 200000, nu: 0.3 };
    const section: SolverSection3D = { id: 1, a: 0.01, iz: 8.33e-6, iy: 4.16e-6, j: 1e-5 };

    const input: SolverInput3D = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 5, y: 0, z: 0 }],
      ]),
      materials: new Map([[1, steelMat]]),
      sections: new Map([[1, section]]),
      elements: new Map([[1, {
        id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2,
        materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false,
      }]]),
      supports: new Map([[0, {
        nodeId: 1,
        rx: true, ry: true, rz: true,
        rrx: true, rry: true, rrz: true,
      }]]),
      // Apply gravity as nodal loads in fz (simulating what buildSolverLoads3D should produce)
      // Weight = rho * A * L = 78.5 * 0.01 * 5 = 3.925 kN
      loads: [
        { type: 'nodal', data: { nodeId: 1, fx: 0, fy: 0, fz: -1.9625, mx: 0, my: 0, mz: 0 } },
        { type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -1.9625, mx: 0, my: 0, mz: 0 } },
      ],
    };

    const result = solve3D(input);
    if (typeof result === 'string') throw new Error(result);

    const tipDisp = result.displacements.find(d => d.nodeId === 2)!;
    // Gravity in Z → deflection in Z, not Y
    expect(Math.abs(tipDisp.uz)).toBeGreaterThan(1e-6);
    expect(Math.abs(tipDisp.uy)).toBeLessThan(1e-10);
  });
});
