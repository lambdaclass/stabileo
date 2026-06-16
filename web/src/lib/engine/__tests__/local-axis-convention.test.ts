// Canonical Z-up local-axis convention (PR [10] hard fix — no legacy mode).
//
// Corrected convention: local z = global up (Z) projected ⊥ to the member axis,
// ey = ez × ex. Consequence: a global-Z (gravity) load on ANY horizontal-plan
// member — along X, Y, a diagonal, or any 360° plan rotation — bends about local
// y (My is the main vertical bending moment) and engages the section's strong
// axis (depth h, along local z). Previously the solver auto-oriented off-X beams
// with their strong axis horizontal, so a Y-beam bent about its WEAK axis under
// gravity (≈6× too flexible) and the moment label flipped My↔Mz by orientation.
import { describe, it, expect } from 'vitest';
import { computeLocalAxes3D } from '../local-axes-3d';
import { validateAndSolve3D } from '../solver-service';
import { modelStore } from '../../store/model.svelte';
import type { SolverNode3D } from '../types-3d';

// Rectangular section: depth h=0.5 (strong), width b=0.2 (weak).
//   I_strong (about the axis ⊥ depth) = b·h³/12 = 0.0020833  → stored as iy
//   I_weak                            = h·b³/12 = 0.0003333  → stored as iz
const SEC = { id: 1, name: 'S', a: 0.01, iy: 0.0020833, iz: 0.0003333, j: 1e-5, b: 0.2, h: 0.5 };
const E = 2e8; // kN/m² (200000 MPa)
const L = 5, P = 10;
const dStrong = (P * L ** 3) / (3 * E * SEC.iy); // tip deflection if depth h resists gravity

function model() {
  return {
    name: '', nodes: new Map(), materials: new Map([[1, { id: 1, name: 'M', e: 200000, nu: 0.3, rho: 0, fy: 250 }]]),
    sections: new Map([[1, SEC]]), elements: new Map(), supports: new Map(), loads: [] as any[],
    plates: new Map(), quads: new Map(), constraints: [] as any[], loadCases: [], combinations: [],
  } as any;
}
function cantilever(dx: number, dy: number, dz: number, load: [number, number, number], localY?: [number, number, number], rollAngle?: number) {
  const m = model();
  m.nodes.set(1, { id: 1, x: 0, y: 0, z: 0 });
  m.nodes.set(2, { id: 2, x: dx, y: dy, z: dz });
  const e: any = { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false } };
  if (localY) { e.localYx = localY[0]; e.localYy = localY[1]; e.localYz = localY[2]; }
  if (rollAngle !== undefined) e.rollAngle = rollAngle;
  m.elements.set(1, e);
  m.supports.set(1, { id: 1, nodeId: 1, type: 'fixed' });
  m.loads.push({ type: 'nodal3d', data: { id: 1, nodeId: 2, fx: load[0], fy: load[1], fz: load[2], mx: 0, my: 0, mz: 0, caseId: 1 } });
  return m;
}
function solveForces(m: any) {
  const r = validateAndSolve3D(m, false) as any;
  expect(typeof r).not.toBe('string');
  return { f: r.elementForces[0], d: r.displacements.find((x: any) => x.nodeId === 2) };
}

describe('canonical Z-up local axes — gravity bends about local y (My)', () => {
  it('horizontal X beam: gravity → My, strong-axis deflection', () => {
    const { f, d } = solveForces(cantilever(L, 0, 0, [0, 0, -P]));
    expect(Math.abs(f.myStart)).toBeCloseTo(P * L, 3);
    expect(Math.abs(f.mzStart)).toBeLessThan(1e-6);
    expect(Math.abs(f.vzStart)).toBeCloseTo(P, 3);
    expect(d.uz).toBeCloseTo(-dStrong, 6);
  });

  it('horizontal Y beam: gravity → My (was Mz before the fix), same strong-axis deflection', () => {
    const { f, d } = solveForces(cantilever(0, L, 0, [0, 0, -P]));
    expect(Math.abs(f.myStart)).toBeCloseTo(P * L, 3);
    expect(Math.abs(f.mzStart)).toBeLessThan(1e-6);
    expect(d.uz).toBeCloseTo(-dStrong, 6); // identical to the X beam → no weak-axis bug
  });

  it('horizontal diagonal beam (37° in plan): gravity → My', () => {
    const a = (37 * Math.PI) / 180;
    const { f, d } = solveForces(cantilever(L * Math.cos(a), L * Math.sin(a), 0, [0, 0, -P]));
    expect(Math.abs(f.myStart)).toBeCloseTo(P * L, 3);
    expect(Math.abs(f.mzStart)).toBeLessThan(1e-6);
    expect(d.uz).toBeCloseTo(-dStrong, 6);
  });

  it('360° plan sweep: vertical load maps to local-z shear + My, never flips to Mz', () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      const { f, d } = solveForces(cantilever(L * Math.cos(a), L * Math.sin(a), 0, [0, 0, -P]));
      const myMag = Math.abs(f.myStart), mzMag = Math.abs(f.mzStart);
      expect(myMag).toBeGreaterThan(0.999 * P * L);     // My carries the gravity moment
      expect(mzMag).toBeLessThan(1e-6);                  // Mz stays ~0 at every plan angle
      expect(Math.abs(f.vzStart)).toBeCloseTo(P, 3);     // shear is in local z
      expect(d.uz).toBeCloseTo(-dStrong, 6);             // consistent strong-axis deflection
    }
  });

  it('inclined roof beam (30°): vertical load splits into axial + local-z transverse, bending primarily My', () => {
    const a = (30 * Math.PI) / 180;
    const { f } = solveForces(cantilever(L * Math.cos(a), 0, L * Math.sin(a), [0, 0, -P]));
    expect(Math.abs(f.nStart)).toBeGreaterThan(1);                 // axial component present
    expect(Math.abs(f.myStart)).toBeGreaterThan(Math.abs(f.mzStart) + 1); // bending primarily My
    expect(Math.abs(f.mzStart)).toBeLessThan(1e-6);
    expect(Math.abs(f.myStart)).toBeCloseTo(P * Math.cos(a) * L, 2); // transverse component × L
  });

  it('vertical column: axial gravity is pure axial; horizontal load gives stable finite bending (no NaN/flip)', () => {
    const axial = solveForces(cantilever(0, 0, L, [0, 0, -P]));
    expect(Math.abs(axial.f.myStart)).toBeLessThan(1e-6);
    expect(Math.abs(axial.f.mzStart)).toBeLessThan(1e-6);
    expect(Number.isFinite(axial.d.uz)).toBe(true);
    const lateral = solveForces(cantilever(0, 0, L, [-P, 0, 0]));
    const bending = Math.hypot(lateral.f.myStart, lateral.f.mzStart);
    expect(bending).toBeCloseTo(P * L, 2);                 // stable expected bending
    expect(Number.isFinite(lateral.d.ux)).toBe(true);
  });
});

