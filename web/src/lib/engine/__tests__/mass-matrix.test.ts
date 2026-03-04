/**
 * Mass Matrix Tests — Consistent mass matrix verification
 *
 * The mass matrix is critical for modal analysis (natural frequencies).
 * Errors here produce wrong frequencies, misleading students.
 *
 * References:
 *   - Przemieniecki, Theory of Matrix Structural Analysis, Ch. 11
 *   - Cook, Concepts and Applications of FEA, Ch. 13
 */

import { describe, it, expect } from 'vitest';
import { frameConsistentMass, trussConsistentMass } from '../mass-matrix';

// ─── Frame Consistent Mass Matrix (6×6) ──────────────────────
// DOFs: [u1, v1, θ1, u2, v2, θ2]
// M = (ρA·L/420) × [standard coefficients]

describe('Frame consistent mass matrix', () => {
  const rhoA = 78.5; // kg/m (e.g. steel ρ=7850 kg/m³, A=0.01 m²)
  const L = 5; // m
  const c = rhoA * L / 420;

  it('has correct dimensions (6×6)', () => {
    const M = frameConsistentMass(rhoA, L);
    expect(M.length).toBe(36);
  });

  it('is symmetric', () => {
    const M = frameConsistentMass(rhoA, L);
    const n = 6;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        expect(M[i * n + j]).toBeCloseTo(M[j * n + i], 10);
      }
    }
  });

  it('axial diagonal terms: 140·c', () => {
    const M = frameConsistentMass(rhoA, L);
    expect(M[0 * 6 + 0]).toBeCloseTo(140 * c, 8);
    expect(M[3 * 6 + 3]).toBeCloseTo(140 * c, 8);
  });

  it('axial off-diagonal: 70·c', () => {
    const M = frameConsistentMass(rhoA, L);
    expect(M[0 * 6 + 3]).toBeCloseTo(70 * c, 8);
    expect(M[3 * 6 + 0]).toBeCloseTo(70 * c, 8);
  });

  it('transverse diagonal terms: 156·c', () => {
    const M = frameConsistentMass(rhoA, L);
    expect(M[1 * 6 + 1]).toBeCloseTo(156 * c, 8);
    expect(M[4 * 6 + 4]).toBeCloseTo(156 * c, 8);
  });

  it('rotation diagonal terms: 4L²·c', () => {
    const M = frameConsistentMass(rhoA, L);
    const L2 = L * L;
    expect(M[2 * 6 + 2]).toBeCloseTo(4 * L2 * c, 8);
    expect(M[5 * 6 + 5]).toBeCloseTo(4 * L2 * c, 8);
  });

  it('coupling terms v1-θ1: 22L·c', () => {
    const M = frameConsistentMass(rhoA, L);
    expect(M[1 * 6 + 2]).toBeCloseTo(22 * L * c, 8);
    expect(M[2 * 6 + 1]).toBeCloseTo(22 * L * c, 8);
  });

  it('total mass: M·1 should give total element mass', () => {
    // Summing row 0 (axial DOF u1): should relate to total mass ρAL
    // For consistent mass: sum of translational DOF row = ρAL/2
    const M = frameConsistentMass(rhoA, L);
    const totalMass = rhoA * L;
    // Sum of u1 row (axial): M[0,0] + M[0,3] = 140c + 70c = 210c = ρAL/2
    expect(M[0 * 6 + 0] + M[0 * 6 + 3]).toBeCloseTo(totalMass / 2, 6);
  });

  it('all diagonal entries are positive (positive definite)', () => {
    const M = frameConsistentMass(rhoA, L);
    for (let i = 0; i < 6; i++) {
      expect(M[i * 6 + i]).toBeGreaterThan(0);
    }
  });

  it('scales linearly with ρA and L', () => {
    const M1 = frameConsistentMass(rhoA, L);
    const M2 = frameConsistentMass(2 * rhoA, L);
    const M3 = frameConsistentMass(rhoA, 2 * L);

    // Doubling ρA doubles all entries
    for (let i = 0; i < 36; i++) {
      if (Math.abs(M1[i]) > 1e-15) {
        expect(M2[i] / M1[i]).toBeCloseTo(2, 8);
      }
    }
    // Note: doubling L does NOT simply double entries (L appears in c and L² terms)
    // But c doubles, and L² terms quadruple → check specific entries
    const c2 = rhoA * (2 * L) / 420;
    expect(M3[0 * 6 + 0]).toBeCloseTo(140 * c2, 8);
  });
});

// ─── Truss Consistent Mass Matrix (4×4) ──────────────────────
// DOFs: [u1, v1, u2, v2]
// M = (ρA·L/6) × [2 0 1 0; 0 2 0 1; 1 0 2 0; 0 1 0 2]

