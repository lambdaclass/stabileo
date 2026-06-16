import { describe, it, expect, vi } from 'vitest';

// Force the pure-TS section-stress path so these tests validate the TS implementation
// deterministically. (The global vitest setup calls initSolver(), and the committed WASM
// blob is gitignored / rebuilt only in CI — so locally it would otherwise be stale. The
// Rust/WASM implementation is validated by the engine's own test suite in CI.)
vi.mock('../wasm-solver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../wasm-solver')>();
  return { ...actual, isWasmReady: () => false };
});

import {
  analyzeSectionStress3D,
  analyzeSectionStressFromForces,
  interpolateForces3D,
  suggestCriticalSections3D,
  computePerpNADistribution,
  computeSectionStress,
  type NeutralAxisInfo,
} from '../section-stress-3d';
import { effectiveBendingInertia } from '../solver-service';
import { resolveSectionGeometry } from '../section-stress';
import type { ElementForces3D } from '../types-3d';
import type { Section } from '../../store/model.svelte';

// ─────────────────────────────────────────────────────────────────────
// PR [12] convention (aligned with PR [10] solver + PR [11] render):
//   σ(y,z) = N/A − My·y/Iy + Mz·z/Iz
//   y = DEPTH coordinate (vertical, ±h/2), z = WIDTH coordinate (lateral, ±b/2)
//   My bends over the depth (y) → uses Iy (strong axis for tall sections)
//   Mz bends over the width (z) → uses Iz (weak axis)
//   Shear: Vz = vertical (over-the-depth) shear → tauVz; Vy = lateral (over-the-width) → tauVy
// ─────────────────────────────────────────────────────────────────────

// ── Helpers ──

/** Create a minimal ElementForces3D for tests */
function makeEF(overrides: Partial<ElementForces3D> = {}): ElementForces3D {
  return {
    elementId: 1,
    length: 5.0,
    nStart: 0, nEnd: 0,
    vyStart: 0, vyEnd: 0,
    vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0,
    myStart: 0, myEnd: 0,
    mzStart: 0, mzEnd: 0,
    hingeStart: false, hingeEnd: false,
    qYI: 0, qYJ: 0,
    distributedLoadsY: [],
    pointLoadsY: [],
    qZI: 0, qZJ: 0,
    distributedLoadsZ: [],
    pointLoadsZ: [],
    ...overrides,
  };
}

/** Rectangular section 200(h)×100(b) mm. App convention: iy = depth/strong, iz = width/weak. */
const rectSection: Section = {
  id: 1, name: 'Rect 200x100',
  a: 0.02,       // 0.2 × 0.1 = 0.02 m²
  iz: 1.667e-5,  // width-bending inertia (weak): h·b³/12 = 0.2×0.1³/12
  iy: 6.667e-5,  // depth-bending inertia (strong): b·h³/12 = 0.1×0.2³/12
  j: 3.0e-6,
  b: 0.100,
  h: 0.200,
  shape: 'rect',
};

/** IPN-200-like I section: iy = depth/strong (large), iz = width/weak (small). */
const iSection: Section = {
  id: 2, name: 'IPN 200',
  a: 0.00334,
  iz: 1.17e-6,   // width/weak (small)
  iy: 2.14e-5,   // depth/strong (large)
  j: 4.79e-8,
  b: 0.090,
  h: 0.200,
  shape: 'I',
  tw: 0.0075,
  tf: 0.0114,
};

/** IPN 300 — the section the 2D beam examples use (iy = strong/depth). */
const ipn300: Section = {
  id: 9, name: 'IPN 300',
  a: 0.0069, iy: 9.8e-5, iz: 4.51e-6, j: 1e-7,
  b: 0.125, h: 0.300, shape: 'I', tw: 0.0108, tf: 0.0162,
};

/** CHS 168.3×8 (circular hollow section) — symmetric */
const chsSection: Section = {
  id: 3, name: 'CHS 168x8',
  a: 0.004025,
  iz: 1.3e-5, iy: 1.3e-5,
  j: 2.6e-5,
  b: 0.1683, h: 0.1683,
  shape: 'CHS',
  t: 0.008,
};

// ── Tests ──

