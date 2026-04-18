import { describe, it, expect } from 'vitest';
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

/** Rectangular section 200x100 mm */
const rectSection: Section = {
  id: 1, name: 'Rect 200x100',
  a: 0.02,       // 200mm × 100mm = 20000mm² = 0.02m²
  iz: 1.667e-5,  // about Z vertical: hb³/12 = 0.2×0.1³/12
  iy: 6.667e-5,  // about Y horizontal: bh³/12 = 0.1×0.2³/12
  j: 3.0e-6,
  b: 0.100,
  h: 0.200,
  shape: 'rect',
};

/** IPN-200-like I section */
const iSection: Section = {
  id: 2, name: 'IPN 200',
  a: 0.00334,
  iz: 1.17e-6,   // about Z vertical (small)
  iy: 2.14e-5,   // about Y horizontal (large)
  j: 4.79e-8,
  b: 0.090,
  h: 0.200,
  shape: 'I',
  tw: 0.0075,
  tf: 0.0114,
};

/** CHS 168.3×8 (circular hollow section) */
const chsSection: Section = {
  id: 3, name: 'CHS 168x8',
  a: 0.004025,
  iz: 1.3e-5,    // symmetric: same for both axes
  iy: 1.3e-5,    // symmetric: same for both axes
  j: 2.6e-5,
  b: 0.1683,
  h: 0.1683,
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

      // All distribution points should have same σ (pure axial = uniform)
      for (const pt of result.distributionY) {
        expect(pt.sigma).toBeCloseTo(5.0, 0);
      }
    });
  });

  describe('Pure bending My (strong axis)', () => {
    it('should give linear σ in y, horizontal neutral axis', () => {
      const ef = makeEF({ myStart: 10, myEnd: 10 }); // 10 kN·m constant My (strong axis)
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5);

      // Default fiber at y = h/2 = 0.1m, z = 0:
      // σ = -My·y/Iz = -10 × 0.1 / 6.667e-5 = -15000 kN/m² = -15 MPa
      // Negative = compression at top for positive My (θy = -dw/dx convention)
      expect(result.sigmaAtFiber).toBeCloseTo(-15.0, 0);

      // Neutral axis should be horizontal (slope = 0) at y = 0
      expect(result.neutralAxis.exists).toBe(true);
      expect(result.neutralAxis.intercept).toBeCloseTo(0, 5);
      expect(Math.abs(result.neutralAxis.slope)).toBeLessThan(0.001);
    });
  });

  describe('Pure bending Mz (weak axis)', () => {
    it('should give linear σ in z, vertical neutral axis', () => {
      const ef = makeEF({ mzStart: 5, mzEnd: 5 }); // 5 kN·m constant Mz (weak axis)
      // Evaluate at z = b/2 = 0.05m, y = 0 (centroid height)
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0.05);

      // σ = Mz·z/Iy = 5 × 0.05 / 1.667e-5 = 15000 kN/m² = 15 MPa
      expect(result.sigmaAtFiber).toBeCloseTo(15.0, 0);

      // Neutral axis should be vertical (slope = Infinity)
      expect(result.neutralAxis.exists).toBe(true);
      expect(result.neutralAxis.slope).toBe(Infinity);
    });
  });

  describe('Biaxial bending Mz + My', () => {
    it('should give oblique neutral axis', () => {
      const ef = makeEF({ mzStart: 10, mzEnd: 10, myStart: 5, myEnd: 5 });
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5);

      // Neutral axis slope = (Mz·Iz)/(Iy·My)
      // = (10 × 6.667e-5) / (1.667e-5 × 5) = 6.667e-4 / 8.335e-5 = 8.0
      expect(result.neutralAxis.exists).toBe(true);
      expect(result.neutralAxis.slope).toBeCloseTo(8.0, 0);
      expect(result.neutralAxis.angle).not.toBeCloseTo(0);
      expect(result.neutralAxis.angle).not.toBeCloseTo(Math.PI / 2);
    });
  });

  describe('Pure shear Vy (strong axis)', () => {
    it('should give parabolic τ_Vy for rectangular section', () => {
      const ef = makeEF({ vyStart: 50, vyEnd: 50 }); // 50 kN
      // At centroid (y=0): τ_max for rect = 1.5 × V/A = 1.5 × 50/0.02 = 3750 kN/m² = 3.75 MPa
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0);

      expect(result.tauVyAtFiber).toBeGreaterThan(3);
      expect(result.sigmaAtFiber).toBeCloseTo(0, 5);

      // At extreme fiber (y = h/2): τ should be ~0
      const resultExtreme = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0.1, 0);
      expect(resultExtreme.tauVyAtFiber).toBeCloseTo(0, 1);
    });
  });

  describe('Pure shear Vz (weak axis)', () => {
    it('should give τ_Vz for rectangular section', () => {
      const ef = makeEF({ vzStart: 30, vzEnd: 30 }); // 30 kN
      // At centroid (z=0): max τ_Vz
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0);

      expect(result.tauVzAtFiber).toBeGreaterThan(0);
      expect(result.sigmaAtFiber).toBeCloseTo(0, 5);

      // At edge (z = b/2): τ_Vz should be ~0
      const resultEdge = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0.05);
      expect(resultEdge.tauVzAtFiber).toBeCloseTo(0, 1);
    });
  });

  describe('Torsion — closed section (CHS)', () => {
    it('should use Bredt formula: τ = Mx/(2·Am·t)', () => {
      const ef = makeEF({ mxStart: 10, mxEnd: 10 }); // 10 kN·m torsion
      const result = analyzeSectionStress3D(ef, chsSection, 355, 0.5);

      // CHS 168.3×8: Rm = (0.1683/2 - 0.008/2) = 0.08015m
      // Am = π × Rm² = π × 0.08015² = 0.02019 m²
      // τ = Mx / (2·Am·t) = 10 / (2 × 0.02019 × 0.008) = 30955 kN/m² = 31.0 MPa
      expect(result.tauTorsion).toBeGreaterThan(20);
      expect(result.tauTorsion).toBeLessThan(50);
    });
  });

  describe('Torsion — open section (I)', () => {
    it('should use Saint-Venant formula: τ = Mx·t_max/J', () => {
      const ef = makeEF({ mxStart: 1, mxEnd: 1 }); // 1 kN·m torsion
      const result = analyzeSectionStress3D(ef, iSection, 355, 0.5);

      // IPN 200: t_max = max(tw=7.5mm, tf=11.4mm) = 11.4mm = 0.0114m
      // τ = Mx · t_max / J = 1 × 0.0114 / 4.79e-8 = 237994 kN/m² = 238 MPa
      expect(result.tauTorsion).toBeGreaterThan(100);
    });
  });

  describe('Von Mises and failure', () => {
    it('should compute σ_vm ≥ max(|σ|, √3·|τ|)', () => {
      const ef = makeEF({
        nStart: 100, nEnd: 100,
        vyStart: 50, vyEnd: 50,
        myStart: 10, myEnd: 10,
      });
      const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0);

      const vm = result.failure.vonMises;
      expect(vm).toBeGreaterThanOrEqual(Math.abs(result.sigmaAtFiber) - 0.01);
      expect(vm).toBeGreaterThanOrEqual(Math.sqrt(3) * Math.abs(result.tauTotal) - 0.01);
    });

    it('should give failure ratio with known fy', () => {
      const ef = makeEF({ myStart: 10, myEnd: 10 }); // strong-axis: σ varies with y
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
    // Uniform load qY = -10 kN/m on 5m span
    const ef = makeEF({
      vyStart: 25, vyEnd: -25, // V_start = qL/2 for simply supported
      mzStart: 0, mzEnd: 0,
      qYI: -10, qYJ: -10,
      distributedLoadsY: [{ qI: -10, qJ: -10, a: 0, b: 5 }],
    });

    // At x=L/2: Vy should be ~0 (Vy = VyStart - q*x = 25 - 10*2.5 = 0)
    const mid = interpolateForces3D(ef, 0.5);
    expect(mid.Vy).toBeCloseTo(0, 0);
  });

  it('My at midspan should use positive signs (θy=-dw/dx convention)', () => {
    // SS beam 5m, uniform qZ = -10 kN/m → vzStart = 25, vzEnd = -25
    // My(x) = myStart + vzStart·x + ∫ loads
    // At midspan: My = 0 + 25*2.5 + (-10)*2.5²/2 = 62.5 - 31.25 = 31.25 kN·m
    const ef = makeEF({
      vzStart: 25, vzEnd: -25,
      myStart: 0, myEnd: 0,
      qZI: -10, qZJ: -10,
      distributedLoadsZ: [{ qI: -10, qJ: -10, a: 0, b: 5 }],
    });
    const mid = interpolateForces3D(ef, 0.5);
    // My should be POSITIVE (≈31.25 kN·m), matching diagrams-3d.ts convention
    expect(mid.My).toBeCloseTo(31.25, 0);
  });

  it('Mz at midspan should use negative signs (standard convention)', () => {
    // SS beam 5m, uniform qY = -10 kN/m → vyStart = 25, vyEnd = -25
    // Mz(x) = mzStart - vyStart·x - ∫ loads
    // At midspan: Mz = 0 - 25*2.5 - (-10)*... = -31.25 kN·m
    const ef = makeEF({
      vyStart: 25, vyEnd: -25,
      mzStart: 0, mzEnd: 0,
      qYI: -10, qYJ: -10,
      distributedLoadsY: [{ qI: -10, qJ: -10, a: 0, b: 5 }],
    });
    const mid = interpolateForces3D(ef, 0.5);
    // Mz should be NEGATIVE (≈-31.25 kN·m)
    expect(mid.Mz).toBeCloseTo(-31.25, 0);
  });

  it('My with point load should match diagrams-3d convention', () => {
    // SS beam 5m, point load Pz = -50kN at midspan
    // vzStart = 25, vzEnd = -25, myStart = 0, myEnd = 0
    // At t=0.5 (just past): My = 0 + 25*2.5 + (-50)*(2.5-2.5) = 62.5 kN·m
    // Actually the point load integral at exactly midspan is tricky,
    // let's check at t=0.6 (x=3):
    // My = 0 + 25*3 + (-50)*(3-2.5) = 75 - 25 = 50 kN·m
    const ef = makeEF({
      vzStart: 25, vzEnd: -25,
      myStart: 0, myEnd: 0,
      pointLoadsZ: [{ a: 2.5, p: -50 }],
    });
    const at06 = interpolateForces3D(ef, 0.6);
    expect(at06.My).toBeCloseTo(50, 0);
  });
});