describe('Truss consistent mass matrix', () => {
  const rhoA = 78.5;
  const L = 4;
  const c = rhoA * L / 6;

  it('has correct dimensions (4×4)', () => {
    const M = trussConsistentMass(rhoA, L);
    expect(M.length).toBe(16);
  });

  it('is symmetric', () => {
    const M = trussConsistentMass(rhoA, L);
    const n = 4;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        expect(M[i * n + j]).toBeCloseTo(M[j * n + i], 10);
      }
    }
  });

  it('diagonal terms: 2c', () => {
    const M = trussConsistentMass(rhoA, L);
    expect(M[0 * 4 + 0]).toBeCloseTo(2 * c, 8);
    expect(M[1 * 4 + 1]).toBeCloseTo(2 * c, 8);
    expect(M[2 * 4 + 2]).toBeCloseTo(2 * c, 8);
    expect(M[3 * 4 + 3]).toBeCloseTo(2 * c, 8);
  });

  it('off-diagonal coupling: c', () => {
    const M = trussConsistentMass(rhoA, L);
    expect(M[0 * 4 + 2]).toBeCloseTo(c, 8);
    expect(M[2 * 4 + 0]).toBeCloseTo(c, 8);
    expect(M[1 * 4 + 3]).toBeCloseTo(c, 8);
    expect(M[3 * 4 + 1]).toBeCloseTo(c, 8);
  });

  it('no cross-coupling between directions', () => {
    const M = trussConsistentMass(rhoA, L);
    // u1-v1 should be zero
    expect(M[0 * 4 + 1]).toBeCloseTo(0, 10);
    // u1-v2 should be zero
    expect(M[0 * 4 + 3]).toBeCloseTo(0, 10);
    // u2-v1 should be zero
    expect(M[2 * 4 + 1]).toBeCloseTo(0, 10);
  });

  it('total mass conservation: row sum for u = ρAL/2', () => {
    const M = trussConsistentMass(rhoA, L);
    // Sum u1 row: M[0,0] + M[0,2] = 2c + c = 3c = ρAL/2
    expect(M[0 * 4 + 0] + M[0 * 4 + 2]).toBeCloseTo(rhoA * L / 2, 6);
  });
});

// ─── Geometric Stiffness Matrix ───────────────────────────────
// Already has symmetry tests in buckling.test.ts, add value checks here

describe('Geometric stiffness: frame element values', () => {
  // Import dynamically to avoid circular deps
  it('Przemieniecki coefficients for frame Kg', async () => {
    const { frameGeometricStiffness } = await import('../geometric-stiffness');
    const N = 100; // kN (tension)
    const L = 5;
    const c = N / (30 * L);

    const Kg = frameGeometricStiffness(N, L);

    // v1-v1: 36c
    expect(Kg[1 * 6 + 1]).toBeCloseTo(36 * c, 8);
    // v1-θ1: 3L·c
    expect(Kg[1 * 6 + 2]).toBeCloseTo(3 * L * c, 8);
    // v1-v2: -36c
    expect(Kg[1 * 6 + 4]).toBeCloseTo(-36 * c, 8);
    // θ1-θ1: 4L²·c
    expect(Kg[2 * 6 + 2]).toBeCloseTo(4 * L * L * c, 8);
    // θ1-θ2: -L²·c
    expect(Kg[2 * 6 + 5]).toBeCloseTo(-L * L * c, 8);
    // Axial terms should be zero
    expect(Kg[0 * 6 + 0]).toBeCloseTo(0, 10);
    expect(Kg[3 * 6 + 3]).toBeCloseTo(0, 10);
  });

  it('truss Kg: N/L on transverse terms only', async () => {
    const { trussGeometricStiffness } = await import('../geometric-stiffness');
    const N = 200;
    const L = 8;
    const c = N / L; // 25

    const Kg = trussGeometricStiffness(N, L);

    expect(Kg[1 * 4 + 1]).toBeCloseTo(c, 8);
    expect(Kg[1 * 4 + 3]).toBeCloseTo(-c, 8);
    expect(Kg[3 * 4 + 1]).toBeCloseTo(-c, 8);
    expect(Kg[3 * 4 + 3]).toBeCloseTo(c, 8);
    // Axial terms zero
    expect(Kg[0 * 4 + 0]).toBeCloseTo(0, 10);
    expect(Kg[2 * 4 + 2]).toBeCloseTo(0, 10);
  });

  it('Kg reverses sign under compression', async () => {
    const { frameGeometricStiffness } = await import('../geometric-stiffness');
    const KgT = frameGeometricStiffness(100, 5);
    const KgC = frameGeometricStiffness(-100, 5);

    for (let i = 0; i < 36; i++) {
      expect(KgC[i]).toBeCloseTo(-KgT[i], 10);
    }
  });
});