describe('analyzeSectionStress3D', () => {
  describe('Pure axial N', () => {
    it('should give uniform σ = N/A, zero shear', () => {
      const ef = makeEF({ nStart: 100, nEnd: 100 }); // 100 kN tension
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5);

      // σ = N/A = 100 / 0.02 = 5000 kN/m² = 5 MPa
      expect(result.sigmaAtFiber).toBeCloseTo(5.0, 1);
      expect(result.tauVyAtFiber).toBeCloseTo(0, 5);
      expect(result.tauVzAtFiber).toBeCloseTo(0, 5);
      expect(result.tauTorsion).toBeCloseTo(0, 5);
      expect(result.neutralAxis.exists).toBe(false);

      for (const pt of result.distributionY) {
        expect(pt.sigma).toBeCloseTo(5.0, 0);
      }
    });
  });

  describe('Pure bending My (strong / depth axis)', () => {
    it('should give linear σ in y (depth), horizontal neutral axis', () => {
      const ef = makeEF({ myStart: 10, myEnd: 10 }); // 10 kN·m constant My (depth bending)
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5);

      // Default fiber at y = h/2 = 0.1m, z = 0:
      // σ = −My·y/Iy = −10 × 0.1 / 6.667e-5 = −15000 kN/m² = −15 MPa
      expect(result.sigmaAtFiber).toBeCloseTo(-10 * 0.1 / rectSection.iy! / 1000, 0);

      // Neutral axis horizontal (slope ≈ 0) through centroid
      expect(result.neutralAxis.exists).toBe(true);
      expect(result.neutralAxis.intercept).toBeCloseTo(0, 5);
      expect(Math.abs(result.neutralAxis.slope)).toBeLessThan(0.001);
    });
  });

  describe('Pure bending Mz (weak / width axis)', () => {
    it('should give linear σ in z (width), vertical neutral axis', () => {
      const ef = makeEF({ mzStart: 5, mzEnd: 5 }); // 5 kN·m constant Mz (width bending)
      // Evaluate at z = b/2 = 0.05m, y = 0 (centroid depth)
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0.05);

      // σ = +Mz·z/Iz = 5 × 0.05 / 1.667e-5 = 15000 kN/m² = 15 MPa
      expect(result.sigmaAtFiber).toBeCloseTo(5 * 0.05 / rectSection.iz / 1000, 1);

      // Neutral axis vertical (slope = Infinity)
      expect(result.neutralAxis.exists).toBe(true);
      expect(result.neutralAxis.slope).toBe(Infinity);
    });
  });

  describe('Biaxial bending My + Mz', () => {
    it('should give oblique neutral axis', () => {
      const ef = makeEF({ myStart: 10, myEnd: 10, mzStart: 5, mzEnd: 5 });
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5);

      // NA (moments only): y = (Mz·Iy)/(Iz·My)·z → slope = (Mz·Iy)/(Iz·My)
      const expectedSlope = (5 * rectSection.iy!) / (rectSection.iz * 10);
      expect(result.neutralAxis.exists).toBe(true);
      expect(result.neutralAxis.slope).toBeCloseTo(expectedSlope, 3);
      expect(result.neutralAxis.angle).not.toBeCloseTo(0);
      expect(result.neutralAxis.angle).not.toBeCloseTo(Math.PI / 2);
    });
  });

  describe('Pure shear Vz (vertical / over-the-depth)', () => {
    it('should give parabolic τ_Vz for rectangular section', () => {
      const ef = makeEF({ vzStart: 50, vzEnd: 50 }); // 50 kN vertical shear
      // At centroid (y=0): τ_max for rect = 1.5 × V/A = 1.5 × 50/0.02 = 3750 kN/m² = 3.75 MPa
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0);

      expect(result.tauVzAtFiber).toBeGreaterThan(3);
      expect(result.sigmaAtFiber).toBeCloseTo(0, 5);

      // At extreme depth fiber (y = h/2): τ should be ~0
      const resultExtreme = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0.1, 0);
      expect(resultExtreme.tauVzAtFiber).toBeCloseTo(0, 1);
    });
  });

  describe('Pure shear Vy (lateral / over-the-width)', () => {
    it('should give τ_Vy for rectangular section, max at z=0', () => {
      const ef = makeEF({ vyStart: 30, vyEnd: 30 }); // 30 kN lateral shear
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0);

      expect(result.tauVyAtFiber).toBeGreaterThan(0);
      expect(result.sigmaAtFiber).toBeCloseTo(0, 5);

      // At width edge (z = b/2): τ_Vy should be ~0
      const resultEdge = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0.05);
      expect(resultEdge.tauVyAtFiber).toBeCloseTo(0, 1);
    });
  });

  describe('Torsion — closed section (CHS)', () => {
    it('should use Bredt formula: τ = Mx/(2·Am·t)', () => {
      const ef = makeEF({ mxStart: 10, mxEnd: 10 });
      const result = analyzeSectionStress3D(ef, chsSection, 355, 0.5);
      expect(result.tauTorsion).toBeGreaterThan(20);
      expect(result.tauTorsion).toBeLessThan(50);
    });
  });

  describe('Torsion — open section (I)', () => {
    it('should use Saint-Venant formula: τ = Mx·t_max/J', () => {
      const ef = makeEF({ mxStart: 1, mxEnd: 1 });
      const result = analyzeSectionStress3D(ef, iSection, 355, 0.5);
      expect(result.tauTorsion).toBeGreaterThan(100);
    });
  });

  describe('Von Mises and failure', () => {
    it('should compute σ_vm ≥ max(|σ|, √3·|τ|)', () => {
      const ef = makeEF({
        nStart: 100, nEnd: 100,
        vzStart: 50, vzEnd: 50,
        myStart: 10, myEnd: 10,
      });
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0);

      const vm = result.failure.vonMises;
      expect(vm).toBeGreaterThanOrEqual(Math.abs(result.sigmaAtFiber) - 0.01);
      expect(vm).toBeGreaterThanOrEqual(Math.sqrt(3) * Math.abs(result.tauTotal) - 0.01);
    });

    it('should give failure ratio with known fy', () => {
      const ef = makeEF({ myStart: 10, myEnd: 10 }); // depth bending: σ varies with y
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5);

      expect(result.failure.ratioVM).not.toBeNull();
      expect(result.failure.ratioVM!).toBeGreaterThan(0);
      expect(result.failure.fy).toBe(355);
    });
  });
});

