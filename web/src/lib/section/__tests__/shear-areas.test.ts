/**
 * Shear deformation: the areas each shape gives, and a cantilever against Timoshenko's closed
 * form, δ = P·L³ / (3·E·I) + P·L / (G·As), bending in each plane.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import '../../store';
import * as wasmSolver from '../../engine/wasm-solver';
import { validateAndSolve3D } from '../../engine/solver-service';
import { geometricShearAreas, sectionShearAreas } from '../shear-areas';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

describe('shear areas from the shape', () => {
  it('reads each shape', () => {
    expect(geometricShearAreas({ shape: 'rect', a: 0.18, b: 0.3, h: 0.6 })).toEqual({ asY: 0.15, asZ: 0.15 });
    const i = geometricShearAreas({ shape: 'I', a: 0.00538, b: 0.15, h: 0.3, tw: 0.0071, tf: 0.0107 })!;
    expect(i.asY).toBeCloseTo(0.3 * 0.0071, 12);
    expect(i.asZ).toBeCloseTo((5 / 3) * 0.15 * 0.0107, 12);
    expect(geometricShearAreas({ shape: 'RHS', a: 0.01, b: 0.1, h: 0.2, t: 0.008 })).toEqual({ asY: 2 * 0.2 * 0.008, asZ: 2 * 0.1 * 0.008 });
    expect(geometricShearAreas({ shape: 'CHS', a: 0.01 })).toEqual({ asY: 0.005, asZ: 0.005 });
    expect(geometricShearAreas({ shape: 'generic', a: 0.01 })).toBeNull();
  });

  it('declared areas win, and no spec means flexural only', () => {
    const base = { id: 1, name: 's', a: 0.18, iz: 1e-3, b: 0.3, h: 0.6, shape: 'rect' as const };
    expect(sectionShearAreas(base)).toBeNull();
    expect(sectionShearAreas({ ...base, shearAreas: { basis: 'geometry' } })).toEqual({ asY: 0.15, asZ: 0.15 });
    expect(sectionShearAreas({ ...base, shearAreas: { basis: 'declared', asY: 0.1, asZ: 0.12 } })).toEqual({ asY: 0.1, asZ: 0.12 });
  });
});

describe('a deep cantilever deflects in shear too', () => {
  // Concrete, E = 25 000 MPa, ν = 0.2; 0.3 × 0.8 m, 2 m long: deep enough for shear to matter.
  const E = 25_000, NU = 0.2, B = 0.3, H = 0.8, L = 2, P = 200;
  const G = E / (2 * (1 + NU));
  const A = B * H, As = (5 / 6) * A;

  function tip(direction: 'z' | 'y', shear: boolean) {
    const mat = modelStore.addMaterial({ name: 'H25', e: E, nu: NU, rho: 0 });
    const sec = modelStore.addSection({
      name: 'V', a: A, b: B, h: H, shape: 'rect', iy: (B * H ** 3) / 12, iz: (H * B ** 3) / 12, j: 0.01,
      ...(shear ? { shearAreas: { basis: 'geometry' as const } } : {}),
    });
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElement(e, { materialId: mat, sectionId: sec });
    modelStore.addSupport(a, 'fixed3d' as never);
    modelStore.addNodalLoad3D(b, 0, direction === 'y' ? -P : 0, direction === 'z' ? -P : 0, 0, 0, 0, 1);
    const md = {
      nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
      loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
      quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints, connectors: modelStore.connectors,
    };
    const r = validateAndSolve3D(md as never, false, false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const d = r.displacements.find((x) => x.nodeId === b)!;
    return direction === 'z' ? -d.uz : -d.uy;
  }

  it('in the vertical plane (bending about y, the depth)', () => {
    const I = (B * H ** 3) / 12;
    const bending = (P * L ** 3) / (3 * E * 1000 * I);
    const shear = (P * L) / (G * 1000 * As);
    expect(tip('z', false)).toBeCloseTo(bending, 9);
    modelStore.clear();
    expect(tip('z', true) / (bending + shear)).toBeCloseTo(1, 6);
    expect(shear / bending).toBeGreaterThan(0.1);
  });

  it('in the horizontal plane (bending about z)', () => {
    const I = (H * B ** 3) / 12;
    const bending = (P * L ** 3) / (3 * E * 1000 * I);
    const shear = (P * L) / (G * 1000 * As);
    expect(tip('y', true) / (bending + shear)).toBeCloseTo(1, 6);
  });
});
