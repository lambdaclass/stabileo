/**
 * Modal Analysis Tests — Verification against analytical beam theory
 *
 * Simply-supported beam natural frequencies (Euler-Bernoulli):
 *   ω_n = (nπ/L)² × √(EI / ρA)
 *   f_n = ω_n / (2π)
 *
 * With consistent mass FE, frequencies converge from above.
 *
 * References:
 *   - Clough & Penzien, Dynamics of Structures (3rd ed.)
 *   - Przemieniecki, Theory of Matrix Structural Analysis (1968)
 */

import { describe, it, expect } from 'vitest';
import { solveModal } from '../modal';
import type { ModalResult } from '../modal';
import type { SolverInput, SolverLoad } from '../types';

// ─── Constants ──────────────────────────────────────────────────

const E = 200_000;       // MPa
const A = 0.01;          // m²
const Iz = 1e-4;         // m⁴
const L = 5;             // m
const density = 7850;    // kg/m³ (steel)

// Solver units: E in MPa → solver uses E×1000 = kN/m²
// EI = E×1000 × Iz  (kN·m²)
const EI = E * 1000 * Iz; // 20,000 kN·m²

// Mass per unit length in solver units:
// density (kg/m³) × 0.001 → t/m³, × A → t/m = kN·s²/m²
const rhoA = density * 0.001 * A; // 0.0785 kN·s²/m²

// Analytical ω_n for simply-supported beam:
// ω_n = (nπ/L)² × √(EI / ρA)
function analyticalOmega(n: number): number {
  return Math.pow(n * Math.PI / L, 2) * Math.sqrt(EI / rhoA);
}

// ─── Helper ─────────────────────────────────────────────────────

function makeBeam(
  nElems: number,
  supports: Array<[number, number, string]>,
): SolverInput {
  const nodes = new Map<number, { id: number; x: number; y: number }>();
  const elements = new Map<number, any>();
  const dx = L / nElems;

  for (let i = 0; i <= nElems; i++) {
    nodes.set(i + 1, { id: i + 1, x: i * dx, y: 0 });
  }
  for (let i = 0; i < nElems; i++) {
    elements.set(i + 1, {
      id: i + 1, type: 'frame',
      nodeI: i + 1, nodeJ: i + 2,
      materialId: 1, sectionId: 1,
      hingeStart: false, hingeEnd: false,
    });
  }

  const sups = new Map(supports.map(([id, nodeId, type]) => [
    id, { id, nodeId, type: type as any },
  ]));

  return {
    nodes,
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: Iz }]]),
    elements,
    supports: sups,
    loads: [{ type: 'nodal', data: { nodeId: 1, fx: 0, fy: 0, mz: 0 } }], // dummy, modal doesn't need loads
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Modal Analysis — Simply-Supported Beam', () => {
  const densities = new Map([[1, density]]);

  it('first natural frequency (4 elements) ≈ analytical ω₁', () => {
    const input = makeBeam(4, [[1, 1, 'pinned'], [2, 5, 'rollerX']]);
    const result = solveModal(input, densities);
    expect(typeof result).not.toBe('string');

    const mr = result as ModalResult;
    expect(mr.modes.length).toBeGreaterThan(0);

    const omega1_FE = mr.modes[0].omega;
    const omega1_exact = analyticalOmega(1);
    const relError = Math.abs(omega1_FE - omega1_exact) / omega1_exact;

    expect(relError, `ω₁_FE = ${omega1_FE.toFixed(2)}, ω₁_exact = ${omega1_exact.toFixed(2)}`).toBeLessThan(0.02);
  });

  it('convergence: more elements → closer to analytical', () => {
    const errors: number[] = [];
    const omega1_exact = analyticalOmega(1);

    for (const nEl of [2, 4, 8]) {
      const input = makeBeam(nEl, [[1, 1, 'pinned'], [2, nEl + 1, 'rollerX']]);
      const result = solveModal(input, densities);
      if (typeof result === 'string') continue;
      const mr = result as ModalResult;
      if (mr.modes.length === 0) continue;

      const err = Math.abs(mr.modes[0].omega - omega1_exact) / omega1_exact;
      errors.push(err);
    }

    // Errors should decrease with refinement
    for (let i = 1; i < errors.length; i++) {
      expect(errors[i], 'Error should decrease with refinement').toBeLessThan(errors[i - 1]);
    }
    // 8 elements should be very accurate
    expect(errors[errors.length - 1]).toBeLessThan(0.005);
  });

  it('first three modes approximate ω_n = (nπ/L)² √(EI/ρA)', () => {
    const nEl = 8;
    const input = makeBeam(nEl, [[1, 1, 'pinned'], [2, nEl + 1, 'rollerX']]);
    const result = solveModal(input, densities, 6);
    expect(typeof result).not.toBe('string');

    const mr = result as ModalResult;
    // Check first 3 modes — higher modes need more elements for accuracy
    // Tolerance increases for higher modes: 2%, 5%, 15%
    const tolerances = [0.02, 0.05, 0.15];
    for (let n = 1; n <= Math.min(3, mr.modes.length); n++) {
      const omega_exact = analyticalOmega(n);
      const omega_FE = mr.modes[n - 1].omega;
      const relError = Math.abs(omega_FE - omega_exact) / omega_exact;
      expect(relError, `Mode ${n}: ω_FE=${omega_FE.toFixed(1)}, ω_exact=${omega_exact.toFixed(1)}`).toBeLessThan(tolerances[n - 1]);
    }
  });

  it('modes sorted by ascending frequency', () => {
    const nEl = 4;
    const input = makeBeam(nEl, [[1, 1, 'pinned'], [2, nEl + 1, 'rollerX']]);
    const result = solveModal(input, densities, 4);
    expect(typeof result).not.toBe('string');

    const mr = result as ModalResult;
    for (let i = 1; i < mr.modes.length; i++) {
      expect(mr.modes[i].frequency).toBeGreaterThan(mr.modes[i - 1].frequency);
    }
  });

  it('frequency-period consistency: f × T = 1', () => {
    const nEl = 4;
    const input = makeBeam(nEl, [[1, 1, 'pinned'], [2, nEl + 1, 'rollerX']]);
    const result = solveModal(input, densities);
    expect(typeof result).not.toBe('string');

    const mr = result as ModalResult;
    for (const mode of mr.modes) {
      expect(mode.frequency * mode.period).toBeCloseTo(1, 10);
      expect(mode.omega).toBeCloseTo(2 * Math.PI * mode.frequency, 5);
    }
  });

  it('mode shapes are normalized (max component = 1)', () => {
    const nEl = 4;
    const input = makeBeam(nEl, [[1, 1, 'pinned'], [2, nEl + 1, 'rollerX']]);
    const result = solveModal(input, densities, 3);
    expect(typeof result).not.toBe('string');

    const mr = result as ModalResult;
    for (const mode of mr.modes) {
      const maxComp = Math.max(
        ...mode.displacements.map(d => Math.max(Math.abs(d.ux), Math.abs(d.uy), Math.abs(d.rz))),
      );
      expect(maxComp).toBeCloseTo(1, 5);
    }
  });

  it('second mode frequency ≈ 4× first (n² ratio for SS beam)', () => {
    const nEl = 8;
    const input = makeBeam(nEl, [[1, 1, 'pinned'], [2, nEl + 1, 'rollerX']]);
    const result = solveModal(input, densities, 3);
    expect(typeof result).not.toBe('string');

    const mr = result as ModalResult;
    expect(mr.modes.length).toBeGreaterThanOrEqual(2);

    const ratio = mr.modes[1].omega / mr.modes[0].omega;
    // Exact ratio is (2/1)² = 4
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });
});