describe('interpolateForces3D', () => {
  it('should interpolate N linearly', () => {
    const ef = makeEF({ nStart: 100, nEnd: -50 });
    const mid = interpolateForces3D(ef, 0.5);
    expect(mid.N).toBeCloseTo(25, 1);
    expect(interpolateForces3D(ef, 0).N).toBeCloseTo(100, 1);
    expect(interpolateForces3D(ef, 1).N).toBeCloseTo(-50, 1);
  });

  it('should interpolate Mx linearly', () => {
    const ef = makeEF({ mxStart: 10, mxEnd: -5 });
    expect(interpolateForces3D(ef, 0.5).Mx).toBeCloseTo(2.5, 1);
  });

  it('should account for distributed loads on Vy', () => {
    const ef = makeEF({
      vyStart: 25, vyEnd: -25,
      mzStart: 0, mzEnd: 0,
      qYI: -10, qYJ: -10,
      distributedLoadsY: [{ qI: -10, qJ: -10, a: 0, b: 5 }],
    });
    const mid = interpolateForces3D(ef, 0.5);
    expect(mid.Vy).toBeCloseTo(0, 0);
  });

  it('My at midspan should use positive signs (θy=-dw/dx convention)', () => {
    const ef = makeEF({
      vzStart: 25, vzEnd: -25,
      myStart: 0, myEnd: 0,
      qZI: -10, qZJ: -10,
      distributedLoadsZ: [{ qI: -10, qJ: -10, a: 0, b: 5 }],
    });
    const mid = interpolateForces3D(ef, 0.5);
    expect(mid.My).toBeCloseTo(31.25, 0);
  });

  it('Mz at midspan should use negative signs (standard convention)', () => {
    const ef = makeEF({
      vyStart: 25, vyEnd: -25,
      mzStart: 0, mzEnd: 0,
      qYI: -10, qYJ: -10,
      distributedLoadsY: [{ qI: -10, qJ: -10, a: 0, b: 5 }],
    });
    const mid = interpolateForces3D(ef, 0.5);
    expect(mid.Mz).toBeCloseTo(-31.25, 0);
  });

  it('My with point load should match diagrams-3d convention', () => {
    const ef = makeEF({
      vzStart: 25, vzEnd: -25,
      myStart: 0, myEnd: 0,
      pointLoadsZ: [{ a: 2.5, p: -50 }],
    });
    const at06 = interpolateForces3D(ef, 0.6);
    expect(at06.My).toBeCloseTo(50, 0);
  });
});

describe('normalStress3D sign consistency (PR [12])', () => {
  it('positive My creates compression at positive y (top), tension at bottom', () => {
    // σ = −My·y/Iy: positive My, positive y → negative σ (compression)
    const ef = makeEF({ myStart: 10, myEnd: 10 });
    const top = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0.1, 0);
    const bot = analyzeSectionStress3D(ef, rectSection, 355, 0.5, -0.1, 0);
    expect(top.sigmaAtFiber).toBeLessThan(0);     // compression at y > 0
    expect(bot.sigmaAtFiber).toBeGreaterThan(0);  // tension at y < 0
  });

  it('positive Mz creates tension at positive z (right), compression at left', () => {
    // σ = +Mz·z/Iz: positive Mz, positive z → positive σ (tension)
    const ef = makeEF({ mzStart: 5, mzEnd: 5 });
    const right = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0.05);
    const left = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, -0.05);
    expect(right.sigmaAtFiber).toBeGreaterThan(0);  // tension at z > 0
    expect(left.sigmaAtFiber).toBeLessThan(0);      // compression at z < 0
  });

  it('combined N + My + Mz follows the PR [12] Navier formula', () => {
    // σ = N/A − My·y/Iy + Mz·z/Iz
    const N = 50, My = 10, Mz = 5;
    const ef = makeEF({
      nStart: N, nEnd: N,
      myStart: My, myEnd: My,
      mzStart: Mz, mzEnd: Mz,
    });
    const y = 0.08;  // depth from centroid
    const z = 0.03;  // width from centroid
    const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5, y, z);

    const expected = (N / rectSection.a - My * y / rectSection.iy! + Mz * z / rectSection.iz) / 1000;
    expect(result.sigmaAtFiber).toBeCloseTo(expected, 0);
  });
});