describe('corrected convention is shared by Basic 3D and PRO (not PRO-gated)', () => {
  // The solve convention lives in buildSolverInput3D (which has no mode/isPro
  // parameter) and computeLocalAxes3D — both mode-agnostic. isPro only toggles
  // whether shell elements are included, never the frame local-axis convention.
  function solveBeam(dx: number, dy: number, isPro: boolean) {
    modelStore.clear();
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(dx, dy, 0);
    modelStore.addElement(n1, n2, 'frame');
    modelStore.addSupport(n1, 'fixed');
    // Override the section to the strong/weak one used above.
    modelStore.model.sections.set(1, { id: 1, ...SEC } as any);
    modelStore.model.elements.get(1)!.sectionId = 1;
    modelStore.addNodalLoad3D(n2, 0, 0, -P, 0, 0, 0, 1);
    const r = modelStore.solve3D(false, false, isPro) as any;
    expect(typeof r).not.toBe('string');
    return r.elementForces[0];
  }
  for (const isPro of [false, true]) {
    const mode = isPro ? 'PRO 3D' : 'Basic 3D';
    it(`${mode}: horizontal X beam gravity → My`, () => {
      const f = solveBeam(L, 0, isPro);
      expect(Math.abs(f.myStart)).toBeCloseTo(P * L, 3);
      expect(Math.abs(f.mzStart)).toBeLessThan(1e-6);
    });
    it(`${mode}: horizontal Y beam gravity → My (corrected, not orientation-flipped)`, () => {
      const f = solveBeam(0, L, isPro);
      expect(Math.abs(f.myStart)).toBeCloseTo(P * L, 3);
      expect(Math.abs(f.mzStart)).toBeLessThan(1e-6);
    });
  }
});

describe('overrides preserved', () => {
  it('explicit localY override still controls orientation', () => {
    // Force the Y-beam back to a horizontal ey: gravity then bends about local z (Mz).
    const { f } = solveForces(cantilever(0, L, 0, [0, 0, -P], [0, 0, 1]));
    expect(Math.abs(f.mzStart)).toBeGreaterThan(0.999 * P * L);
    expect(Math.abs(f.myStart)).toBeLessThan(1e-6);
  });

  it('roll angle rotates the local triad (90° swaps ey↔ez)', () => {
    const base = computeLocalAxes3D({ id: 1, x: 0, y: 0, z: 0 } as SolverNode3D, { id: 2, x: 5, y: 0, z: 0 } as SolverNode3D);
    const rolled = computeLocalAxes3D({ id: 1, x: 0, y: 0, z: 0 } as SolverNode3D, { id: 2, x: 5, y: 0, z: 0 } as SolverNode3D, undefined, 90);
    // ey → ez, ez → −ey
    for (let i = 0; i < 3; i++) {
      expect(rolled.ey[i]).toBeCloseTo(base.ez[i], 9);
      expect(rolled.ez[i]).toBeCloseTo(-base.ey[i], 9);
    }
  });

  it('local triad is orthonormal & right-handed for arbitrary orientation (rendering relies on this)', () => {
    const ax = computeLocalAxes3D({ id: 1, x: 1, y: 2, z: 3 } as SolverNode3D, { id: 2, x: 4, y: 8, z: 6 } as SolverNode3D, undefined, 25);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(Math.abs(dot(ax.ex, ax.ey))).toBeLessThan(1e-9);
    expect(Math.abs(dot(ax.ey, ax.ez))).toBeLessThan(1e-9);
    expect(Math.abs(dot(ax.ex, ax.ez))).toBeLessThan(1e-9);
    const cross = [ax.ex[1] * ax.ey[2] - ax.ex[2] * ax.ey[1], ax.ex[2] * ax.ey[0] - ax.ex[0] * ax.ey[2], ax.ex[0] * ax.ey[1] - ax.ex[1] * ax.ey[0]];
    expect(dot(cross, ax.ez)).toBeCloseTo(1, 9); // ex × ey = ez (right-handed)
  });
});