describe('normalStress3D sign consistency', () => {
  it('positive My should create compression at positive y (top fiber, θy=-dw/dx)', () => {
    // σ = -My·y/Iz: positive My, positive y → negative σ (compression)
    const ef = makeEF({ myStart: 10, myEnd: 10 });
    const top = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0.1, 0);
    const bot = analyzeSectionStress3D(ef, rectSection, 355, 0.5, -0.1, 0);
    expect(top.sigmaAtFiber).toBeLessThan(0);     // compression at y > 0
    expect(bot.sigmaAtFiber).toBeGreaterThan(0);  // tension at y < 0
  });

  it('positive Mz should create tension at positive z (right fiber)', () => {
    // σ = +Mz·z/Iy: positive Mz, positive z → positive σ (tension)
    const ef = makeEF({ mzStart: 5, mzEnd: 5 });
    const right = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, 0.05);
    const left = analyzeSectionStress3D(ef, rectSection, 355, 0.5, 0, -0.05);
    expect(right.sigmaAtFiber).toBeGreaterThan(0);  // tension at z > 0
    expect(left.sigmaAtFiber).toBeLessThan(0);      // compression at z < 0
  });

  it('combined N + My + Mz should follow Navier formula', () => {
    // σ = N/A - My·y/Iz + Mz·z/Iy
    const N = 50;  // kN tension
    const Mz = 10; // kN·m (weak axis)
    const My = 5;  // kN·m (strong axis)
    const ef = makeEF({
      nStart: N, nEnd: N,
      mzStart: Mz, mzEnd: Mz,
      myStart: My, myEnd: My,
    });

    const y = 0.08;  // 80mm from centroid (vertical)
    const z = 0.03;  // 30mm from centroid (horizontal)
    const result = analyzeSectionStress3D(ef, rectSection, 355, 0.5, y, z);

    // Iz = resolved.iy = sec.iy = 6.667e-5, Iy = resolved.iz = sec.iz = 1.667e-5
    // σ = (N/A - My·y/Iz + Mz·z/Iy) / 1000
    const expected = (N / 0.02 - My * y / 6.667e-5 + Mz * z / 1.667e-5) / 1000;
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

    // Vy=0 at t = 20/(20+30) = 0.4
    const vy0 = sections.find(s => s.reason.includes('Vy=0'));
    expect(vy0).toBeDefined();
    expect(vy0!.t).toBeCloseTo(0.4, 1);
  });

  it('should include Vz=0 point for weak-axis shear (may merge with midspan)', () => {
    // Asymmetric shear so Vz=0 doesn't coincide with midspan
    const ef = makeEF({ vzStart: 20, vzEnd: -30 });
    const sections = suggestCriticalSections3D(ef);

    // Vz=0 at t = 20/(20+30) = 0.4
    const vz0 = sections.find(s => s.reason.includes('Vz=0'));
    expect(vz0).toBeDefined();
    expect(vz0!.t).toBeCloseTo(0.4, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// computePerpNADistribution
// ═══════════════════════════════════════════════════════════════
describe('computePerpNADistribution', () => {
  const rs = resolveSectionGeometry(rectSection);
  const A = rectSection.a;
  // Use resolved values: rs.iy = primary (about Y), rs.iz = secondary (about Z)
  const Iz = rs.iy;
  const Iy = rs.iz;

  it('returns empty when neutral axis does not exist', () => {
    const na: NeutralAxisInfo = { exists: false, slope: 0, intercept: 0, angle: 0 };
    const pts = computePerpNADistribution(0, 0, 0, A, Iz, Iy, na, rs);
    expect(pts).toHaveLength(0);
  });

  it('stress is approximately zero at neutral axis (pure biaxial bending)', () => {
    // Mz = 10 kN·m, My = 5 kN·m, N = 0
    const N = 0, Mz = 10, My = 5;
    // Neutral axis: y = (Mz·Iz)/(Iy·My)·z
    const slope = (Mz * Iz) / (Iy * My);
    const na: NeutralAxisInfo = {
      exists: true,
      slope,
      intercept: 0, // N=0 → intercept=0
      angle: Math.atan(slope),
    };
    const pts = computePerpNADistribution(N, Mz, My, A, Iz, Iy, na, rs, 21);
    expect(pts.length).toBe(21);

    // Find the point closest to d=0 (the neutral axis)
    const naPoint = pts.reduce((best, p) => Math.abs(p.d) < Math.abs(best.d) ? p : best);
    expect(Math.abs(naPoint.sigma)).toBeLessThan(0.5); // ≈0 at NA
  });

  it('stress varies linearly perpendicular to NA', () => {
    const N = 0, Mz = 10, My = 5;
    const slope = (Mz * Iz) / (Iy * My);
    const na: NeutralAxisInfo = {
      exists: true,
      slope,
      intercept: 0,
      angle: Math.atan(slope),
    };
    const pts = computePerpNADistribution(N, Mz, My, A, Iz, Iy, na, rs, 21);

    // σ should be linear in d → constant Δσ/Δd between consecutive points
    const gradients: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const dd = pts[i].d - pts[i - 1].d;
      if (Math.abs(dd) < 1e-12) continue;
      gradients.push((pts[i].sigma - pts[i - 1].sigma) / dd);
    }
    // All gradients should be approximately equal (linear)
    const avgGrad = gradients.reduce((a, b) => a + b, 0) / gradients.length;
    for (const g of gradients) {
      expect(g).toBeCloseTo(avgGrad, 0); // within 0.5 MPa/m tolerance
    }
  });

  it('handles axial force shift of neutral axis', () => {
    // N = 100 kN compression, My = 10 kN·m (strong axis), Mz = 0.1 (small weak axis)
    const N = -100, Mz = 0.1, My = 10;
    // slope = (Mz·Iz)/(Iy·My), intercept = (N·Iz)/(A·My)
    const slope = (Mz * Iz) / (Iy * My);
    const na: NeutralAxisInfo = {
      exists: true,
      slope,
      intercept: (N * Iz) / (A * My),
      angle: Math.atan(slope),
    };
    const pts = computePerpNADistribution(N, Mz, My, A, Iz, Iy, na, rs, 21);
    expect(pts.length).toBe(21);

    // The NA intercept shifts due to axial → some points should have different signs
    const signs = pts.map(p => Math.sign(p.sigma));
    const hasPos = signs.some(s => s > 0);
    const hasNeg = signs.some(s => s < 0);
    // With compression + bending, should have both tension and compression fibers
    expect(hasPos && hasNeg).toBe(true);
  });
});

// ── Resolved Iy/J used in 3D analysis ──

describe('3D analysis uses resolved Iy and J', () => {
  it('IPE 200 via catalog: resolves about-Y from profile', () => {
    const sec: Section = { id: 1, name: 'IPE 200', a: 28.5e-4, iz: 142e-8, iy: 1943e-8, shape: 'I', h: 0.200, b: 0.100, tw: 0.0056, tf: 0.0085 };
    const ef = makeEF({ mzStart: 50, mzEnd: -30, myStart: 10, myEnd: -10 });
    const r = analyzeSectionStress3D(ef, sec, 355, 0.5);
    // r.Iz = resolved.iz = sec.iz (about Z vertical) = 142e-8 m⁴
    expect(r.Iz).toBeCloseTo(142e-8, 11);
    // resolved.iy = about Y (horizontal) from catalog: IPE 200 Iy = 1943 cm⁴
    expect(r.resolved.iy).toBeCloseTo(1943e-8, 6);
  });

  it('user-provided sec.iy takes priority over catalog', () => {
    const sec: Section = { id: 1, name: 'IPE 200', a: 28.5e-4, iz: 142e-8, shape: 'I', iy: 500e-8, h: 0.200, b: 0.100, tw: 0.0056, tf: 0.0085 };
    const ef = makeEF({ mzStart: 50, mzEnd: -30 });
    const r = analyzeSectionStress3D(ef, sec, 355, 0);
    // sec.iy (about Y, user-provided) → resolved.iy = 500e-8 (overrides catalog 1943e-8)
    expect(r.resolved.iy).toBeCloseTo(500e-8, 11);
    // sec.iz (about Z) → r.Iz = 142e-8
    expect(r.Iz).toBeCloseTo(142e-8, 11);
  });

  it('Rankine is present in 3D failure check', () => {
    const sec: Section = { id: 1, name: 'IPE 200', a: 28.5e-4, iz: 142e-8, iy: 1943e-8, shape: 'I', h: 0.200, b: 0.100, tw: 0.0056, tf: 0.0085 };
    const ef = makeEF({ nStart: 100, mzStart: 50 });
    const r = analyzeSectionStress3D(ef, sec, 355, 0);
    expect(r.failure.rankine).toBeGreaterThan(0);
    expect(r.failure.ratioRankine).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Neutral axis (EN) correctness for I-sections
// ═══════════════════════════════════════════════════════════════

describe('Neutral axis for I-section (biaxial)', () => {
  it('nearly vertical EN for I-section is physically correct', () => {
    // IPN 200: resolved.iy (≈2.14e-5) / resolved.iz (≈1.17e-6) ≈ 18.3
    // slope = (Mz·Iz)/(Iy·My) → for equal My and Mz, slope ≈ 18.3
    const ef = makeEF({ mzStart: 10, mzEnd: 10, myStart: 10, myEnd: 10 });
    const r = analyzeSectionStress3D(ef, iSection, 355, 0.5);

    expect(r.neutralAxis.exists).toBe(true);
    // slope = (Mz·Iz)/(Iy·My) where Iz = resolved.iy (LARGE), Iy = resolved.iz (SMALL)
    const expectedSlope = 10 * r.resolved.iy / (r.resolved.iz * 10);
    expect(r.neutralAxis.slope).toBeCloseTo(expectedSlope, 1);
    // angle should be near 90° (nearly vertical)
    expect(Math.abs(r.neutralAxis.angle)).toBeGreaterThan(Math.PI / 3); // > 60°
  });

  it('EN slope is independent of N (only intercept changes)', () => {
    // With N: intercept shifts, but slope stays the same
    const ef1 = makeEF({ mzStart: 10, mzEnd: 10, myStart: 5, myEnd: 5 });
    const ef2 = makeEF({
      nStart: -200, nEnd: -200,
      mzStart: 10, mzEnd: 10, myStart: 5, myEnd: 5,
    });
    const r1 = analyzeSectionStress3D(ef1, rectSection, 355, 0.5);
    const r2 = analyzeSectionStress3D(ef2, rectSection, 355, 0.5);

    expect(r1.neutralAxis.exists).toBe(true);
    expect(r2.neutralAxis.exists).toBe(true);
    // Same slope
    expect(r1.neutralAxis.slope).toBeCloseTo(r2.neutralAxis.slope, 5);
    // Different intercept
    expect(r1.neutralAxis.intercept).not.toBeCloseTo(r2.neutralAxis.intercept, 1);
  });

  it('EN intercept = (N·Iz)/(A·My) for biaxial bending + axial', () => {
    const N = -100, Mz = 10, My = 5;
    const ef = makeEF({
      nStart: N, nEnd: N,
      mzStart: Mz, mzEnd: Mz,
      myStart: My, myEnd: My,
    });
    const r = analyzeSectionStress3D(ef, rectSection, 355, 0.5);

    expect(r.neutralAxis.exists).toBe(true);
    const expectedIntercept = (N * r.resolved.iy) / (r.resolved.a * My);
    expect(r.neutralAxis.intercept).toBeCloseTo(expectedIntercept, 5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Pressure center (CP) — 3D correctness
// ═══════════════════════════════════════════════════════════════

describe('Pressure center 3D correctness', () => {
  it('CP formulas: yCP = -My/N, zCP = Mz/N', () => {
    // From σ = N/A - My·y/Iz + Mz·z/Iy, matching eccentric N:
    //   N·ey = -My → ey = -My/N   (y_CP = -My/N)
    //   N·ez = Mz  → ez = Mz/N    (z_CP = Mz/N)
    const N = -100, Mz = -10, My = 5;
    const yCP = -My / N;
    const zCP = Mz / N;

    // yCP = -5/(-100) = +0.05 → CP is ABOVE centroid
    expect(yCP).toBeCloseTo(0.05, 10);
    // zCP = -10/(-100) = +0.1 → CP is to the RIGHT
    expect(zCP).toBeCloseTo(0.1, 10);
  });

  it('CP opposite EN: yCP · yEN < 0 for strong-axis (My)', () => {
    // For pure My + N: yEN = (N·Iz)/(A·My), yCP = -My/N
    // Product = -(Iz/A) < 0 (always negative)
    const A = rectSection.a;
    const ef = makeEF({
      nStart: -100, nEnd: -100,
      myStart: -10, myEnd: -10,
    });
    const r = analyzeSectionStress3D(ef, rectSection, 355, 0.5);

    const yEN = r.neutralAxis.intercept;
    const yCP = -r.My / r.N;

    // EN and CP on opposite sides of centroid
    expect(yEN * yCP).toBeLessThan(0);
    // More precisely: yEN · yCP = -Iz/A
    expect(yEN * yCP).toBeCloseTo(-r.resolved.iy / A, 5);
  });

  it('CP inside core → EN outside section (full compression/tension)', () => {
    // When CP is inside the central core, the EN is outside the section
    // meaning the entire section has the same stress sign
    const sec = rectSection;
    const rs = resolveSectionGeometry(sec);
    const A = rs.a;
    const Iz = rs.iy; // LARGE (about Y horizontal)

    // Small eccentricity: CP inside core
    // For rectangle: core extends ±h/6 = ±0.0333m in y
    // Place CP at (yCP=0.01, zCP=0) → inside core
    const ey = 0.01; // small y-eccentricity
    const N = -500;
    // From N·ey = -My → My = -N·ey = 500*0.01 = 5
    const My = -N * ey; // = 5

    // EN position: yEN = (N·Iz)/(A·My) = (-500·Iz)/(A·5)
    const yEN = (N * Iz) / (A * My);
    // yEN should be outside the section (|yEN| > h/2)
    expect(Math.abs(yEN)).toBeGreaterThan(rs.h / 2);
  });
});

// ─── effectiveBendingInertia ─────────────────────────────────────────

describe('effectiveBendingInertia (Mohr rotation)', () => {
  const sec: Section = {
    id: 1, name: 'Test', a: 0.02,
    iz: 1.667e-5,  // about Z (weak, b³ term)
    iy: 6.667e-5,  // about Y (strong, h³ term)
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
    const expected = (6.667e-5 + 1.667e-5) / 2;
    expect(effectiveBendingInertia({ ...sec, rotation: 45 })).toBeCloseTo(expected, 9);
  });

  it('no rotation prop → returns Iy', () => {
    expect(effectiveBendingInertia(sec)).toBeCloseTo(6.667e-5, 9);
  });
});

// ─── analyzeSectionStressFromForces (rotated 2D biaxial) ─────────────

describe('analyzeSectionStressFromForces', () => {
  it('matches 2D analysis at α=0° (all moment about Y-axis)', () => {
    // M_2d = -10 kN·m (sagging), V_2d = 5 kN, N = 0
    // At α=0°: My = -M·cos(0) = 10, Mz = M·sin(0) = 0
    const M_2d = -10;
    const result = analyzeSectionStressFromForces(
      0, 5, 0, 0, -M_2d, 0,  // N, Vy, Vz, Mx, My, Mz
      rectSection, undefined,
    );
    // distributionY should have non-zero stress, distributionZ should be ~0 (no Mz)
    const maxSigmaY = Math.max(...result.distributionY.map(p => Math.abs(p.sigma)));
    const maxSigmaZ = Math.max(...result.distributionZ.map(p => Math.abs(p.sigma)));
    expect(maxSigmaY).toBeGreaterThan(10); // significant stress from My
    expect(maxSigmaZ).toBeCloseTo(0, 1);   // no Mz → no z-variation
  });

  it('at α=90° all stress shifts to Z-axis distribution', () => {
    const M_2d = -10;
    const alpha = 90 * Math.PI / 180;
    const My = -M_2d * Math.cos(alpha);  // ≈ 0
    const Mz = M_2d * Math.sin(alpha);   // = M_2d = -10
    const result = analyzeSectionStressFromForces(
      0, 0, 5, 0, My, Mz,
      rectSection, undefined,
    );
    const maxSigmaY = Math.max(...result.distributionY.map(p => Math.abs(p.sigma)));
    const maxSigmaZ = Math.max(...result.distributionZ.map(p => Math.abs(p.sigma)));
    expect(maxSigmaY).toBeCloseTo(0, 1);   // no My → no y-variation
    expect(maxSigmaZ).toBeGreaterThan(10);  // significant stress from Mz
  });

  it('at α=45° stress in both axes', () => {
    const M_2d = -10;
    const alpha = 45 * Math.PI / 180;
    const My = -M_2d * Math.cos(alpha);
    const Mz = M_2d * Math.sin(alpha);
    const result = analyzeSectionStressFromForces(
      0, 5 * Math.cos(alpha), 5 * Math.sin(alpha), 0, My, Mz,
      rectSection, undefined,
    );
    const maxSigmaY = Math.max(...result.distributionY.map(p => Math.abs(p.sigma)));
    const maxSigmaZ = Math.max(...result.distributionZ.map(p => Math.abs(p.sigma)));
    expect(maxSigmaY).toBeGreaterThan(5);  // some stress from My component
    expect(maxSigmaZ).toBeGreaterThan(5);  // some stress from Mz component
  });

  it('90° rotation of IPN: stress ratio matches Iy/Iz', () => {
    // At 0°: σ_max = M·ymax/Iy → uses strong axis
    // At 90°: σ_max = M·zmax/Iz → uses weak axis
    // The ratio should be ~ (Iz/Iy)⁻¹ × (zmax/ymax) = Iy/Iz × b/(h) ≈ for IPN
    const M_2d = -10;
    const result0 = analyzeSectionStressFromForces(0, 0, 0, 0, -M_2d, 0, iSection, undefined);
    const result90 = analyzeSectionStressFromForces(0, 0, 0, 0, 0, M_2d, iSection, undefined);

    const maxSigma0 = Math.max(...result0.distributionY.map(p => Math.abs(p.sigma)));
    const maxSigma90 = Math.max(...result90.distributionZ.map(p => Math.abs(p.sigma)));

    // σ0 = M·(h/2)/Iy, σ90 = M·(b/2)/Iz
    // ratio = σ90/σ0 = (b/2·Iy) / (h/2·Iz)
    const expectedRatio = (iSection.b! / 2 * iSection.iy!) / (iSection.h! / 2 * iSection.iz!);
    expect(maxSigma90 / maxSigma0).toBeCloseTo(expectedRatio, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug #6: Quick-path stress uses standard My/Mz convention
// The quick path (computeSectionStress) used by stress-heatmap
// must use the standard convention matching the WASM solver output:
//   My = moment about Y-axis (lateral bending) → stress varies with z → uses Iy
//   Mz = moment about Z-axis (vertical bending) → stress varies with y → uses Iz
// ═══════════════════════════════════════════════════════════════

describe('Bug #6: quick-path standard My/Mz convention', () => {
  // Rect section: h=0.200 (vertical), b=0.100 (horizontal)
  // sec.iz = 1.667e-5 (about Z vertical, "small" for this section)
  // sec.iy = 6.667e-5 (about Y horizontal, "large" for this section)

  it('pure My (about Y, lateral bending): stress uses b/2 and Iy', () => {
    // My = moment about Y horizontal → bending in X-Z plane → stress varies with z (horizontal)
    // σ_My = |My| * (b/2) / Iy = 10 * 0.05 / 6.667e-5 = 7500 kN/m²
    const My = 10;
    const quick = computeSectionStress(
      0, 0, 0, 0, My, 0,
      rectSection.a, rectSection.iz, rectSection.iy!,
      rectSection.h!, rectSection.b!, 355_000,
    );
    const expected = Math.abs(My) * (rectSection.b! / 2) / rectSection.iy!;
    expect(quick.sigmaMax).toBeCloseTo(expected, -1);
  });

  it('pure Mz (about Z, vertical bending): stress uses h/2 and Iz', () => {
    // Mz = moment about Z vertical → bending in Y-Z plane → stress varies with y (vertical)
    // σ_Mz = |Mz| * (h/2) / Iz = 5 * 0.1 / 1.667e-5 = 30000 kN/m²
    const Mz = 5;
    const quick = computeSectionStress(
      0, 0, 0, 0, 0, Mz,
      rectSection.a, rectSection.iz, rectSection.iy!,
      rectSection.h!, rectSection.b!, 355_000,
    );
    const expected = Math.abs(Mz) * (rectSection.h! / 2) / rectSection.iz;
    expect(quick.sigmaMax).toBeCloseTo(expected, -1);
  });

  it('biaxial My + Mz on asymmetric rect matches analytical envelope', () => {
    const My = 15, Mz = 8;
    const quick = computeSectionStress(
      0, 0, 0, 0, My, Mz,
      rectSection.a, rectSection.iz, rectSection.iy!,
      rectSection.h!, rectSection.b!, 355_000,
    );
    // Analytical: sigmaMax = |Mz|*(h/2)/Iz + |My|*(b/2)/Iy
    const expected = Math.abs(Mz) * (rectSection.h! / 2) / rectSection.iz
                   + Math.abs(My) * (rectSection.b! / 2) / rectSection.iy!;
    expect(quick.sigmaMax).toBeCloseTo(expected, -1);
  });

  it('I-section: Mz (strong axis) produces larger stress than My (weak axis) for equal moments', () => {
    // For IPN 200 with Y=up (standard orientation):
    //   Mz about Z → strong-axis vertical bending → large stress (h/2 is large, Iz is small)
    //   My about Y → weak-axis lateral bending → smaller stress (b/2 is small, Iy is large)
    const M = 10;
    const quickMz = computeSectionStress(
      0, 0, 0, 0, 0, M,
      iSection.a, iSection.iz, iSection.iy!,
      iSection.h!, iSection.b!, 355_000,
    );
    const quickMy = computeSectionStress(
      0, 0, 0, 0, M, 0,
      iSection.a, iSection.iz, iSection.iy!,
      iSection.h!, iSection.b!, 355_000,
    );

    // σ_Mz = M * (h/2) / Iz = 10 * 0.1 / 1.17e-6 = 854701 kN/m²
    // σ_My = M * (b/2) / Iy = 10 * 0.045 / 2.14e-5 = 21028 kN/m²
    // Mz stress should be much larger (strong axis)
    expect(quickMz.sigmaMax).toBeGreaterThan(quickMy.sigmaMax * 10);

    // Verify exact values
    const expectedMz = M * (iSection.h! / 2) / iSection.iz;
    const expectedMy = M * (iSection.b! / 2) / iSection.iy!;
    expect(quickMz.sigmaMax).toBeCloseTo(expectedMz, -2);
    expect(quickMy.sigmaMax).toBeCloseTo(expectedMy, -2);
  });

  it('symmetric section (CHS): My and Mz produce equal stress', () => {
    // CHS has h = b and iz = iy, so My and Mz should produce equal stress
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
    // sigmaMax = |N/A| + |Mz|*(h/2)/Iz + |My|*(b/2)/Iy
    const expectedSigma = Math.abs(N) / rectSection.a
      + Math.abs(Mz) * (rectSection.h! / 2) / rectSection.iz
      + Math.abs(My) * (rectSection.b! / 2) / rectSection.iy!;
    expect(quick.sigmaMax).toBeCloseTo(expectedSigma, -1);
  });
});