describe('suggestCriticalSections3D', () => {
  it('should include start, end, and midspan', () => {
    const ef = makeEF({ vyStart: 10, vyEnd: -10 });
    const sections = suggestCriticalSections3D(ef);
    expect(sections.some(s => s.t === 0)).toBe(true);
    expect(sections.some(s => s.t === 1)).toBe(true);
    expect(sections.some(s => s.t === 0.5)).toBe(true);
  });

  it('should include Vy=0 point when shear changes sign', () => {
    const ef = makeEF({ vyStart: 20, vyEnd: -30 });
    const sections = suggestCriticalSections3D(ef);
    const vy0 = sections.find(s => s.reason.includes('Vy=0'));
    expect(vy0).toBeDefined();
    expect(vy0!.t).toBeCloseTo(0.4, 1);
  });

  it('should include Vz=0 point for vertical shear', () => {
    const ef = makeEF({ vzStart: 20, vzEnd: -30 });
    const sections = suggestCriticalSections3D(ef);
    const vz0 = sections.find(s => s.reason.includes('Vz=0'));
    expect(vz0).toBeDefined();
    expect(vz0!.t).toBeCloseTo(0.4, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// computePerpNADistribution (PR [12] convention)
// ═══════════════════════════════════════════════════════════════
describe('computePerpNADistribution', () => {
  const rs = resolveSectionGeometry(rectSection);
  const A = rectSection.a;
  const Iz = rs.iz;
  const Iy = rs.iy;

  it('returns empty when neutral axis does not exist', () => {
    const na: NeutralAxisInfo = { exists: false, slope: 0, intercept: 0, angle: 0 };
    const pts = computePerpNADistribution(0, 0, 0, A, Iz, Iy, na, rs);
    expect(pts).toHaveLength(0);
  });

  it('stress is approximately zero at neutral axis (pure biaxial bending)', () => {
    // My = 10 (depth), Mz = 5 (width), N = 0. NA (moments only): y = (Mz·Iy)/(Iz·My)·z
    const N = 0, My = 10, Mz = 5;
    const slope = (Mz * Iy) / (Iz * My);
    const na: NeutralAxisInfo = { exists: true, slope, intercept: 0, angle: Math.atan(slope) };
    const pts = computePerpNADistribution(N, Mz, My, A, Iz, Iy, na, rs, 21);
    expect(pts.length).toBe(21);

    const naPoint = pts.reduce((best, p) => Math.abs(p.d) < Math.abs(best.d) ? p : best);
    expect(Math.abs(naPoint.sigma)).toBeLessThan(0.5); // ≈0 at NA
  });

  it('stress varies linearly perpendicular to NA', () => {
    const N = 0, My = 10, Mz = 5;
    const slope = (Mz * Iy) / (Iz * My);
    const na: NeutralAxisInfo = { exists: true, slope, intercept: 0, angle: Math.atan(slope) };
    const pts = computePerpNADistribution(N, Mz, My, A, Iz, Iy, na, rs, 21);

    const gradients: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const dd = pts[i].d - pts[i - 1].d;
      if (Math.abs(dd) < 1e-12) continue;
      gradients.push((pts[i].sigma - pts[i - 1].sigma) / dd);
    }
    const avgGrad = gradients.reduce((a, b) => a + b, 0) / gradients.length;
    for (const g of gradients) {
      expect(g).toBeCloseTo(avgGrad, 0);
    }
  });

  it('handles axial force shift of neutral axis', () => {
    // N = 100 compression, My = 10 (depth dominant), Mz = 0.1 (small width)
    const N = -100, My = 10, Mz = 0.1;
    const slope = (Mz * Iy) / (Iz * My);
    const na: NeutralAxisInfo = {
      exists: true,
      slope,
      intercept: (N * Iy) / (A * My),
      angle: Math.atan(slope),
    };
    const pts = computePerpNADistribution(N, Mz, My, A, Iz, Iy, na, rs, 21);
    expect(pts.length).toBe(21);

    const signs = pts.map(p => Math.sign(p.sigma));
    expect(signs.some(s => s > 0) && signs.some(s => s < 0)).toBe(true);
  });
});

// ── Resolved Iy/J used in 3D analysis ──

describe('3D analysis uses resolved Iy and J', () => {
  it('IPE 200 via catalog: resolves about-Y from profile', () => {
    const sec: Section = { id: 1, name: 'IPE 200', a: 28.5e-4, iz: 142e-8, iy: 1943e-8, shape: 'I', h: 0.200, b: 0.100, tw: 0.0056, tf: 0.0085 };
    const ef = makeEF({ mzStart: 50, mzEnd: -30, myStart: 10, myEnd: -10 });
    const r = analyzeSectionStress3D(ef, sec, 355, 0.5);
    expect(r.Iz).toBeCloseTo(142e-8, 11);
    expect(r.resolved.iy).toBeCloseTo(1943e-8, 6);
  });

  it('user-provided sec.iy takes priority over catalog', () => {
    const sec: Section = { id: 1, name: 'IPE 200', a: 28.5e-4, iz: 142e-8, shape: 'I', iy: 500e-8, h: 0.200, b: 0.100, tw: 0.0056, tf: 0.0085 };
    const ef = makeEF({ mzStart: 50, mzEnd: -30 });
    const r = analyzeSectionStress3D(ef, sec, 355, 0);
    expect(r.resolved.iy).toBeCloseTo(500e-8, 11);
    expect(r.Iz).toBeCloseTo(142e-8, 11);
  });

  it('Rankine is present in 3D failure check', () => {
    const sec: Section = { id: 1, name: 'IPE 200', a: 28.5e-4, iz: 142e-8, iy: 1943e-8, shape: 'I', h: 0.200, b: 0.100, tw: 0.0056, tf: 0.0085 };
    const ef = makeEF({ nStart: 100, myStart: 50 });
    const r = analyzeSectionStress3D(ef, sec, 355, 0);
    expect(r.failure.rankine).toBeGreaterThan(0);
    expect(r.failure.ratioRankine).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Neutral axis (EN) correctness for I-sections (PR [12])
// ═══════════════════════════════════════════════════════════════

describe('Neutral axis for I-section (biaxial)', () => {
  it('nearly horizontal EN for I-section is physically correct', () => {
    // Depth bending dominant (My large vs Mz on a tall section)
    // slope = (Mz·Iy)/(Iz·My); for equal My,Mz it is Iy/Iz ≈ large → steep,
    // so use My ≫ Mz to keep the NA nearly horizontal (depth bending).
    const ef = makeEF({ myStart: 100, myEnd: 100, mzStart: 1, mzEnd: 1 });
    const r = analyzeSectionStress3D(ef, iSection, 355, 0.5);

    expect(r.neutralAxis.exists).toBe(true);
    const expectedSlope = (1 * r.resolved.iy) / (r.resolved.iz * 100);
    expect(r.neutralAxis.slope).toBeCloseTo(expectedSlope, 1);
    expect(Math.abs(r.neutralAxis.angle)).toBeLessThan(Math.PI / 9); // < 20°
  });

  it('EN slope is independent of N (only intercept changes)', () => {
    const ef1 = makeEF({ myStart: 10, myEnd: 10, mzStart: 5, mzEnd: 5 });
    const ef2 = makeEF({
      nStart: -200, nEnd: -200,
      myStart: 10, myEnd: 10, mzStart: 5, mzEnd: 5,
    });
    const r1 = analyzeSectionStress3D(ef1, rectSection, 355, 0.5);
    const r2 = analyzeSectionStress3D(ef2, rectSection, 355, 0.5);

    expect(r1.neutralAxis.exists).toBe(true);
    expect(r2.neutralAxis.exists).toBe(true);
    expect(r1.neutralAxis.slope).toBeCloseTo(r2.neutralAxis.slope, 5);
    // intercept = (N·Iy)/(A·My)
    expect(r1.neutralAxis.intercept).toBeCloseTo(0, 8);
    expect(r2.neutralAxis.intercept).toBeCloseTo((ef2.nStart * r2.resolved.iy) / (r2.resolved.a * ef2.myStart), 5);
    expect(Math.abs(r2.neutralAxis.intercept - r1.neutralAxis.intercept)).toBeGreaterThan(1e-3);
  });

  it('EN intercept = (N·Iy)/(A·My) for biaxial bending + axial', () => {
    const N = -100, My = 10, Mz = 5;
    const ef = makeEF({
      nStart: N, nEnd: N,
      myStart: My, myEnd: My,
      mzStart: Mz, mzEnd: Mz,
    });
    const r = analyzeSectionStress3D(ef, rectSection, 355, 0.5);

    expect(r.neutralAxis.exists).toBe(true);
    const expectedIntercept = (N * r.resolved.iy) / (r.resolved.a * My);
    expect(r.neutralAxis.intercept).toBeCloseTo(expectedIntercept, 5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Pressure center (CP) — 3D correctness (PR [12])
// ═══════════════════════════════════════════════════════════════

describe('Pressure center 3D correctness', () => {
  it('CP formulas: yCP = −My/N (depth), zCP = Mz/N (width)', () => {
    const N = -100, My = 10, Mz = 5;
    const yCP = -My / N;
    const zCP = Mz / N;
    expect(yCP).toBeCloseTo(0.1, 10);    // −10/−100 = +0.1
    expect(zCP).toBeCloseTo(-0.05, 10);  // 5/−100 = −0.05
  });

  it('CP opposite EN: yCP · yEN < 0 for depth bending (My)', () => {
    // For pure My + N: yEN = (N·Iy)/(A·My), yCP = −My/N
    // Product = -(Iy/A) < 0 (always negative)
    const A = rectSection.a;
    const ef = makeEF({
      nStart: -100, nEnd: -100,
      myStart: -10, myEnd: -10,
    });
    const r = analyzeSectionStress3D(ef, rectSection, 355, 0.5);

    const yEN = r.neutralAxis.intercept;
    const yCP = -r.My / r.N;

    expect(yEN * yCP).toBeLessThan(0);
    expect(yEN * yCP).toBeCloseTo(-r.resolved.iy / A, 5);
  });

  it('CP inside core → EN outside section (full compression/tension)', () => {
    const rs = resolveSectionGeometry(rectSection);
    const A = rs.a;
    const Iy = rs.iy;

    const ey = 0.005;
    const N = -500;
    const My = N * ey; // = -2.5 (My·... eccentricity in depth)
    // yEN = (N·Iy)/(A·My) = Iy/(A·ey)
    const yEN = (N * Iy) / (A * My);
    expect(Math.abs(yEN)).toBeGreaterThan(rs.h / 2);
  });
});

// ─── effectiveBendingInertia ─────────────────────────────────────────

describe('effectiveBendingInertia (Mohr rotation)', () => {
  const sec: Section = {
    id: 1, name: 'Test', a: 0.02,
    iz: 1.667e-5,  // weak
    iy: 6.667e-5,  // strong
  };

  it('α=0° → returns Iy (strong axis)', () => {
    expect(effectiveBendingInertia({ ...sec, rotation: 0 })).toBeCloseTo(6.667e-5, 9);
  });
  it('α=90° → returns Iz (weak axis)', () => {
    expect(effectiveBendingInertia({ ...sec, rotation: 90 })).toBeCloseTo(1.667e-5, 9);
  });
  it('α=180° → returns Iy (same as 0°)', () => {
    expect(effectiveBendingInertia({ ...sec, rotation: 180 })).toBeCloseTo(6.667e-5, 9);
  });
  it('α=45° → returns (Iy+Iz)/2', () => {
    expect(effectiveBendingInertia({ ...sec, rotation: 45 })).toBeCloseTo((6.667e-5 + 1.667e-5) / 2, 9);
  });
  it('no rotation prop → returns Iy', () => {
    expect(effectiveBendingInertia(sec)).toBeCloseTo(6.667e-5, 9);
  });
});

// ─── analyzeSectionStressFromForces (rotated 2D biaxial, PR [12]) ─────

describe('analyzeSectionStressFromForces', () => {
  it('depth bending (My) → stress on the depth (Y) distribution', () => {
    // α=0 in the panel maps the 2D moment to My (depth). Stress lives on distributionY.
    const M = 10;
    const result = analyzeSectionStressFromForces(
      0, 0, 5, 0, M, 0,  // N, Vy, Vz, Mx, My, Mz
      rectSection, undefined,
    );
    const maxSigmaY = Math.max(...result.distributionY.map(p => Math.abs(p.sigma)));
    const maxSigmaZ = Math.max(...result.distributionZ.map(p => Math.abs(p.sigma)));
    expect(maxSigmaY).toBeGreaterThan(10);
    expect(maxSigmaZ).toBeCloseTo(0, 1);
  });

  it('width bending (Mz) → stress on the width (Z) distribution', () => {
    const M = 10;
    const result = analyzeSectionStressFromForces(
      0, 5, 0, 0, 0, M,  // Mz only
      rectSection, undefined,
    );
    const maxSigmaY = Math.max(...result.distributionY.map(p => Math.abs(p.sigma)));
    const maxSigmaZ = Math.max(...result.distributionZ.map(p => Math.abs(p.sigma)));
    expect(maxSigmaY).toBeCloseTo(0, 1);
    expect(maxSigmaZ).toBeGreaterThan(1);
  });

  it('combined My + Mz → stress in both axes', () => {
    const result = analyzeSectionStressFromForces(
      0, 3, 3, 0, 8, 5, rectSection, undefined,
    );
    const maxSigmaY = Math.max(...result.distributionY.map(p => Math.abs(p.sigma)));
    const maxSigmaZ = Math.max(...result.distributionZ.map(p => Math.abs(p.sigma)));
    expect(maxSigmaY).toBeGreaterThan(5);
    expect(maxSigmaZ).toBeGreaterThan(1);
  });

  it('IPN: depth bending (My) vs width bending (Mz) stress ratio', () => {
    // Depth (My) uses Iy (strong) → small σ; width (Mz) uses Iz (weak) → large σ
    const M = 10;
    const resultDepth = analyzeSectionStressFromForces(0, 0, 0, 0, M, 0, iSection, undefined);
    const resultWidth = analyzeSectionStressFromForces(0, 0, 0, 0, 0, M, iSection, undefined);

    const maxDepth = Math.max(...resultDepth.distributionY.map(p => Math.abs(p.sigma)));
    const maxWidth = Math.max(...resultWidth.distributionZ.map(p => Math.abs(p.sigma)));

    // σ_depth = M·(h/2)/Iy, σ_width = M·(b/2)/Iz
    const expectedRatio = (iSection.b! / 2 * iSection.iy!) / (iSection.h! / 2 * iSection.iz);
    expect(maxWidth / maxDepth).toBeCloseTo(expectedRatio, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Quick-path stress (computeSectionStress) used by stress-heatmap — PR [12]
//   My (about y) → bends over DEPTH (h) → uses Iy (strong)
//   Mz (about z) → bends over WIDTH (b) → uses Iz (weak)
// ═══════════════════════════════════════════════════════════════

describe('quick-path PR [12] My/Mz convention', () => {
  it('pure My (depth bending): stress uses h/2 and Iy', () => {
    const My = 10;
    const quick = computeSectionStress(
      0, 0, 0, 0, My, 0,
      rectSection.a, rectSection.iz, rectSection.iy!,
      rectSection.h!, rectSection.b!, 355_000,
    );
    const expected = Math.abs(My) * (rectSection.h! / 2) / rectSection.iy!;
    expect(quick.sigmaMax).toBeCloseTo(expected, -1);
  });

  it('pure Mz (width bending): stress uses b/2 and Iz', () => {
    const Mz = 5;
    const quick = computeSectionStress(
      0, 0, 0, 0, 0, Mz,
      rectSection.a, rectSection.iz, rectSection.iy!,
      rectSection.h!, rectSection.b!, 355_000,
    );
    const expected = Math.abs(Mz) * (rectSection.b! / 2) / rectSection.iz;
    expect(quick.sigmaMax).toBeCloseTo(expected, -1);
  });

  it('biaxial My + Mz matches analytical envelope', () => {
    const My = 15, Mz = 8;
    const quick = computeSectionStress(
      0, 0, 0, 0, My, Mz,
      rectSection.a, rectSection.iz, rectSection.iy!,
      rectSection.h!, rectSection.b!, 355_000,
    );
    const expected = Math.abs(My) * (rectSection.h! / 2) / rectSection.iy!
                   + Math.abs(Mz) * (rectSection.b! / 2) / rectSection.iz;
    expect(quick.sigmaMax).toBeCloseTo(expected, -1);
  });

  it('I-section: My (depth/strong) and Mz (width/weak) for equal moments', () => {
    // For IPN, weak-axis (width, Mz) bending produces much larger stress than strong (depth, My)
    const M = 10;
    const quickMy = computeSectionStress(
      0, 0, 0, 0, M, 0,
      iSection.a, iSection.iz, iSection.iy!,
      iSection.h!, iSection.b!, 355_000,
    );
    const quickMz = computeSectionStress(
      0, 0, 0, 0, 0, M,
      iSection.a, iSection.iz, iSection.iy!,
      iSection.h!, iSection.b!, 355_000,
    );
    // width/weak bending → larger stress
    expect(quickMz.sigmaMax).toBeGreaterThan(quickMy.sigmaMax * 5);

    const expectedMy = M * (iSection.h! / 2) / iSection.iy!;
    const expectedMz = M * (iSection.b! / 2) / iSection.iz;
    expect(quickMy.sigmaMax).toBeCloseTo(expectedMy, -2);
    expect(quickMz.sigmaMax).toBeCloseTo(expectedMz, -2);
  });

  it('symmetric section (CHS): My and Mz produce equal stress', () => {
    const M = 10;
    const quickMz = computeSectionStress(
      0, 0, 0, 0, 0, M,
      chsSection.a, chsSection.iz, chsSection.iy!,
      chsSection.h!, chsSection.b!, 355_000,
    );
    const quickMy = computeSectionStress(
      0, 0, 0, 0, M, 0,
      chsSection.a, chsSection.iz, chsSection.iy!,
      chsSection.h!, chsSection.b!, 355_000,
    );
    expect(quickMz.sigmaMax).toBeCloseTo(quickMy.sigmaMax, 0);
  });

  it('combined N + Vy + Vz + My + Mz: vonMises is non-trivial', () => {
    const N = 50, Vy = 20, Vz = 10, My = 15, Mz = 8;
    const quick = computeSectionStress(
      N, Vy, Vz, 0, My, Mz,
      rectSection.a, rectSection.iz, rectSection.iy!,
      rectSection.h!, rectSection.b!, 355_000,
    );
    expect(quick.vonMises).toBeGreaterThan(0);
    expect(quick.ratio).toBeGreaterThan(0);
    const expectedSigma = Math.abs(N) / rectSection.a
      + Math.abs(My) * (rectSection.h! / 2) / rectSection.iy!
      + Math.abs(Mz) * (rectSection.b! / 2) / rectSection.iz;
    expect(quick.sigmaMax).toBeCloseTo(expectedSigma, -1);
  });
});

// ═══════════════════════════════════════════════════════════════
// PR [12] spec tests — section analysis matches solver/render/2D
// ═══════════════════════════════════════════════════════════════

describe('PR [12] section-analysis convention', () => {
  it('2D SS beam projected to 3D: My drives DEPTH stress = M·(h/2)/Iy ≈ 153 MPa, not sideways', () => {
    // Gravity on a horizontal beam → My (PR [10]). IPN 300, M = 100 kN·m.
    const M = 100;
    const ef = makeEF({ myStart: M, myEnd: M });
    const r = analyzeSectionStress3D(ef, ipn300, 355, 0.5);

    const maxDepth = Math.max(...r.distributionY.map(p => Math.abs(p.sigma)));
    const maxWidth = Math.max(...r.distributionZ.map(p => Math.abs(p.sigma)));

    // Strong-axis result on the DEPTH (vertical) axis
    expect(maxDepth).toBeCloseTo(M * (ipn300.h! / 2) / ipn300.iy! / 1000, 0);
    expect(maxDepth).toBeCloseTo(153.06, 1);
    // No weak-axis / sideways display
    expect(maxWidth).toBeLessThan(1);
  });

  it('cantilever-magnitude My matches strong-axis Navier with Iy (no accidental Iz)', () => {
    const M = 60;
    const ef = makeEF({ myStart: M, myEnd: 0 }); // varying along element
    const r = analyzeSectionStress3D(ef, ipn300, 355, 0); // at the fixed end
    const maxDepth = Math.max(...r.distributionY.map(p => Math.abs(p.sigma)));
    expect(maxDepth).toBeCloseTo(M * (ipn300.h! / 2) / ipn300.iy! / 1000, 0);
  });

  it('native 3D X-beam and Y-beam under vertical load give identical section stress (My, not swapped)', () => {
    // Both X and Y horizontal beams under gravity report the bending as My (PR [10]).
    // The section analysis only sees the resolved forces → identical result for identical My.
    const M = 80;
    const efX = makeEF({ myStart: M, myEnd: M });
    const efY = makeEF({ myStart: M, myEnd: M });
    const rX = analyzeSectionStress3D(efX, ipn300, 355, 0.5);
    const rY = analyzeSectionStress3D(efY, ipn300, 355, 0.5);
    const maxX = Math.max(...rX.distributionY.map(p => Math.abs(p.sigma)));
    const maxY = Math.max(...rY.distributionY.map(p => Math.abs(p.sigma)));
    expect(maxX).toBeCloseTo(maxY, 6);
    expect(maxX).toBeCloseTo(M * (ipn300.h! / 2) / ipn300.iy! / 1000, 0);
  });

  it('combined biaxial My + Mz equals N/A − My·y/Iy + Mz·z/Iz at a corner fiber', () => {
    const N = 20, My = 40, Mz = 12;
    const ef = makeEF({ nStart: N, nEnd: N, myStart: My, myEnd: My, mzStart: Mz, mzEnd: Mz });
    const y = ipn300.h! / 2, z = ipn300.b! / 2;
    const r = analyzeSectionStress3D(ef, ipn300, 355, 0.5, y, z);
    const expected = (N / ipn300.a - My * y / ipn300.iy! + Mz * z / ipn300.iz) / 1000;
    expect(r.sigmaAtFiber).toBeCloseTo(expected, 2);
  });

  it('rolled/rotated 2D section: stress moves from depth toward width as α→90°', () => {
    // Decomposition as done by the panel: My = −M·cosα (depth), Mz = M·sinα (width).
    const M = 50;
    const atAngle = (deg: number) => {
      const a = deg * Math.PI / 180;
      const r = analyzeSectionStressFromForces(0, M * Math.sin(a), M * Math.cos(a), 0, -M * Math.cos(a), M * Math.sin(a), ipn300, undefined);
      return {
        depth: Math.max(...r.distributionY.map(p => Math.abs(p.sigma))),
        width: Math.max(...r.distributionZ.map(p => Math.abs(p.sigma))),
      };
    };
    const a0 = atAngle(0), a45 = atAngle(45), a90 = atAngle(90);
    // α=0: all on depth, none on width
    expect(a0.depth).toBeGreaterThan(1);
    expect(a0.width).toBeCloseTo(0, 2);
    // α=90: none on depth, all on width
    expect(a90.depth).toBeCloseTo(0, 2);
    expect(a90.width).toBeGreaterThan(1);
    // α=45: both present
    expect(a45.depth).toBeGreaterThan(0.5);
    expect(a45.width).toBeGreaterThan(0.5);
  });
});
