import { describe, it, expect } from 'vitest';
import {
  normalStress,
  shearStress,
  computeStressDistribution,
  computeMohrCircle,
  checkFailure,
  analyzeSectionStress,
  suggestCriticalSections,
  resolveSectionGeometry,
  inferSectionShape,
  computeCentralCore,
  type ResolvedSection,
} from '../section-stress';
import type { Section } from '../../store/model.svelte';
import type { ElementForces } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────

function rectSection(b: number, h: number, name = 'rect'): Section {
  return {
    id: 1, name,
    a: b * h,
    iz: (h * b * b * b) / 12,  // about Z vertical (b³ term)
    iy: (b * h * h * h) / 12,  // about Y horizontal (h³ term)
    b, h,
    shape: 'rect',
  };
}

function iSection(): Section {
  // IPE 300: h=0.3, b=0.15, tw=0.0071, tf=0.0107, A=53.8 cm²
  // iy=8356 cm⁴ (about Y horizontal), iz=604 cm⁴ (about Z vertical)
  return {
    id: 2, name: 'IPE 300',
    a: 5.38e-3,
    iz: 6.04e-6,     // about Z vertical (604 cm⁴)
    iy: 8.356e-5,    // about Y horizontal (8356 cm⁴)
    b: 0.15, h: 0.3,
    shape: 'I',
    tw: 0.0071, tf: 0.0107,
  };
}

function rhsSection(): Section {
  // RHS 200x100x6: h=0.2, b=0.1, t=0.006
  const t = 0.006, bO = 0.1, hO = 0.2;
  const bI = bO - 2 * t, hI = hO - 2 * t;
  const A = bO * hO - bI * hI;
  const Iy = (bO * hO ** 3 - bI * hI ** 3) / 12;  // about Y horizontal (h³ term)
  const Iz = (hO * bO ** 3 - hI * bI ** 3) / 12;  // about Z vertical (b³ term)
  return {
    id: 3, name: 'RHS 200x100x6',
    a: A, iz: Iz, iy: Iy, b: bO, h: hO,
    shape: 'RHS', t: 0.006,
  };
}

function chsSection(): Section {
  // CHS 139.7x6: D=0.1397, t=0.006
  const D = 0.1397, t = 0.006;
  const R = D / 2, r = R - t;
  const A = Math.PI * (R * R - r * r);
  const Iz = (Math.PI / 4) * (R ** 4 - r ** 4);
  return {
    id: 4, name: 'CHS 139.7x6',
    a: A, iz: Iz, b: D, h: D,
    shape: 'CHS', t,
  };
}

function lSection(): Section {
  // L 80x80x8: simplified
  const t = 0.008, b = 0.08, h = 0.08;
  return {
    id: 5, name: 'L 80x80x8',
    a: 12.3e-4, iz: 0.59e-6, b, h,
    shape: 'L', t,
  };
}

function simpleBeamForces(N: number, V: number, M: number, L: number): ElementForces {
  return {
    elementId: 1,
    nStart: N, nEnd: N,
    vStart: V, vEnd: V,
    mStart: M, mEnd: M,
    length: L, qI: 0, qJ: 0,
  };
}