describe('Modal Analysis — Cantilever Beam', () => {
  const densities = new Map([[1, density]]);

  it('first frequency ≈ 3.516² / L² × √(EI/ρA)', () => {
    // Cantilever first mode: ω₁ = (1.8751/L)² × √(EI/ρA)
    const beta1L = 1.8751; // first root of cos(βL)·cosh(βL) + 1 = 0
    const omega1_exact = (beta1L / L) * (beta1L / L) * Math.sqrt(EI / rhoA);

    const nEl = 8;
    const input = makeBeam(nEl, [[1, 1, 'fixed']]);
    const result = solveModal(input, densities, 3);
    expect(typeof result).not.toBe('string');

    const mr = result as ModalResult;
    expect(mr.modes.length).toBeGreaterThan(0);

    const omega1_FE = mr.modes[0].omega;
    const relError = Math.abs(omega1_FE - omega1_exact) / omega1_exact;
    expect(relError, `ω₁_FE = ${omega1_FE.toFixed(2)}, ω₁_exact = ${omega1_exact.toFixed(2)}`).toBeLessThan(0.02);
  });
});

describe('Modal Analysis — Edge Cases', () => {
  it('zero density → returns error about mass', () => {
    const nEl = 2;
    const nodes = new Map<number, { id: number; x: number; y: number }>();
    const elements = new Map<number, any>();
    for (let i = 0; i <= nEl; i++) nodes.set(i + 1, { id: i + 1, x: i * 2.5, y: 0 });
    for (let i = 0; i < nEl; i++) {
      elements.set(i + 1, {
        id: i + 1, type: 'frame',
        nodeI: i + 1, nodeJ: i + 2,
        materialId: 1, sectionId: 1,
        hingeStart: false, hingeEnd: false,
      });
    }
    const input: SolverInput = {
      nodes,
      materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: A, iz: Iz }]]),
      elements,
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' as any }], [2, { id: 2, nodeId: nEl + 1, type: 'rollerX' as any }]]),
      loads: [],
    };

    // Density = 0 → zero mass matrix
    const result = solveModal(input, new Map([[1, 0]]));
    expect(typeof result).toBe('string');
    expect(result as string).toContain('density');
  });

  it('no free DOFs → returns error', () => {
    // Single element, both ends fully fixed
    const input: SolverInput = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 5, y: 0 }]]),
      materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: A, iz: Iz }]]),
      elements: new Map([[1, {
        id: 1, type: 'frame', nodeI: 1, nodeJ: 2,
        materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false,
      }]]),
      supports: new Map([
        [1, { id: 1, nodeId: 1, type: 'fixed' as any }],
        [2, { id: 2, nodeId: 2, type: 'fixed' as any }],
      ]),
      loads: [],
    };
    // Both ends fixed = some DOFs free (rotations at interior nodes, but this is 1 elem → both fixed → only interior DOFs: none since no interior nodes)
    // Actually: fixed-fixed single element → ux, uy, θ at both nodes are all fixed → 0 free DOFs
    const result = solveModal(input, new Map([[1, density]]));
    // Should indicate no free DOFs
    if (typeof result === 'string') {
      expect(result).toBeTruthy();
    } else {
      // If it returns modes (which shouldn't happen), that's also fine to check
      expect(result.modes.length).toBe(0);
    }
  });
});
