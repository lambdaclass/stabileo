/**
 * PR [12] — embedded 2D→3D bridge for hinges/releases & local axes.
 *
 * Basic 2D is an X-Z structural plane (2D-y → physical Z, out-of-plane = Y).
 * The 2D solver is internally x/z/θy and the 2D model stores its single in-plane
 * bending release as `releaseI.mz` (historical name). When a flat 2D model is
 * solved in 3D (shouldEmbedFlat2DModelIn3D → project2DToXZ), the in-plane bending
 * is My (about local y), so that release must map to releaseMy — and the canonical
 * local axes must be forced so the solver frame matches the frame the member loads
 * were decomposed in.
 *
 * These assertions check the deterministic solver-INPUT mapping (no WASM needed).
 */
import { describe, it, expect } from 'vitest';
import { buildSolverInput3D } from '../solver-service';

function makeModel(opts: { flat: boolean; releaseEndMz: boolean }) {
  // Three collinear nodes along X. When `flat`, all z=0 → embedded as X-Z.
  // When not flat, node 3 lifts out of plane → genuine 3D (no projection).
  const nodes = new Map<number, any>([
    [1, { id: 1, x: 0, y: 0, z: 0 }],
    [2, { id: 2, x: 4, y: 0, z: 0 }],
    [3, { id: 3, x: 8, y: 0, z: opts.flat ? 0 : 2 }],
  ]);
  const sections = new Map<number, any>([
    [1, { id: 1, name: 'IPN 300', a: 0.0069, iy: 9.8e-5, iz: 4.51e-6, j: 1e-7, b: 0.125, h: 0.3, shape: 'I', tw: 0.0108, tf: 0.0162 }],
  ]);
  const materials = new Map<number, any>([
    [1, { id: 1, name: 'Steel', e: 200e6, nu: 0.3, fy: 355_000, rho: 78.5 }],
  ]);
  const elements = new Map<number, any>([
    // Element 1: internal hinge at node 2 (its J end) released about 2D `mz`.
    [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
          releaseI: { my: false, mz: false, t: false },
          releaseJ: { my: false, mz: opts.releaseEndMz, t: false } }],
    [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1,
          releaseI: { my: false, mz: false, t: false },
          releaseJ: { my: false, mz: false, t: false } }],
  ]);
  const supports = new Map<number, any>([
    [1, { id: 1, nodeId: 1, type: 'pinned' }],
    [2, { id: 2, nodeId: 3, type: 'rollerX' }],
  ]);
  return { nodes, elements, materials, sections, supports, loads: [], loadCases: [{ id: 1, name: 'D', type: 'dead' }] } as any;
}

describe('embedded 2D (X-Z) → 3D bridge: hinge maps to My, axes forced canonical', () => {
  it('flat 2D model embeds: 2D `mz` release → releaseMy (NOT releaseMz)', () => {
    const input = buildSolverInput3D(makeModel({ flat: true, releaseEndMz: true }));
    const el1 = input.elements.get(1)!;
    // In-plane hinge (2D mz) becomes My in the X-Z embed.
    expect(el1.releaseMyEnd).toBe(true);
    expect(el1.releaseMzEnd).toBe(false);
    // The unreleased start stays unreleased on both axes.
    expect(el1.releaseMyStart).toBe(false);
    expect(el1.releaseMzStart).toBe(false);
  });

  it('flat 2D model embeds: canonical local axes are forced (ey ≈ ±global Y, out of plane)', () => {
    const input = buildSolverInput3D(makeModel({ flat: true, releaseEndMz: false }));
    const el1 = input.elements.get(1)!;
    // Horizontal member along X in the X-Z plane → local y is the out-of-plane axis (global Y).
    expect(el1.localYx).toBeDefined();
    expect(Math.abs(el1.localYy)).toBeCloseTo(1, 6);
    expect(Math.abs(el1.localYx)).toBeCloseTo(0, 6);
    expect(Math.abs(el1.localYz)).toBeCloseTo(0, 6);
  });

  it('genuine 3D model (non-flat): `mz` release stays releaseMz (unchanged)', () => {
    const input = buildSolverInput3D(makeModel({ flat: false, releaseEndMz: true }));
    const el1 = input.elements.get(1)!;
    expect(el1.releaseMzEnd).toBe(true);
    expect(el1.releaseMyEnd).toBe(false);
  });

  it('no-release flat model: both bending axes coupled', () => {
    const input = buildSolverInput3D(makeModel({ flat: true, releaseEndMz: false }));
    const el1 = input.elements.get(1)!;
    expect(el1.releaseMyEnd).toBe(false);
    expect(el1.releaseMzEnd).toBe(false);
  });
});