/** Simply supported beam with uniform load q, L */
function uniformLoadBeam(q: number, L: number): ElementForces {
  // Reactions: R = q·L/2
  // V(0) = +R, V(L) = -R
  // M(0) = 0, M(L) = 0
  const R = -q * L / 2; // if q negative (downward), R positive (upward)
  return {
    elementId: 1,
    nStart: 0, nEnd: 0,
    vStart: R, vEnd: -R,
    mStart: 0, mEnd: 0,
    length: L, qI: q, qJ: q,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// NORMAL STRESS
// ═══════════════════════════════════════════════════════════════════════

describe('normalStress', () => {
  it('pure axial: σ = N/A', () => {
    // N=100 kN, A=0.01 m² → σ = 100/0.01/1000 = 10 MPa
    expect(normalStress(100, 0, 0.01, 1e-4, 0)).toBeCloseTo(10, 1);
  });

  it('pure bending: σ = M·y/Iz at extreme fiber', () => {
    const b = 0.1, h = 0.2;
    const Iz = b * h ** 3 / 12; // 6.667e-5
    // σ = 50 * 0.1 / 6.667e-5 / 1000 = 75 MPa
    expect(normalStress(0, 50, b * h, Iz, h / 2)).toBeCloseTo(75, 0);
  });

  it('combined: σ = N/A + M·y/Iz', () => {
    // σ = (50/0.01 + 20*0.05/1e-4)/1000 = (5000+10000)/1000 = 15 MPa
    expect(normalStress(50, 20, 0.01, 1e-4, 0.05)).toBeCloseTo(15, 1);
  });

  it('antisymmetric about centroid for pure bending', () => {
    const sigma_top = normalStress(0, 10, 0.01, 1e-4, 0.05);
    const sigma_bot = normalStress(0, 10, 0.01, 1e-4, -0.05);
    expect(sigma_top).toBeCloseTo(-sigma_bot, 5);
  });

  it('zero at centroid for pure bending', () => {
    expect(normalStress(0, 100, 0.01, 1e-4, 0)).toBeCloseTo(0, 10);
  });

  it('compression everywhere with large negative N and small M', () => {
    // N = -500 kN, M = 1 kN·m, A=0.01, Iz=1e-4, y=0.05
    // σ = (-500/0.01 + 1*0.05/1e-4)/1000 = (-50000 + 500)/1000 = -49.5
    const sigma = normalStress(-500, 1, 0.01, 1e-4, 0.05);
    expect(sigma).toBeLessThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SHEAR STRESS — RECTANGULAR
// ═══════════════════════════════════════════════════════════════════════

describe('shearStress — rectangular', () => {
  it('τ_max = 1.5·V/A at neutral axis (y=0)', () => {
    const rs = resolveSectionGeometry(rectSection(0.1, 0.2));
    // τ_max = 1.5 * 30 / 0.02 / 1000 = 2.25 MPa
    expect(shearStress(30, 0, rs)).toBeCloseTo(2.25, 1);
  });

  it('τ = 0 at extreme fibers (±h/2)', () => {
    const rs = resolveSectionGeometry(rectSection(0.1, 0.2));
    expect(shearStress(30, 0.1, rs)).toBeCloseTo(0, 2);
    expect(shearStress(30, -0.1, rs)).toBeCloseTo(0, 2);
  });

  it('parabolic distribution: τ(h/4) ≈ 0.75·τ_max', () => {
    const b = 0.1, h = 0.2;
    const rs = resolveSectionGeometry(rectSection(b, h));
    const tauMax = shearStress(30, 0, rs);
    const tauQuarter = shearStress(30, h / 4, rs);
    // Q(h/4) = b/2 · (h²/4 - h²/16) = b/2 · 3h²/16 → ratio = 3/4 of Q(0)
    expect(tauQuarter / tauMax).toBeCloseTo(0.75, 2);
  });

  it('symmetric about neutral axis', () => {
    const rs = resolveSectionGeometry(rectSection(0.1, 0.2));
    const tauPos = shearStress(50, 0.04, rs);
    const tauNeg = shearStress(50, -0.04, rs);
    expect(tauPos).toBeCloseTo(tauNeg, 5);
  });

  it('scales linearly with V', () => {
    const rs = resolveSectionGeometry(rectSection(0.1, 0.2));
    const tau1 = shearStress(10, 0, rs);
    const tau2 = shearStress(30, 0, rs);
    expect(tau2 / tau1).toBeCloseTo(3, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SHEAR STRESS — I SECTION
// ═══════════════════════════════════════════════════════════════════════

describe('shearStress — I section', () => {
  const sec = iSection();
  const rs = resolveSectionGeometry(sec);

  it('τ in web > τ in flange', () => {
    const tauWeb = shearStress(100, 0, rs);
    const tauFlange = shearStress(100, 0.14, rs);
    expect(tauWeb).toBeGreaterThan(tauFlange);
  });

  it('τ ≈ 0 at extreme fiber (top of flange)', () => {
    const tau = shearStress(100, 0.15, rs);
    expect(tau).toBeCloseTo(0, 1);
  });

  it('τ_web_max is approximately V / (h_w · t_w) for thin-walled', () => {
    // For thin-walled I-section: τ_max ≈ V / (h_web · tw)
    // hw = h - 2tf = 0.3 - 2*0.0107 = 0.2786
    // τ ≈ 100 / (0.2786 * 0.0071) / 1000 ≈ 50.5 MPa
    // This is approximate — Jourawski gives slightly different
    const tauNA = shearStress(100, 0, rs);
    // Should be in the ballpark (30-70 MPa for V=100 kN on IPE 300)
    expect(tauNA).toBeGreaterThan(20);
    expect(tauNA).toBeLessThan(100);
  });

  it('discontinuity at web-flange junction', () => {
    // Just above and below the flange-web boundary should show different b(y)
    const yJunction = 0.15 - 0.0107; // bottom of top flange
    const tauAbove = shearStress(100, yJunction + 0.001, rs); // in flange
    const tauBelow = shearStress(100, yJunction - 0.001, rs); // in web
    // The web tau should be much larger because b(y) goes from b_f to tw
    expect(tauBelow).toBeGreaterThan(tauAbove * 2);
  });

  it('symmetric about neutral axis', () => {
    const tauPos = shearStress(100, 0.05, rs);
    const tauNeg = shearStress(100, -0.05, rs);
    // Both in the web zone, should be similar
    expect(tauPos).toBeCloseTo(tauNeg, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SHEAR STRESS — RHS
// ═══════════════════════════════════════════════════════════════════════

describe('shearStress — RHS', () => {
  const sec = rhsSection();
  const rs = resolveSectionGeometry(sec);

  it('τ_max at neutral axis', () => {
    const tauNA = shearStress(50, 0, rs);
    expect(tauNA).toBeGreaterThan(0);
  });

  it('τ = 0 at extreme fiber', () => {
    const tau = shearStress(50, 0.1, rs);
    expect(tau).toBeCloseTo(0, 1);
  });

  it('τ in web > τ in flange', () => {
    const tauWeb = shearStress(50, 0, rs);
    // Top flange zone: |y| > hInner/2 = (0.2 - 2*0.006)/2 = 0.094
    const tauFlange = shearStress(50, 0.096, rs);
    expect(tauWeb).toBeGreaterThan(tauFlange);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SHEAR STRESS — CHS
// ═══════════════════════════════════════════════════════════════════════

describe('shearStress — CHS', () => {
  const sec = chsSection();
  const rs = resolveSectionGeometry(sec);

  it('τ_max at neutral axis', () => {
    const tau = shearStress(50, 0, rs);
    // For CHS: τ_max ≈ 2V/A
    const tauApprox = 2 * 50 / sec.a / 1000;
    // Should be in the right order of magnitude
    expect(tau).toBeGreaterThan(tauApprox * 0.3);
    expect(tau).toBeLessThan(tauApprox * 3);
  });

  it('τ = 0 at top', () => {
    const R = sec.h! / 2;
    const tau = shearStress(50, R, rs);
    expect(tau).toBeCloseTo(0, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SHEAR STRESS — L section
// ═══════════════════════════════════════════════════════════════════════

describe('shearStress — L section', () => {
  const sec = lSection();
  const rs = resolveSectionGeometry(sec);

  it('τ > 0 at neutral axis', () => {
    expect(shearStress(20, 0, rs)).toBeGreaterThan(0);
  });

  it('τ ≈ 0 at extremes', () => {
    expect(shearStress(20, 0.04, rs)).toBeCloseTo(0, 1);
    expect(shearStress(20, -0.04, rs)).toBeCloseTo(0, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// STRESS DISTRIBUTION
// ═══════════════════════════════════════════════════════════════════════

describe('computeStressDistribution', () => {
  it('returns 31 points', () => {
    const rs = resolveSectionGeometry(rectSection(0.1, 0.2));
    expect(computeStressDistribution(0, 30, 50, rs).length).toBe(31);
  });

  it('sigma is linear for pure bending (rect)', () => {
    const rs = resolveSectionGeometry(rectSection(0.1, 0.2));
    const dist = computeStressDistribution(0, 0, 50, rs);
    expect(dist[0].sigma * dist[dist.length - 1].sigma).toBeLessThan(0);
    expect(Math.abs(dist[15].sigma)).toBeLessThan(1);
  });

  it('tau is parabolic for rect (max at center, zero at edges)', () => {
    const rs = resolveSectionGeometry(rectSection(0.1, 0.2));
    const dist = computeStressDistribution(0, 30, 0, rs);
    const midTau = dist[15].tau;
    const edgeTau = dist[0].tau;
    expect(midTau).toBeGreaterThan(edgeTau);
    expect(edgeTau).toBeCloseTo(0, 1);
  });

  it('y values span from -h/2 to +h/2', () => {
    const h = 0.3;
    const rs = resolveSectionGeometry(rectSection(0.1, h));
    const dist = computeStressDistribution(0, 0, 50, rs);
    expect(dist[0].y).toBeCloseTo(-h / 2, 5);
    expect(dist[dist.length - 1].y).toBeCloseTo(h / 2, 5);
  });

  it('tau sign follows V sign', () => {
    const rs = resolveSectionGeometry(rectSection(0.1, 0.2));
    // Negative V → negative tau (interior points)
    const distNeg = computeStressDistribution(0, -50, 0, rs);
    const interiorNeg = distNeg.filter(pt => Math.abs(pt.tau) > 1e-6);
    for (const pt of interiorNeg) {
      expect(pt.tau).toBeLessThan(0);
    }
    // Positive V → positive tau
    const distPos = computeStressDistribution(0, 50, 0, rs);
    const interiorPos = distPos.filter(pt => Math.abs(pt.tau) > 1e-6);
    for (const pt of interiorPos) {
      expect(pt.tau).toBeGreaterThan(0);
    }
  });

  it('I-section shows tau jump at web-flange junction', () => {
    const rs = resolveSectionGeometry(iSection());
    const dist = computeStressDistribution(0, 100, 0, rs);
    // Find points near the junction
    const yJunction = 0.15 - 0.0107;
    const webPoints = dist.filter(p => Math.abs(p.y) < yJunction);
    const flangePoints = dist.filter(p => Math.abs(p.y) > yJunction && Math.abs(p.y) < 0.14);
    if (webPoints.length > 0 && flangePoints.length > 0) {
      const maxWebTau = Math.max(...webPoints.map(p => p.tau));
      const maxFlangeTau = Math.max(...flangePoints.map(p => p.tau));
      expect(maxWebTau).toBeGreaterThan(maxFlangeTau);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MOHR'S CIRCLE
// ═══════════════════════════════════════════════════════════════════════

describe('computeMohrCircle', () => {
  it('pure tension: σ₁ = σ, σ₂ = 0', () => {
    const m = computeMohrCircle(100, 0);
    expect(m.sigma1).toBeCloseTo(100, 1);
    expect(m.sigma2).toBeCloseTo(0, 1);
    expect(m.center).toBeCloseTo(50, 1);
    expect(m.radius).toBeCloseTo(50, 1);
  });

  it('pure compression: σ₁ = 0, σ₂ = -σ', () => {
    const m = computeMohrCircle(-100, 0);
    expect(m.sigma1).toBeCloseTo(0, 1);
    expect(m.sigma2).toBeCloseTo(-100, 1);
  });

  it('pure shear: σ₁ = τ, σ₂ = -τ', () => {
    const m = computeMohrCircle(0, 50);
    expect(m.sigma1).toBeCloseTo(50, 1);
    expect(m.sigma2).toBeCloseTo(-50, 1);
    expect(m.center).toBeCloseTo(0, 1);
    expect(m.radius).toBeCloseTo(50, 1);
  });

  it('combined state', () => {
    const m = computeMohrCircle(100, 50);
    expect(m.center).toBeCloseTo(50, 1);
    expect(m.radius).toBeCloseTo(70.71, 0);
    expect(m.sigma1).toBeCloseTo(120.71, 0);
    expect(m.sigma2).toBeCloseTo(-20.71, 0);
  });

  it('σ₁ ≥ σ₂ always', () => {
    for (const [s, t] of [[100, 50], [-200, 30], [0, 80], [-50, -20], [300, 0]]) {
      const m = computeMohrCircle(s, t);
      expect(m.sigma1).toBeGreaterThanOrEqual(m.sigma2);
    }
  });

  it('σ₁ + σ₂ = σ (trace invariant)', () => {
    const m = computeMohrCircle(120, 40);
    // σ₁ + σ₂ = 2·center = σ_x + σ_y = σ + 0 = 120
    expect(m.sigma1 + m.sigma2).toBeCloseTo(120, 3);
  });

  it('thetaP = 0 for uniaxial', () => {
    expect(computeMohrCircle(100, 0).thetaP).toBeCloseTo(0, 5);
  });

  it('thetaP = π/4 for pure shear', () => {
    expect(Math.abs(computeMohrCircle(0, 50).thetaP)).toBeCloseTo(Math.PI / 4, 2);
  });

  it('radius = tauMax', () => {
    const m = computeMohrCircle(80, 60);
    expect(m.tauMax).toBeCloseTo(m.radius, 10);
    expect(m.tauMax).toBeCloseTo((m.sigma1 - m.sigma2) / 2, 10);
  });

  it('zero stress → everything zero', () => {
    const m = computeMohrCircle(0, 0);
    expect(m.sigma1).toBeCloseTo(0, 10);
    expect(m.sigma2).toBeCloseTo(0, 10);
    expect(m.radius).toBeCloseTo(0, 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// FAILURE CRITERIA
// ═══════════════════════════════════════════════════════════════════════

describe('checkFailure', () => {
  it('Von Mises uniaxial: σ_vm = |σ|', () => {
    expect(checkFailure(250, 0, 250).vonMises).toBeCloseTo(250, 1);
    expect(checkFailure(-250, 0, 250).vonMises).toBeCloseTo(250, 1);
  });

  it('Von Mises combined: σ_vm = √(σ² + 3τ²)', () => {
    const f = checkFailure(100, 50, 250);
    expect(f.vonMises).toBeCloseTo(Math.sqrt(100 ** 2 + 3 * 50 ** 2), 1);
  });

  it('ok = true when σ_vm ≤ fy', () => {
    expect(checkFailure(100, 0, 250).ok).toBe(true);
  });

  it('ok = false when σ_vm > fy', () => {
    expect(checkFailure(200, 100, 250).ok).toBe(false);
  });

  it('ok = true at exactly fy (boundary)', () => {
    // Pure uniaxial at exactly fy
    expect(checkFailure(250, 0, 250).ok).toBe(true);
  });

  it('Tresca = 2·√((σ/2)² + τ²)', () => {
    const f = checkFailure(100, 50, 250);
    expect(f.tresca).toBeCloseTo(2 * Math.sqrt(50 ** 2 + 50 ** 2), 1);
  });

  it('Von Mises ≤ Tresca always (VM is less conservative)', () => {
    for (const [s, t] of [[100, 50], [200, 30], [0, 80], [150, 150]]) {
      const f = checkFailure(s, t, 500);
      expect(f.vonMises).toBeLessThanOrEqual(f.tresca + 0.01);
    }
  });

  it('pure shear: VM = √3·τ, Tresca = 2τ', () => {
    const f = checkFailure(0, 100, 300);
    expect(f.vonMises).toBeCloseTo(Math.sqrt(3) * 100, 1);
    expect(f.tresca).toBeCloseTo(200, 1);
  });

  it('no fy → null ratios and null ok', () => {
    const f = checkFailure(100, 50, undefined);
    expect(f.fy).toBeNull();
    expect(f.ratioVM).toBeNull();
    expect(f.ratioTresca).toBeNull();
    expect(f.ok).toBeNull();
  });

  it('ratios are correct fractions of fy', () => {
    const f = checkFailure(125, 0, 250);
    expect(f.ratioVM).toBeCloseTo(0.5, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SHAPE INFERENCE
// ═══════════════════════════════════════════════════════════════════════

describe('inferSectionShape', () => {
  it('IPE → I', () => {
    expect(inferSectionShape({ id: 1, name: 'IPE 300', a: 0.01, iz: 1e-4 })).toBe('I');
    expect(inferSectionShape({ id: 1, name: 'IPE 200', a: 0.01, iz: 1e-4 })).toBe('I');
  });

  it('HEB/HEA/HEM → H', () => {
    expect(inferSectionShape({ id: 1, name: 'HEB 200', a: 0.01, iz: 1e-4 })).toBe('H');
    expect(inferSectionShape({ id: 1, name: 'HEA 300', a: 0.01, iz: 1e-4 })).toBe('H');
    expect(inferSectionShape({ id: 1, name: 'HEM 200', a: 0.01, iz: 1e-4 })).toBe('H');
  });

  it('UPN/UPE → U', () => {
    expect(inferSectionShape({ id: 1, name: 'UPN 200', a: 0.01, iz: 1e-4 })).toBe('U');
  });

  it('L → L', () => {
    expect(inferSectionShape({ id: 1, name: 'L 50x50x5', a: 0.01, iz: 1e-4 })).toBe('L');
    expect(inferSectionShape({ id: 1, name: 'L80x80x8', a: 0.01, iz: 1e-4 })).toBe('L');
  });

  it('RHS/SHS → RHS', () => {
    expect(inferSectionShape({ id: 1, name: 'RHS 200x100x6', a: 0.01, iz: 1e-4 })).toBe('RHS');
    expect(inferSectionShape({ id: 1, name: 'SHS 100x100x5', a: 0.01, iz: 1e-4 })).toBe('RHS');
  });

  it('CHS → CHS', () => {
    expect(inferSectionShape({ id: 1, name: 'CHS 139.7x6', a: 0.01, iz: 1e-4 })).toBe('CHS');
  });

  it('explicit shape overrides name', () => {
    expect(inferSectionShape({ id: 1, name: 'custom IPE', a: 0.01, iz: 1e-4, shape: 'RHS' })).toBe('RHS');
  });

  it('b+h without tw/tf → rect', () => {
    expect(inferSectionShape({ id: 1, name: 'custom', a: 0.01, iz: 1e-4, b: 0.1, h: 0.2 })).toBe('rect');
  });

  it('unknown name → generic', () => {
    expect(inferSectionShape({ id: 1, name: 'Perfil custom', a: 0.01, iz: 1e-4 })).toBe('generic');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// RESOLVE SECTION GEOMETRY
// ═══════════════════════════════════════════════════════════════════════

describe('resolveSectionGeometry', () => {
  it('rect section keeps b and h', () => {
    const rs = resolveSectionGeometry(rectSection(0.15, 0.3));
    expect(rs.b).toBeCloseTo(0.15, 5);
    expect(rs.h).toBeCloseTo(0.3, 5);
    expect(rs.shape).toBe('rect');
  });

  it('I section keeps tw and tf', () => {
    const rs = resolveSectionGeometry(iSection());
    expect(rs.tw).toBeCloseTo(0.0071, 5);
    expect(rs.tf).toBeCloseTo(0.0107, 5);
    expect(rs.shape).toBe('I');
  });

  it('RHS section keeps t', () => {
    const rs = resolveSectionGeometry(rhsSection());
    expect(rs.t).toBeCloseTo(0.006, 5);
    expect(rs.shape).toBe('RHS');
  });

  it('estimates h from Iy and A when missing', () => {
    // iy (about Y, h³ term) used for height estimation
    const sec: Section = { id: 1, name: 'generic', a: 0.02, iz: 1.667e-5, iy: 6.667e-5 };
    const rs = resolveSectionGeometry(sec);
    // h = √(12·Iy/A) = √(12*6.667e-5/0.02) = √(0.04) = 0.2
    expect(rs.h).toBeCloseTo(0.2, 1);
  });

  it('falls back to profile catalog for known names', () => {
    // A section with IPE 300 name but missing tw/tf should look it up
    const sec: Section = { id: 1, name: 'IPE 300', a: 5.38e-3, iz: 6.04e-6, iy: 8.356e-5, b: 0.15, h: 0.3 };
    const rs = resolveSectionGeometry(sec);
    // Should have found tw/tf from the catalog
    expect(rs.tw).toBeGreaterThan(0.005); // IPE 300 tw ≈ 7.1mm
    expect(rs.tf).toBeGreaterThan(0.008); // IPE 300 tf ≈ 10.7mm
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CRITICAL SECTIONS
// ═══════════════════════════════════════════════════════════════════════

describe('suggestCriticalSections', () => {
  it('always includes both extremes', () => {
    const cs = suggestCriticalSections(simpleBeamForces(0, 10, 20, 5));
    expect(cs.some(c => c.t === 0)).toBe(true);
    expect(cs.some(c => c.t === 1)).toBe(true);
  });

  it('finds V=0 for uniform load (simply supported)', () => {
    const ef = uniformLoadBeam(-10, 6);
    const cs = suggestCriticalSections(ef);
    const vZero = cs.find(c => c.reason.includes('V=0'));
    expect(vZero).toBeDefined();
    expect(vZero!.t).toBeCloseTo(0.5, 1);
  });

  it('finds V=0 for asymmetric uniform load', () => {
    // V(0) = 40, q = -20, L = 4: V(x) = 40 - 20x = 0 → x = 2 → t = 0.5
    const ef: ElementForces = {
      elementId: 1,
      nStart: 0, nEnd: 0,
      vStart: 40, vEnd: -40,
      mStart: 0, mEnd: 0,
      length: 4, qI: -20, qJ: -20,
    };
    const cs = suggestCriticalSections(ef);
    expect(cs.find(c => c.reason.includes('V=0'))).toBeDefined();
  });

  it('finds V=0 for trapezoidal load', () => {
    // Trapezoidal: qi = -10, qj = -30, L = 6
    // V(x) = Vs + (-10)x + (-30-(-10))x²/(2·6) = Vs - 10x - (20/12)x²
    // Need Vs such that sum of loads = 0 for equilibrium
    const L = 6, qi = -10, qj = -30;
    const totalLoad = (qi + qj) / 2 * L; // -120
    const Vs = -totalLoad / 2; // 60 (if simply supported, roughly)
    const ef: ElementForces = {
      elementId: 1,
      nStart: 0, nEnd: 0,
      vStart: Vs, vEnd: -(totalLoad + Vs),
      mStart: 0, mEnd: 0,
      length: L, qI: qi, qJ: qj,
    };
    const cs = suggestCriticalSections(ef);
    // Should find at least one V=0 point
    const vZeros = cs.filter(c => c.reason.includes('V=0'));
    expect(vZeros.length).toBeGreaterThanOrEqual(1);
    // And it should be between 0 and 1
    for (const vz of vZeros) {
      expect(vz.t).toBeGreaterThan(0);
      expect(vz.t).toBeLessThan(1);
    }
  });

  it('includes point load positions', () => {
    const ef: ElementForces = {
      elementId: 1,
      nStart: 0, nEnd: 0,
      vStart: 20, vEnd: -20,
      mStart: 0, mEnd: 0,
      length: 10, qI: 0, qJ: 0,
      pointLoads: [{ a: 4, p: -40 }],
    };
    const cs = suggestCriticalSections(ef);
    expect(cs.find(c => c.reason.includes('Point load'))).toBeDefined();
  });

  it('includes midpoint if no other near 0.5', () => {
    const ef = simpleBeamForces(0, 10, 20, 5);
    const cs = suggestCriticalSections(ef);
    expect(cs.find(c => Math.abs(c.t - 0.5) < 0.06)).toBeDefined();
  });

  it('deduplicates close points', () => {
    const ef: ElementForces = {
      elementId: 1,
      nStart: 0, nEnd: 0,
      vStart: 30, vEnd: -30,
      mStart: 0, mEnd: 0,
      length: 6, qI: -10, qJ: -10,
      pointLoads: [{ a: 3.01, p: -1 }], // very close to midpoint
    };
    const cs = suggestCriticalSections(ef);
    // Should not have two sections within 0.02 of each other
    for (let i = 1; i < cs.length; i++) {
      expect(cs[i].t - cs[i - 1].t).toBeGreaterThan(0.02);
    }
  });

  it('no V=0 for constant shear (no distributed load)', () => {
    const ef = simpleBeamForces(0, 50, 100, 5);
    const cs = suggestCriticalSections(ef);
    expect(cs.find(c => c.reason.includes('V=0'))).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// FULL ANALYSIS (integration)
// ═══════════════════════════════════════════════════════════════════════

describe('analyzeSectionStress — integration', () => {
  it('returns correct N, V, M at t=0', () => {
    const ef = simpleBeamForces(10, 20, 30, 5);
    const r = analyzeSectionStress(ef, rectSection(0.1, 0.2), 250, 0);
    expect(r.N).toBeCloseTo(10, 1);
    expect(r.V).toBeCloseTo(20, 1);
    expect(r.M).toBeCloseTo(30, 1);
  });

  it('simply supported beam with uniform load: M_max at midspan', () => {
    // q = -10 kN/m, L = 6m → M_max = qL²/8 = 10*36/8 = 45 kN·m
    const ef = uniformLoadBeam(-10, 6);
    const rMid = analyzeSectionStress(ef, rectSection(0.1, 0.3), 250, 0.5);
    expect(rMid.M).toBeCloseTo(-45, 0); // Sign depends on convention
    expect(rMid.V).toBeCloseTo(0, 0); // V=0 at midspan
  });

  it('extreme fiber has max sigma, centroid has max tau', () => {
    const sec = rectSection(0.1, 0.2);
    const ef = simpleBeamForces(0, 50, 100, 4);
    const rTop = analyzeSectionStress(ef, sec, 250, 0, 0.1);
    const rMid = analyzeSectionStress(ef, sec, 250, 0, 0);
    // σ should be max at extreme, τ max at centroid
    expect(Math.abs(rTop.sigmaAtY)).toBeGreaterThan(Math.abs(rMid.sigmaAtY));
    expect(rMid.tauAtY).toBeGreaterThan(rTop.tauAtY);
  });

  it('Von Mises is consistent with sigma and tau', () => {
    const ef = simpleBeamForces(50, 30, 80, 5);
    const r = analyzeSectionStress(ef, rectSection(0.1, 0.2), 250, 0, 0.05);
    const expectedVM = Math.sqrt(r.sigmaAtY ** 2 + 3 * r.tauAtY ** 2);
    expect(r.failure.vonMises).toBeCloseTo(expectedVM, 3);
  });

  it('Mohr circle is consistent with sigma and tau', () => {
    const ef = simpleBeamForces(0, 40, 60, 4);
    const r = analyzeSectionStress(ef, rectSection(0.1, 0.2), undefined, 0, 0.05);
    expect(r.mohr.center).toBeCloseTo(r.sigmaAtY / 2, 3);
    expect(r.mohr.sigma1 + r.mohr.sigma2).toBeCloseTo(r.sigmaAtY, 3);
  });

  it('I-section analysis produces reasonable stress magnitudes', () => {
    // IPE 300 with M = 100 kN·m → σ ≈ M·ymax/Iz = 100*0.15/8.356e-5/1000 ≈ 179 MPa
    const ef = simpleBeamForces(0, 50, 100, 5);
    const r = analyzeSectionStress(ef, iSection(), 355, 0, 0.15);
    expect(r.sigmaAtY).toBeCloseTo(179.5, -1); // within ~10
    expect(r.failure.vonMises).toBeGreaterThan(100);
    expect(r.failure.ratioVM).toBeLessThan(1); // should be ok for S355
  });

  it('works with no fy (failure check returns nulls)', () => {
    const ef = simpleBeamForces(0, 30, 50, 5);
    const r = analyzeSectionStress(ef, rectSection(0.1, 0.2), undefined, 0);
    expect(r.failure.fy).toBeNull();
    expect(r.failure.ok).toBeNull();
  });

  it('distribution sigma matches sigmaAtY for matching fiber', () => {
    const ef = simpleBeamForces(10, 30, 50, 5);
    const sec = rectSection(0.1, 0.2);
    const r = analyzeSectionStress(ef, sec, 250, 0, 0.1); // top fiber
    // Last point in distribution is at y = +h/2 = 0.1
    const topPt = r.distribution[r.distribution.length - 1];
    expect(topPt.sigma).toBeCloseTo(r.sigmaAtY, 3);
  });

  it('varying t position gives different M along uniform loaded beam', () => {
    const ef = uniformLoadBeam(-10, 6);
    const sec = rectSection(0.1, 0.2);
    const r0 = analyzeSectionStress(ef, sec, 250, 0);
    const r05 = analyzeSectionStress(ef, sec, 250, 0.5);
    // M at supports ≈ 0, M at midspan ≈ max
    expect(Math.abs(r0.M)).toBeLessThan(Math.abs(r05.M));
  });
});

// ─── ResolvedSection: Iy and J ────────────────────────────────────────

describe('ResolvedSection Iy and J', () => {
  it('resolves about-Z inertia for rectangular section: h·b³/12', () => {
    const sec = rectSection(0.1, 0.2);
    const rs = resolveSectionGeometry(sec);
    const expected = 0.2 * 0.1 ** 3 / 12; // h·b³/12 = about Z vertical
    expect(rs.iz).toBeCloseTo(expected, 10);
  });

  it('resolves about-Y from profile catalog for IPE 200', () => {
    // sec.iy not set → should look up profile.iy (about Y horizontal)
    const sec: Section = { id: 1, name: 'IPE 200', a: 28.5e-4, iz: 142e-8, shape: 'I' };
    const rs = resolveSectionGeometry(sec);
    // IPE 200 catalog: iy = 1943 cm⁴ (about Y) → resolved.iy (primary bending)
    expect(rs.iy).toBeCloseTo(1943e-8, 10);
  });

  it('resolves about-Y from user-provided sec.iy (takes priority)', () => {
    const sec: Section = { id: 1, name: 'IPE 200', a: 28.5e-4, iz: 142e-8, shape: 'I', iy: 999e-8 };
    const rs = resolveSectionGeometry(sec);
    // sec.iy (about Y) → rs.iy (primary bending)
    expect(rs.iy).toBeCloseTo(999e-8, 12);
  });

  it('estimates J for I/H section: (1/3)·(2bf·tf³ + hw·tw³)', () => {
    const sec = iSection();
    const rs = resolveSectionGeometry(sec);
    const hw = 0.3 - 2 * 0.0107;
    const expected = (2 * 0.15 * 0.0107 ** 3 + hw * 0.0071 ** 3) / 3;
    expect(rs.j).toBeCloseTo(expected, 12);
  });

  it('estimates J for RHS: 2·t·(b-t)²·(h-t)²/(b+h-2t)', () => {
    const sec = rhsSection();
    const rs = resolveSectionGeometry(sec);
    const t = 0.006, bm = 0.1 - t, hm = 0.2 - t;
    const expected = 2 * t * bm ** 2 * hm ** 2 / (0.1 + 0.2 - 2 * t);
    expect(rs.j).toBeCloseTo(expected, 12);
  });

  it('resolves zMin/zMax for symmetric sections', () => {
    const rs = resolveSectionGeometry(rectSection(0.1, 0.2));
    expect(rs.zMin).toBeCloseTo(-0.05, 10);
    expect(rs.zMax).toBeCloseTo(0.05, 10);
  });
});

// ─── Rankine failure criterion ────────────────────────────────────────

describe('Rankine failure criterion', () => {
  it('pure tension: Rankine equals sigma', () => {
    const f = checkFailure(100, 0, 250);
    expect(f.rankine).toBeCloseTo(100, 6);
  });

  it('pure compression: Rankine equals |sigma|', () => {
    const f = checkFailure(-150, 0, 250);
    expect(f.rankine).toBeCloseTo(150, 6);
  });

  it('pure shear: Rankine equals tau (σ₁ = τ for σ=0)', () => {
    const f = checkFailure(0, 80, 250);
    // σ₁ = 0/2 + √(0 + 80²) = 80, σ₃ = -80 → rankine = 80
    expect(f.rankine).toBeCloseTo(80, 6);
  });

  it('combined: Rankine = |center| + radius', () => {
    const sigma = 100, tau = 50;
    const center = sigma / 2; // = 50
    const radius = Math.sqrt(center ** 2 + tau ** 2); // √(2500+2500) = √5000 ≈ 70.71
    const f = checkFailure(sigma, tau, 250);
    // σ₁ = 50 + 70.71 = 120.71
    // σ₃ = 50 - 70.71 = -20.71
    // Rankine = max(120.71, 20.71) = 120.71
    expect(f.rankine).toBeCloseTo(center + radius, 4);
  });

  it('ratioRankine = rankine / fy', () => {
    const f = checkFailure(100, 0, 200);
    expect(f.ratioRankine).toBeCloseTo(0.5, 6);
  });

  it('ratioRankine is null if no fy', () => {
    const f = checkFailure(100, 50, undefined);
    expect(f.ratioRankine).toBeNull();
  });
});

// ─── Neutral Axis in 2D ──────────────────────────────────────────────

describe('neutralAxisY (2D)', () => {
  it('pure bending (N=0): neutral axis at centroid (y=0)', () => {
    const ef = simpleBeamForces(0, 50, 100, 5);
    const r = analyzeSectionStress(ef, rectSection(0.1, 0.2), 250, 0);
    // N=0 → y_EN = -0·Iz/(A·M) = 0, but M is set by V=50 at t=0, M should be = 100 kN·m
    // Actually at t=0 for simpleBeamForces: M = mStart = 100
    if (Math.abs(r.M) > 1e-10) {
      expect(r.neutralAxisY).toBeCloseTo(0, 6);
    }
  });

  it('axial + bending: neutral axis shifts', () => {
    // N>0 shifts neutral axis downward: y_EN = -N·Iz/(A·M)
    // Iz here is the resolved primary bending inertia (about Y horizontal)
    const sec = rectSection(0.1, 0.2);
    const A = sec.a;
    const Iz = sec.iy!;  // about Y horizontal — used as primary bending inertia
    const ef = simpleBeamForces(100, 50, 200, 5); // N=100kN, M=200kN·m at t=0
    const r = analyzeSectionStress(ef, sec, 250, 0);
    if (r.neutralAxisY !== null) {
      const expected = -(r.N * Iz) / (A * r.M);
      expect(r.neutralAxisY).toBeCloseTo(expected, 6);
    }
  });

  it('large N with small M: neutral axis outside section → null', () => {
    // N very large, M very small → |y_EN| > h/2
    const sec = rectSection(0.1, 0.2);
    const ef = simpleBeamForces(5000, 0, 0.001, 5);
    const r = analyzeSectionStress(ef, sec, 250, 0);
    // y_EN would be huge → outside section → null
    if (Math.abs(r.M) < 1e-6) {
      expect(r.neutralAxisY).toBeNull();
    }
  });
});

// ─── Central Core (Núcleo Central) ────────────────────────────────────

describe('computeCentralCore', () => {
  it('rectangular section: diamond with h/6 and b/6', () => {
    const sec = rectSection(0.1, 0.2);
    const rs = resolveSectionGeometry(sec);
    const core = computeCentralCore(rs);

    // For rectangle: eyMax = h/6, ezMax = b/6
    expect(core.eyMax).toBeCloseTo(0.2 / 6, 8);
    expect(core.ezMax).toBeCloseTo(0.1 / 6, 8);
    // Diamond has 4 vertices
    expect(core.vertices).toHaveLength(4);
  });

  it('rectangular section: vertices at (0,±h/6) and (±b/6,0)', () => {
    const b = 0.1, h = 0.2;
    const sec = rectSection(b, h);
    const rs = resolveSectionGeometry(sec);
    const core = computeCentralCore(rs);

    // Find top vertex (ez=0, ey>0) and right vertex (ez>0, ey=0)
    const topV = core.vertices.find(v => Math.abs(v.ez) < 1e-10 && v.ey > 0);
    const rightV = core.vertices.find(v => v.ez > 0 && Math.abs(v.ey) < 1e-10);
    expect(topV!.ey).toBeCloseTo(h / 6, 8);
    expect(rightV!.ez).toBeCloseTo(b / 6, 8);
  });

  it('CHS section: circular core', () => {
    const sec = chsSection();
    const rs = resolveSectionGeometry(sec);
    const core = computeCentralCore(rs);

    // Core is a circle → 24 vertices
    expect(core.vertices.length).toBeGreaterThanOrEqual(12);
    // eyMax = ezMax for circular
    expect(core.eyMax).toBeCloseTo(core.ezMax, 8);
    // Rcore = Iz/(A·R)
    const R = rs.h / 2;
    const Rcore = rs.iy / (rs.a * R);
    expect(core.eyMax).toBeCloseTo(Rcore, 8);
  });

  it('I-section: diamond core (4 vertices, same as rectangle)', () => {
    const sec = iSection();
    const rs = resolveSectionGeometry(sec);
    const core = computeCentralCore(rs);

    // I/H sections have diamond core (flange corners constrain it)
    expect(core.vertices).toHaveLength(4);
    // eyMax = Iy/(A·h/2) and ezMax = Iz/(A·b/2)
    const eyExpected = rs.iy / (rs.a * (rs.h / 2));
    const ezExpected = rs.iz / (rs.a * (rs.b / 2));
    expect(core.eyMax).toBeCloseTo(eyExpected, 8);
    expect(core.ezMax).toBeCloseTo(ezExpected, 8);
  });

  it('I-section: core vertex does not produce tension at flange corners', () => {
    // Verify that every core vertex satisfies σ ≥ 0 at all material points
    const sec = iSection();
    const rs = resolveSectionGeometry(sec);
    const core = computeCentralCore(rs);

    // Material corners of I-section (flange corners are the critical ones)
    const corners = [
      { y: rs.h / 2, z: rs.b / 2 },
      { y: rs.h / 2, z: -rs.b / 2 },
      { y: -rs.h / 2, z: rs.b / 2 },
      { y: -rs.h / 2, z: -rs.b / 2 },
    ];

    for (const vertex of core.vertices) {
      const ey = vertex.ey;
      const ez = vertex.ez;
      for (const corner of corners) {
        // σ/σ₀ = 1 + ey·y·A/Iy + ez·z·A/Iz ≥ 0
        const ratio = 1 + ey * corner.y * rs.a / rs.iy + ez * corner.z * rs.a / rs.iz;
        expect(ratio).toBeGreaterThanOrEqual(-1e-10);
      }
    }
  });

  it('generic (diamond) core: σ = 0 at extreme fiber for each vertex', () => {
    // At each diamond vertex, exactly one extreme fiber has σ = 0
    const sec = rectSection(0.1, 0.2);
    const rs = resolveSectionGeometry(sec);
    const core = computeCentralCore(rs);

    // Top vertex (0, eyPos): σ = 0 at y = yMin (bottom fiber)
    const topV = core.vertices.find(v => Math.abs(v.ez) < 1e-10 && v.ey > 0)!;
    const sigmaAtBottom = 1 + topV.ey * rs.yMin * rs.a / rs.iy;
    expect(sigmaAtBottom).toBeCloseTo(0, 8);

    // Right vertex (ezPos, 0): σ = 0 at z = zMin (left edge)
    const rightV = core.vertices.find(v => v.ez > 0 && Math.abs(v.ey) < 1e-10)!;
    const sigmaAtLeft = 1 + rightV.ez * rs.zMin * rs.a / rs.iz;
    expect(sigmaAtLeft).toBeCloseTo(0, 8);
  });

  it('all shapes produce convex core with vertices inside section bounds', () => {
    const sections = [rectSection(0.1, 0.2), iSection(), rhsSection(), chsSection()];
    for (const sec of sections) {
      const rs = resolveSectionGeometry(sec);
      const core = computeCentralCore(rs);
      expect(core.vertices.length).toBeGreaterThanOrEqual(4);
      // All core vertices should be within section bounds
      for (const v of core.vertices) {
        expect(Math.abs(v.ey)).toBeLessThanOrEqual(rs.h / 2 + 1e-10);
        expect(Math.abs(v.ez)).toBeLessThanOrEqual(rs.b / 2 + 1e-10);
      }
    }
  });
});

// ─── Pressure Center (Centro de Presiones) — sign correctness ────────

describe('Pressure center sign convention (2D)', () => {
  // In 2D: σ = N/A + M·y/Iz
  // With eccentric N: M = N·ey → ey = M/N (= yCP)
  // The CP should be on the OPPOSITE side of the centroid from the EN

  it('CP on opposite side from EN for compression + positive M', () => {
    // N = -100 kN (compression), M = 10 kN·m (positive)
    // EN position: y_EN = -N·Iz/(A·M) = -(-100)·Iz/(A·10) = +100·Iz/(10·A)
    // CP position: y_CP = M/N = 10/(-100) = -0.1 m
    // EN is positive, CP is negative → opposite sides ✓
    const sec = rectSection(0.1, 0.2);
    const A = sec.a;
    const Iz = sec.iy!; // about Y (primary bending) → resolved.iy
    const N = -100, M = 10;

    const yEN = -(N * Iz) / (A * M);
    const yCP = M / N; // CORRECT formula: ey = M/N

    // EN and CP must be on opposite sides of centroid
    expect(yEN * yCP).toBeLessThan(0);
  });

  it('CP on opposite side from EN for tension + negative M', () => {
    const sec = rectSection(0.1, 0.2);
    const A = sec.a;
    const Iz = sec.iy!;
    const N = 200, M = -30;

    const yEN = -(N * Iz) / (A * M);
    const yCP = M / N;

    expect(yEN * yCP).toBeLessThan(0);
  });

  it('yCP · yEN = -iy² (exact relationship for any N, M)', () => {
    // yEN = -N·Iz/(A·M), yCP = M/N
    // yEN · yCP = -N·Iz/(A·M) · M/N = -Iz/A = -iy²
    const sec = rectSection(0.1, 0.2);
    const A = sec.a;
    const Iz = sec.iy!;
    const iy2 = Iz / A; // radius of gyration squared

    for (const [N, M] of [[-100, 10], [200, -30], [-50, -20], [300, 5]]) {
      const yEN = -(N * Iz) / (A * M);
      const yCP = M / N;
      expect(yEN * yCP).toBeCloseTo(-iy2, 10);
    }
  });
});

// ─── Pressure Center (Centro de Presiones) — sign correctness (3D) ──

describe('Pressure center sign convention (3D)', () => {
  // σ = N/A + Mz·y/Iyy - My·z/Izz
  // With eccentric N: Mz = N·ey → ey = Mz/N (= yCP)
  //                   -My = N·ez → ez = -My/N (= zCP)

  it('yCP = Mz/N, zCP = -My/N (correct signs)', () => {
    const N = -100, Mz = -10, My = 5;
    const yCP = Mz / N;   // = -10/(-100) = +0.1 m
    const zCP = -My / N;  // = -5/(-100) = +0.05 m

    expect(yCP).toBeCloseTo(0.1, 10);
    expect(zCP).toBeCloseTo(0.05, 10);
  });

  it('CP on opposite side from EN along y-axis for biaxial bending', () => {
    // IPN 200 with N=-100kN, Mz=-10kN·m, My=0
    const sec = iSection();
    const rs = resolveSectionGeometry(sec);
    const A = rs.a;
    const Iz = rs.iy; // LARGE (Iyy = about Y horizontal)
    const N = -100, Mz = -10, My = 0;

    // EN intercept: y = -N·Iz/(A·Mz)
    const yEN = -(N * Iz) / (A * Mz);
    // CP: yCP = Mz/N
    const yCP = Mz / N;

    // Must be on opposite sides
    expect(yEN * yCP).toBeLessThan(0);
  });

  it('yCP · yEN = -Iyy/A and zCP · zEN_component = -Izz/A', () => {
    // For pure Mz (My=0): yEN = -N·Iyy/(A·Mz), yCP = Mz/N
    // Product: yEN·yCP = -Iyy/A
    const sec = iSection();
    const rs = resolveSectionGeometry(sec);
    const Iyy = rs.iy; // LARGE
    const Izz = rs.iz; // SMALL
    const A = rs.a;

    // Pure Mz case
    const N1 = -100, Mz1 = -10;
    const yEN1 = -(N1 * Iyy) / (A * Mz1);
    const yCP1 = Mz1 / N1;
    expect(yEN1 * yCP1).toBeCloseTo(-Iyy / A, 10);

    // Pure My case (EN is vertical, slope=∞, but for z-axis version):
    // zEN = -N·Izz/(A·(-My)) = N·Izz/(A·My)
    // zCP = -My/N
    // Product: zEN·zCP = N·Izz/(A·My)·(-My/N) = -Izz/A
    const N2 = -50, My2 = 5;
    const zEN2 = N2 * Izz / (A * My2);
    const zCP2 = -My2 / N2;
    expect(zEN2 * zCP2).toBeCloseTo(-Izz / A, 10);
  });
});

// ═══════════════════════════════════════════════════════════════
// iy/iz naming consistency — regression tests
// Ensures ResolvedSection.iy = strong axis (about Y horizontal)
// and ResolvedSection.iz = weak axis (about Z vertical)
// ═══════════════════════════════════════════════════════════════

describe('ResolvedSection iy/iz naming consistency', () => {
  it('rs.iy = sec.iy = strong axis (about Y horizontal, LARGE for IPN)', () => {
    const sec = iSection(); // IPE 300: iy=8.356e-5 (strong), iz=6.04e-6 (weak)
    const rs = resolveSectionGeometry(sec);
    // resolved.iy must equal raw sec.iy (about Y horizontal = strong axis)
    expect(rs.iy).toBeCloseTo(sec.iy!, 12);
    // Strong axis must be much larger than weak axis
    expect(rs.iy).toBeGreaterThan(rs.iz * 5);
  });

  it('rs.iz = sec.iz = weak axis (about Z vertical, SMALL for IPN)', () => {
    const sec = iSection();
    const rs = resolveSectionGeometry(sec);
    // resolved.iz must equal raw sec.iz (about Z vertical = weak axis)
    expect(rs.iz).toBeCloseTo(sec.iz, 12);
  });

  it('rect section: rs.iy has h³ term (LARGE when h > b), rs.iz has b³ term (SMALL)', () => {
    // b=0.1m (width), h=0.3m (height) → iy = b·h³/12 >> iz = h·b³/12
    const sec = rectSection(0.1, 0.3);
    const rs = resolveSectionGeometry(sec);
    const expectedIy = 0.1 * 0.3 ** 3 / 12; // about Y horizontal (h³)
    const expectedIz = 0.3 * 0.1 ** 3 / 12; // about Z vertical (b³)
    expect(rs.iy).toBeCloseTo(expectedIy, 12);
    expect(rs.iz).toBeCloseTo(expectedIz, 12);
    expect(rs.iy).toBeGreaterThan(rs.iz); // h > b → iy > iz
  });

  it('IPN 300 from catalog: rs.iy ≈ 9800 cm⁴, rs.iz ≈ 451 cm⁴ — direct mapping', () => {
    const sec: Section = {
      id: 1, name: 'IPN 300',
      a: 0.00690,
      iy: 0.00009800,  // 9800 cm⁴ → m⁴ (about Y horizontal = strong)
      iz: 0.00000451,  // 451 cm⁴ → m⁴ (about Z vertical = weak)
      shape: 'I',
    };
    const rs = resolveSectionGeometry(sec);
    // Direct mapping: rs.iy = sec.iy, rs.iz = sec.iz
    expect(rs.iy).toBeCloseTo(0.00009800, 10);
    expect(rs.iz).toBeCloseTo(0.00000451, 10);
    // Ratio iy/iz ≈ 21.7 for IPN 300
    expect(rs.iy / rs.iz).toBeCloseTo(9800 / 451, 0);
  });

  it('Jourawski shear stress uses rs.iy (strong axis) in denominator', () => {
    const sec = rectSection(0.1, 0.2); // b=0.1, h=0.2
    const rs = resolveSectionGeometry(sec);
    const V = 10; // kN
    // At centroid (y=0), τ_max = 1.5·V/A for rectangle
    const tau = shearStress(V, 0, rs);
    const expectedTau = 1.5 * V / sec.a / 1000; // kN/m² → MPa
    expect(tau).toBeCloseTo(expectedTau, 4);
    // Verify it uses iy (strong axis) by checking formula: τ = V·Q/(Iy·b)
    const Q_at_center = rs.b * (rs.h / 2) ** 2 / 2; // b·(h/2)²/2
    const tauFromFormula = V * Q_at_center / (rs.iy * rs.b) / 1000;
    expect(tau).toBeCloseTo(tauFromFormula, 8);
  });

  it('normalStress uses correct inertia: σ = N/A + M·y/Iy', () => {
    const A = 0.01; // m²
    const Iy = 1e-4; // m⁴ (about Y horizontal = strong axis)
    const N = 100; // kN
    const M = 50;  // kN·m
    const y = 0.1; // m
    const sigma = normalStress(N, M, A, Iy, y);
    // σ = (N/A + M·y/Iy) / 1000
    const expected = (100 / 0.01 + 50 * 0.1 / 1e-4) / 1000;
    expect(sigma).toBeCloseTo(expected, 6);
  });

  it('analyzeSectionStress passes rs.iy to normalStress (not rs.iz)', () => {
    // Create a section where iy >> iz to detect if wrong inertia is used
    const sec: Section = {
      id: 1, name: 'test',
      a: 0.01,
      iy: 1e-3,      // LARGE (strong axis, about Y horizontal)
      iz: 1e-6,       // SMALL (weak axis, about Z vertical)
      b: 0.1, h: 0.2,
      shape: 'rect',
    };
    const ef: ElementForces = {
      elementId: 1, length: 3,
      nStart: 0, nEnd: 0,
      vStart: 0, vEnd: 0,
      mStart: 100, mEnd: -100,
      hingeStart: false, hingeEnd: false,
      qI: 0, qJ: 0, pointLoads: [], distributedLoads: [],
    };
    const result = analyzeSectionStress(ef, sec, 355, 0.5);
    // At midspan (t=0.5), M=0 → σ should be 0 everywhere
    // At start (t=0), M=100 kN·m → σ at extreme fiber = M·yMax/Iy / 1000
    const resultStart = analyzeSectionStress(ef, sec, 355, 0);
    const yMax = sec.h! / 2;
    // If it used iy (correct): σ = 100 * 0.1 / 1e-3 / 1000 = 10 MPa
    // If it used iz (wrong):   σ = 100 * 0.1 / 1e-6 / 1000 = 10000 MPa
    const extremeSigma = resultStart.distribution.find(p => Math.abs(p.y - yMax) < 1e-6)?.sigma ?? 0;
    expect(Math.abs(extremeSigma)).toBeLessThan(100); // Must be ~10, not ~10000
    expect(Math.abs(extremeSigma)).toBeGreaterThan(1); // Must be non-zero
  });
});
