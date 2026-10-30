import { describe, it, expect } from 'vitest';
import { generalizedEigen, matMul, transpose } from '../dense';
import { modalSolve, modalResponse, directIntegration, modalDampingMatrix } from '../modal-decomposition';
import { condense, consistentFrameMass } from '../mass-model';
import type { DofRef } from '../mdof-system';

const dofs2: DofRef[] = [{ nodeId: 1, dir: 'ux' }, { nodeId: 2, dir: 'ux' }];

describe('two-storey shear building, m1 = m2 = m, k1 = k2 = k', () => {
  const m = 10, k = 4000;
  const K = [[2 * k, -k], [-k, k]];
  const M = [[m, 0], [0, m]];

  it('det(K − ω²M) = 0 gives ω² = (3 ∓ √5)/2 · k/m', () => {
    const { lambda } = generalizedEigen(K, M);
    expect(lambda[0]).toBeCloseTo(((3 - Math.sqrt(5)) / 2) * (k / m), 9);
    expect(lambda[1]).toBeCloseTo(((3 + Math.sqrt(5)) / 2) * (k / m), 9);
  });

  it('the modes, largest component 1: φ1 = (0.618, 1), φ2 = (1, −0.618)', () => {
    const s = modalSolve(K, M, dofs2);
    const g = (Math.sqrt(5) - 1) / 2;
    expect(s.modes[0].phi[0]).toBeCloseTo(g, 10);
    expect(s.modes[0].phi[1]).toBeCloseTo(1, 12);
    expect(s.modes[1].phi[0]).toBeCloseTo(1, 12);
    expect(s.modes[1].phi[1]).toBeCloseTo(-g, 10);
  });

  it('orthogonality: ΦᵀMΦ and ΦᵀKΦ are diagonal and Kᵢ/Mᵢ = ωᵢ²', () => {
    const s = modalSolve(K, M, dofs2);
    expect(s.offM).toBeLessThan(1e-12);
    expect(s.offK).toBeLessThan(1e-12);
    s.modes.forEach((md, i) => {
      expect(s.PtMP[i][i]).toBeCloseTo(md.Mg, 9);
      expect(s.PtKP[i][i] / s.PtMP[i][i]).toBeCloseTo(md.omega ** 2, 8);
    });
  });

  it('participation and effective masses add up to the total mass', () => {
    const s = modalSolve(K, M, dofs2);
    expect(s.totalMassX).toBeCloseTo(2 * m, 12);
    expect(s.modes[0].meffX + s.modes[1].meffX).toBeCloseTo(2 * m, 9);
    const g = (Math.sqrt(5) - 1) / 2;
    expect(s.modes[0].gammaX).toBeCloseTo((m * (g + 1)) / (m * (g * g + 1)), 10);
  });

  it('modal superposition of the free vibration equals the direct integration of the coupled system', () => {
    const s = modalSolve(K, M, dofs2);
    const xi = 0.02;
    const u0 = [0.01, 0.02], v0 = [0, 0.1];
    const r = modalResponse(s, M, xi, { kind: 'free', u0, v0 });
    expect(r.u(0)[0]).toBeCloseTo(0.01, 12);
    expect(r.u(0)[1]).toBeCloseTo(0.02, 12);
    const T1 = s.modes[0].T;
    const times = Array.from({ length: 41 }, (_, i) => (i * 3 * T1) / 40);
    const direct = directIntegration(K, M, modalDampingMatrix(s, M, xi), () => [0, 0], u0, v0, times, s.modes[1].T / 400);
    const peak = Math.max(...times.map((t) => Math.abs(r.u(t)[1])));
    times.forEach((t, i) => {
      expect(Math.abs(direct[i][0] - r.u(t)[0])).toBeLessThan(2e-3 * peak);
      expect(Math.abs(direct[i][1] - r.u(t)[1])).toBeLessThan(2e-3 * peak);
    });
  });

  it('modal superposition of a harmonic force from rest equals the direct integration', () => {
    const s = modalSolve(K, M, dofs2);
    const xi = 0.05, F = [0, 100], W = 0.8 * s.modes[0].omega;
    const r = modalResponse(s, M, xi, { kind: 'harmonic', F, Omega: W });
    expect(r.P[0]).toBeCloseTo(100 * s.modes[0].phi[1], 10);
    const times = Array.from({ length: 61 }, (_, i) => (i * 6 * s.modes[0].T) / 60);
    const direct = directIntegration(K, M, modalDampingMatrix(s, M, xi), (t) => F.map((f) => f * Math.sin(W * t)), [0, 0], [0, 0], times, s.modes[1].T / 400);
    const peak = Math.max(...times.map((t) => Math.abs(r.u(t)[1])));
    times.forEach((t, i) => expect(Math.abs(direct[i][1] - r.u(t)[1])).toBeLessThan(3e-3 * peak));
  });
});

describe('static (Guyan) condensation', () => {
  it('a 2×2 system condensed onto its first unknown: k11 − k12²/k22', () => {
    const K = [[10, -4], [-4, 6]];
    const c = condense(K, [[2, 0], [0, 0]], [3, 1], [0]);
    expect(c.K[0][0]).toBeCloseTo(10 - 16 / 6, 14);
    expect(c.T[1][0]).toBeCloseTo(4 / 6, 14);
    expect(c.M[0][0]).toBeCloseTo(2, 14);
    expect(c.F[0]).toBeCloseTo(3 + (4 / 6) * 1, 14);
  });

  it('a cantilever of one element condensed onto its tip deflection: 3EI/L³ and the consistent mass carried by T', () => {
    const EI = 1000, L = 2, rhoA = 0.5;
    const k = EI / L ** 3;
    const K = [[12 * k, -6 * L * k], [-6 * L * k, 4 * L * L * k]];
    const Mc = consistentFrameMass(rhoA, L);
    const M = [[Mc[4][4], Mc[4][5]], [Mc[5][4], Mc[5][5]]];
    const c = condense(K, M, [0, 0], [0]);
    expect(c.K[0][0]).toBeCloseTo((3 * EI) / L ** 3, 10);
    const t = c.T[1][0];
    expect(t).toBeCloseTo(1.5 / L, 12);
    const hand = M[0][0] + 2 * M[0][1] * t + M[1][1] * t * t;
    expect(c.M[0][0]).toBeCloseTo(hand, 12);
    const check = matMul(transpose(c.T), matMul(M, c.T));
    expect(check[0][0]).toBeCloseTo(c.M[0][0], 12);
  });
});
