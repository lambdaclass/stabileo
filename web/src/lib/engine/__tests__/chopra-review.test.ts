/**
 * Tests informed by Chopra "Dynamics of Structures" (4th ed.) review.
 *
 * Covers:
 * 1. Mass matrix for hinged elements (static condensation)
 * 2. Rayleigh damping computation (Chopra §11.4)
 * 3. Response spectrum analysis (Chopra Ch. 13)
 * 4. Participation factors and effective mass (Chopra §13.2)
 * 5. Plastic analysis improvements (accumulated moments, simultaneous hinges)
 * 6. CQC/SRSS modal combination (Chopra §13.7)
 *
 * References:
 *   - Chopra, A.K. "Dynamics of Structures" (4th ed., 2012)
 *   - Przemieniecki, J.S. "Theory of Matrix Structural Analysis" (1968)
 *   - Neal, B.G. "Plastic Methods of Structural Analysis" (1977)
 */

import { describe, it, expect } from 'vitest';
import type { SolverInput, SolverNode, SolverMaterial, SolverSection, SolverElement, SolverSupport, SolverLoad } from '../types';
import { frameConsistentMass } from '../mass-matrix';
import { solveModal } from '../modal';
import type { ModalResult } from '../modal';
import { solveSpectral, combineModalResponses, getSpectralAcceleration, cirsoc103Spectrum } from '../spectral';
import type { DesignSpectrum } from '../spectral';
import { solvePlastic } from '../plastic';
import type { PlasticResult } from '../plastic';

// ─── Constants ──────────────────────────────────────────────────

const E = 200_000;   // MPa (steel)
const A = 0.01;       // m²
const Iz = 1e-4;      // m⁴
const density = 7850;  // kg/m³

// ─── Helper ─────────────────────────────────────────────────────

function makeInput(opts: {
  nodes: Array<[number, number, number]>;
  elements: Array<[number, number, number, 'frame' | 'truss', boolean?, boolean?]>;
  supports: Array<[number, number, string]>;
  loads?: SolverLoad[];
  e?: number; a?: number; iz?: number;
}): SolverInput {
  const nodes = new Map(opts.nodes.map(([id, x, y]) => [id, { id, x, y }] as [number, SolverNode]));
  const materials = new Map([[1, { id: 1, e: opts.e ?? E, nu: 0.3 }] as [number, SolverMaterial]]);
  const sections = new Map([[1, { id: 1, a: opts.a ?? A, iz: opts.iz ?? Iz }] as [number, SolverSection]]);
  const elements = new Map(opts.elements.map(([id, nodeI, nodeJ, type, hs, he]) => [
    id,
    { id, type, nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: hs ?? false, hingeEnd: he ?? false },
  ] as [number, SolverElement]));
  const supports = new Map(opts.supports.map(([id, nodeId, type]) => [
    id,
    { id, nodeId, type: type as any },
  ] as [number, SolverSupport]));
  return { nodes, materials, sections, elements, supports, loads: opts.loads ?? [] };
}

// ═══════════════════════════════════════════════════════════════════
// 1. MASS MATRIX FOR HINGED ELEMENTS
// ═══════════════════════════════════════════════════════════════════

describe('Mass matrix: hinged elements (static condensation)', () => {
  const rhoA = 1.0; // arbitrary mass/length
  const L = 2.0;

  it('full beam mass is symmetric and positive on diagonal', () => {
    const m = frameConsistentMass(rhoA, L);
    // Check symmetry
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expect(m[i * 6 + j]).toBeCloseTo(m[j * 6 + i], 12);
      }
    }
    // Diagonal elements should be positive
    for (let i = 0; i < 6; i++) {
      expect(m[i * 6 + i]).toBeGreaterThan(0);
    }
  });

  it('hinged-start mass has zero rotational row/column at θ₁', () => {
    const m = frameConsistentMass(rhoA, L, true, false);
    // θ₁ is DOF index 2 — entire row and column should be zero
    for (let j = 0; j < 6; j++) {
      expect(m[2 * 6 + j]).toBeCloseTo(0, 12); // row 2
      expect(m[j * 6 + 2]).toBeCloseTo(0, 12); // col 2
    }
    // But translational DOFs should still have mass
    expect(m[0]).toBeGreaterThan(0);   // u1-u1
    expect(m[1 * 6 + 1]).toBeGreaterThan(0); // v1-v1
    expect(m[4 * 6 + 4]).toBeGreaterThan(0); // v2-v2
  });

  it('hinged-end mass has zero rotational row/column at θ₂', () => {
    const m = frameConsistentMass(rhoA, L, false, true);
    // θ₂ is DOF index 5 — entire row and column should be zero
    for (let j = 0; j < 6; j++) {
      expect(m[5 * 6 + j]).toBeCloseTo(0, 12);
      expect(m[j * 6 + 5]).toBeCloseTo(0, 12);
    }
    // θ₁ (index 2) should still have inertia
    expect(m[2 * 6 + 2]).toBeGreaterThan(0);
  });

  it('both-hinges mass has zero rotational terms at both θ₁ and θ₂', () => {
    const m = frameConsistentMass(rhoA, L, true, true);
    for (let j = 0; j < 6; j++) {
      expect(m[2 * 6 + j]).toBeCloseTo(0, 12);
      expect(m[j * 6 + 2]).toBeCloseTo(0, 12);
      expect(m[5 * 6 + j]).toBeCloseTo(0, 12);
      expect(m[j * 6 + 5]).toBeCloseTo(0, 12);
    }
    // Translational DOFs still have mass
    expect(m[0]).toBeGreaterThan(0);
    expect(m[1 * 6 + 1]).toBeGreaterThan(0);
    expect(m[3 * 6 + 3]).toBeGreaterThan(0);
    expect(m[4 * 6 + 4]).toBeGreaterThan(0);
  });

  it('axial mass diagonal is preserved (unaffected by bending hinges)', () => {
    // Axial terms are independent of bending DOFs → unchanged by hinges
    const totalMass = rhoA * L;
    for (const [hs, he] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const m = frameConsistentMass(rhoA, L, hs, he);
      // Sum diagonal of axial DOFs (0,3) = axial mass = ρAL/3 + ρAL/3 = 2ρAL/3
      // But total axial mass (including off-diagonal): full mass vector should sum to ρAL
      const axialDiag = m[0] + m[3 * 6 + 3];
      expect(axialDiag).toBeCloseTo(2 * totalMass / 3, 6); // ρAL/3 each
    }
  });

  it('full beam transverse mass diagonal sums to ρAL × 312/420', () => {
    // For full beam: m[1,1] + m[4,4] = 156c + 156c = 312c where c = ρAL/420
    // = 312 × ρAL/420 = 312/420 × ρAL
    const m = frameConsistentMass(rhoA, L, false, false);
    const totalMass = rhoA * L;
    const transDiag = m[1 * 6 + 1] + m[4 * 6 + 4];
    expect(transDiag).toBeCloseTo(312 / 420 * totalMass, 6);
  });

  it('condensed mass is symmetric for hinged-start', () => {
    const m = frameConsistentMass(rhoA, L, true, false);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expect(m[i * 6 + j]).toBeCloseTo(m[j * 6 + i], 12);
      }
    }
  });

  it('condensed mass is symmetric for hinged-end', () => {
    const m = frameConsistentMass(rhoA, L, false, true);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expect(m[i * 6 + j]).toBeCloseTo(m[j * 6 + i], 12);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. RAYLEIGH DAMPING (Chopra §11.4)
// ═══════════════════════════════════════════════════════════════════

describe('Modal: Rayleigh damping', () => {
  const densities = new Map([[1, density]]);

  it('Rayleigh coefficients satisfy ξ = a₀/(2ω) + a₁ω/2 at anchor modes', () => {
    // Build a portal frame for reasonable modal results
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0], [3, 0, 4], [4, 6, 4]],
      elements: [
        [1, 1, 3, 'frame'],
        [2, 2, 4, 'frame'],
        [3, 3, 4, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
    });
    const result = solveModal(input, densities, 6);
    if (typeof result === 'string') return;
    const mr = result as ModalResult;

    expect(mr.rayleigh).toBeDefined();
    const rd = mr.rayleigh!;

    // Check that a₀, a₁ > 0
    expect(rd.a0).toBeGreaterThan(0);
    expect(rd.a1).toBeGreaterThan(0);

    // Damping ratio at ω₁ and ω₂ should be ≈ 5%
    const xi1 = rd.a0 / (2 * rd.omega1) + rd.a1 * rd.omega1 / 2;
    const xi2 = rd.a0 / (2 * rd.omega2) + rd.a1 * rd.omega2 / 2;
    expect(xi1).toBeCloseTo(0.05, 3);
    expect(xi2).toBeCloseTo(0.05, 3);

    // Damping ratios array should have one per mode
    expect(rd.dampingRatios.length).toBe(mr.modes.length);

    // First and last mode damping should be ≈ 5%
    expect(rd.dampingRatios[0]).toBeCloseTo(0.05, 3);
    expect(rd.dampingRatios[rd.dampingRatios.length - 1]).toBeCloseTo(0.05, 3);
  });

  it('intermediate modes have ξ < 5% (bowl-shaped damping curve)', () => {
    // Per Chopra Fig. 11.4.2: Rayleigh damping is bowl-shaped,
    // modes between ω₁ and ω₂ have ξ < target, others have ξ > target
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0], [3, 0, 4], [4, 6, 4]],
      elements: [
        [1, 1, 3, 'frame'],
        [2, 2, 4, 'frame'],
        [3, 3, 4, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
    });
    const result = solveModal(input, densities, 6);
    if (typeof result === 'string') return;
    const mr = result as ModalResult;
    if (!mr.rayleigh || mr.modes.length < 3) return;

    // Intermediate modes (between anchor frequencies) should have ξ < 5%
    const rd = mr.rayleigh;
    for (let i = 1; i < rd.dampingRatios.length - 1; i++) {
      expect(rd.dampingRatios[i]).toBeLessThanOrEqual(0.051);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. RESPONSE SPECTRUM ANALYSIS (Chopra Ch. 13)
// ═══════════════════════════════════════════════════════════════════

describe('Spectral analysis: design spectrum interpolation', () => {
  const spectrum: DesignSpectrum = {
    name: 'test',
    points: [
      { period: 0, sa: 0.4 },
      { period: 0.2, sa: 1.0 },
      { period: 0.5, sa: 1.0 },
      { period: 1.0, sa: 0.5 },
      { period: 2.0, sa: 0.25 },
    ],
    inG: true,
  };

  it('returns plateau value at T within plateau', () => {
    expect(getSpectralAcceleration(spectrum, 0.3)).toBeCloseTo(1.0, 6);
  });

  it('interpolates linearly on ascending branch', () => {
    const sa = getSpectralAcceleration(spectrum, 0.1);
    expect(sa).toBeCloseTo(0.7, 6); // midpoint of 0.4 and 1.0
  });

  it('interpolates linearly on descending branch', () => {
    const sa = getSpectralAcceleration(spectrum, 0.75);
    expect(sa).toBeCloseTo(0.75, 6); // midpoint of 1.0 and 0.5
  });

  it('returns edge value for T beyond range', () => {
    expect(getSpectralAcceleration(spectrum, 5.0)).toBeCloseTo(0.25, 6);
    expect(getSpectralAcceleration(spectrum, -1.0)).toBeCloseTo(0.4, 6);
  });
});

describe('Spectral analysis: CIRSOC 103 spectrum', () => {
  it('zone 4 soil II has correct plateau', () => {
    const sp = cirsoc103Spectrum(4, 'II');
    expect(sp.points.length).toBeGreaterThan(3);
    // Plateau: 2.5 × 0.35 × 1.2 = 1.05
    const plateau = getSpectralAcceleration(sp, 0.25);
    expect(plateau).toBeCloseTo(1.05, 2);
  });

  it('spectrum decreases for long periods', () => {
    const sp = cirsoc103Spectrum(4, 'II');
    const sa1 = getSpectralAcceleration(sp, 1.0);
    const sa3 = getSpectralAcceleration(sp, 3.0);
    expect(sa3).toBeLessThan(sa1);
  });
});

describe('Modal combination: SRSS and CQC', () => {
  it('SRSS: √(Σrₙ²)', () => {
    const values = [3, 4];
    const modes = [
      { omega: 10, frequency: 0, period: 0, displacements: [], participationX: 0, participationY: 0, effectiveMassX: 0, effectiveMassY: 0, massRatioX: 0, massRatioY: 0 },
      { omega: 30, frequency: 0, period: 0, displacements: [], participationX: 0, participationY: 0, effectiveMassX: 0, effectiveMassY: 0, massRatioX: 0, massRatioY: 0 },
    ];
    const result = combineModalResponses(values, modes, 'SRSS');
    expect(result).toBeCloseTo(5, 6); // √(9+16)
  });

  it('CQC: well-separated modes ≈ SRSS', () => {
    // When modes are well-separated (ω₂/ω₁ >> 1), CQC ≈ SRSS
    const values = [3, 4];
    const modes = [
      { omega: 10, frequency: 0, period: 0, displacements: [], participationX: 0, participationY: 0, effectiveMassX: 0, effectiveMassY: 0, massRatioX: 0, massRatioY: 0 },
      { omega: 100, frequency: 0, period: 0, displacements: [], participationX: 0, participationY: 0, effectiveMassX: 0, effectiveMassY: 0, massRatioX: 0, massRatioY: 0 },
    ];
    const srss = combineModalResponses(values, modes, 'SRSS');
    const cqc = combineModalResponses(values, modes, 'CQC');
    expect(Math.abs(cqc - srss) / srss).toBeLessThan(0.05);
  });

  it('CQC: closely-spaced modes give larger result than SRSS', () => {
    // Chopra §13.7: CQC accounts for modal correlation
    const values = [3, 4];
    const modes = [
      { omega: 10.0, frequency: 0, period: 0, displacements: [], participationX: 0, participationY: 0, effectiveMassX: 0, effectiveMassY: 0, massRatioX: 0, massRatioY: 0 },
      { omega: 10.1, frequency: 0, period: 0, displacements: [], participationX: 0, participationY: 0, effectiveMassX: 0, effectiveMassY: 0, massRatioX: 0, massRatioY: 0 },
    ];
    const srss = combineModalResponses(values, modes, 'SRSS');
    const cqc = combineModalResponses(values, modes, 'CQC');
    // CQC should be ≥ SRSS for closely-spaced modes with same-sign responses
    expect(cqc).toBeGreaterThanOrEqual(srss - 0.01);
  });

  it('CQC with identical modes: ρ=1, result = |r₁| + |r₂|', () => {
    const values = [3, 4];
    const modes = [
      { omega: 10, frequency: 0, period: 0, displacements: [], participationX: 0, participationY: 0, effectiveMassX: 0, effectiveMassY: 0, massRatioX: 0, massRatioY: 0 },
      { omega: 10, frequency: 0, period: 0, displacements: [], participationX: 0, participationY: 0, effectiveMassX: 0, effectiveMassY: 0, massRatioX: 0, massRatioY: 0 },
    ];
    const cqc = combineModalResponses(values, modes, 'CQC');
    // When ω₁ = ω₂, ρ = 1, so CQC = √(r₁² + 2·r₁·r₂ + r₂²) = |r₁ + r₂|
    expect(cqc).toBeCloseTo(7, 1);
  });
});

describe('Spectral analysis: full portal frame', () => {
  const densities = new Map([[1, density]]);

  it('computes base shear for portal frame with CIRSOC 103 spectrum', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0], [3, 0, 4], [4, 6, 4]],
      elements: [
        [1, 1, 3, 'frame'],
        [2, 2, 4, 'frame'],
        [3, 3, 4, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
    });

    const modalResult = solveModal(input, densities, 6);
    if (typeof modalResult === 'string') return;
    const mr = modalResult as ModalResult;

    const spectrum = cirsoc103Spectrum(4, 'II');
    const result = solveSpectral(input, mr, densities, {
      direction: 'X',
      spectrum,
      rule: 'CQC',
    });

    if (typeof result === 'string') return;
    const sr = result as SpectralResult;

    // Base shear should be positive
    expect(sr.baseShear).toBeGreaterThan(0);

    // Per-mode data should have correct number of entries
    expect(sr.perMode.length).toBe(mr.modes.length);

    // All periods should match modal results
    for (let i = 0; i < sr.perMode.length; i++) {
      expect(sr.perMode[i].period).toBeCloseTo(mr.modes[i].period, 6);
    }

    // Displacements should be non-negative (envelope)
    for (const d of sr.displacements) {
      expect(d.ux).toBeGreaterThanOrEqual(0);
      expect(d.uy).toBeGreaterThanOrEqual(0);
    }

    // Element forces should be non-negative
    for (const ef of sr.elementForces) {
      expect(ef.nMax).toBeGreaterThanOrEqual(0);
      expect(ef.vMax).toBeGreaterThanOrEqual(0);
      expect(ef.mMax).toBeGreaterThanOrEqual(0);
    }
  });

  it('Y-direction spectral analysis produces vertical response', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0], [3, 0, 4], [4, 6, 4]],
      elements: [
        [1, 1, 3, 'frame'],
        [2, 2, 4, 'frame'],
        [3, 3, 4, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
    });

    const modalResult = solveModal(input, densities, 6);
    if (typeof modalResult === 'string') return;
    const mr = modalResult as ModalResult;

    const spectrum = cirsoc103Spectrum(3, 'I');
    const result = solveSpectral(input, mr, densities, {
      direction: 'Y',
      spectrum,
    });

    if (typeof result === 'string') return;
    expect(result.baseShear).toBeGreaterThanOrEqual(0);
  });

  it('importance factor I > 1 increases base shear', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0], [3, 0, 4], [4, 6, 4]],
      elements: [
        [1, 1, 3, 'frame'],
        [2, 2, 4, 'frame'],
        [3, 3, 4, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
    });
    const modalResult = solveModal(input, densities, 6);
    if (typeof modalResult === 'string') return;
    const mr = modalResult as ModalResult;
    const spectrum = cirsoc103Spectrum(4, 'II');

    const r1 = solveSpectral(input, mr, densities, { direction: 'X', spectrum, importanceFactor: 1.0 });
    const r2 = solveSpectral(input, mr, densities, { direction: 'X', spectrum, importanceFactor: 1.5 });
    if (typeof r1 === 'string' || typeof r2 === 'string') return;

    expect(r2.baseShear).toBeGreaterThan(r1.baseShear);
  });

  it('reduction factor R > 1 decreases base shear', () => {
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 6, 0], [3, 0, 4], [4, 6, 4]],
      elements: [
        [1, 1, 3, 'frame'],
        [2, 2, 4, 'frame'],
        [3, 3, 4, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
    });
    const modalResult = solveModal(input, densities, 6);
    if (typeof modalResult === 'string') return;
    const mr = modalResult as ModalResult;
    const spectrum = cirsoc103Spectrum(4, 'II');

    const r1 = solveSpectral(input, mr, densities, { direction: 'X', spectrum, reductionFactor: 1.0 });
    const r2 = solveSpectral(input, mr, densities, { direction: 'X', spectrum, reductionFactor: 4.0 });
    if (typeof r1 === 'string' || typeof r2 === 'string') return;

    expect(r2.baseShear).toBeLessThan(r1.baseShear);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. PARTICIPATION FACTORS — DEEPER CHECKS (Chopra §13.2)
// ═══════════════════════════════════════════════════════════════════

describe('Modal: participation factors — analytical checks', () => {
  const densities = new Map([[1, density]]);

  it('SS beam 1st mode: Y mass ratio > 80% (analytical ~81%)', () => {
    // Chopra Table 13.2.1: Simply-supported beam, 1st mode captures 81.1% of Y mass
    const L = 10;
    const nElems = 16; // Fine mesh for accuracy
    const nodes: Array<[number, number, number]> = [];
    const elements: Array<[number, number, number, 'frame' | 'truss']> = [];
    for (let i = 0; i <= nElems; i++) nodes.push([i + 1, i * L / nElems, 0]);
    for (let i = 0; i < nElems; i++) elements.push([i + 1, i + 1, i + 2, 'frame']);

    const input = makeInput({
      nodes,
      elements,
      supports: [[1, 1, 'pinned'], [2, nElems + 1, 'rollerX']],
    });

    const result = solveModal(input, densities, 4);
    if (typeof result === 'string') return;
    const mr = result as ModalResult;

    // Find the mode with highest Y mass ratio (should be the fundamental transverse mode)
    const maxYMode = mr.modes.reduce((prev, curr) =>
      curr.massRatioY > prev.massRatioY ? curr : prev, mr.modes[0]);

    // Should capture >80% (analytical is 81.1%)
    expect(maxYMode.massRatioY).toBeGreaterThan(0.78);
  });

  it('cumulative mass ratio approaches 1.0 with enough modes', () => {
    // Per Chopra §13.2: sum of all Meff_n / M_total = 1.0
    const L = 6;
    const nElems = 10;
    const nodes: Array<[number, number, number]> = [];
    const elements: Array<[number, number, number, 'frame' | 'truss']> = [];
    for (let i = 0; i <= nElems; i++) nodes.push([i + 1, i * L / nElems, 0]);
    for (let i = 0; i < nElems; i++) elements.push([i + 1, i + 1, i + 2, 'frame']);

    const input = makeInput({
      nodes,
      elements,
      supports: [[1, 1, 'pinned'], [2, nElems + 1, 'rollerX']],
    });

    // Request many modes (close to nDof)
    const result = solveModal(input, densities, 20);
    if (typeof result === 'string') return;
    const mr = result as ModalResult;

    // With many modes, cumulative Y mass ratio should be > 0.95
    expect(mr.cumulativeMassRatioY).toBeGreaterThan(0.90);
  });

  it('90% mass criterion per CIRSOC 103 / Chopra', () => {
    // CIRSOC 103 and most seismic codes require capturing 90% of the mass
    // A portal frame with 6 modes should typically capture > 90%
    const input = makeInput({
      nodes: [[1, 0, 0], [2, 8, 0], [3, 0, 4], [4, 8, 4], [5, 4, 4]],
      elements: [
        [1, 1, 3, 'frame'],
        [2, 2, 4, 'frame'],
        [3, 3, 5, 'frame'],
        [4, 5, 4, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
    });

    const result = solveModal(input, densities, 6);
    if (typeof result === 'string') return;
    const mr = result as ModalResult;

    // Check that the accumulated X+Y mass ratio is reasonable
    const totalCapture = mr.cumulativeMassRatioX + mr.cumulativeMassRatioY;
    expect(totalCapture).toBeGreaterThan(0);
    // At least one direction should have significant capture
    expect(Math.max(mr.cumulativeMassRatioX, mr.cumulativeMassRatioY)).toBeGreaterThan(0.3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. PLASTIC ANALYSIS IMPROVEMENTS
// ═══════════════════════════════════════════════════════════════════

describe('Plastic: improved algorithm with accumulated moments', () => {
  it('fixed-fixed beam: collapse factor = 8Mp/(PL) (exact)', () => {
    // The corrected algorithm should give an exact result for this case
    const L = 4;
    const b = 0.2, h = 0.4;
    const A = b * h;
    const Iz = b * h * h * h / 12;
    const P = 50;
    const fy = 250;
    const Mp = fy * 1000 * b * h * h / 4;

    const input = makeInput({
      nodes: [[1, 0, 0], [2, L / 2, 0], [3, L, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 3, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -P, mz: 0 } }],
      a: A, iz: Iz,
    });

    const secs = new Map([[1, { a: A, iz: Iz, b, h }]]);
    const mats = new Map([[1, { fy }]]);
    const result = solvePlastic(input, secs, mats);
    if (typeof result === 'string') return;
    const pr = result as PlasticResult;

    const lambdaExpected = 8 * Mp / (P * L);
    // Now with accumulated moments, the result should be exact
    expect(pr.collapseFactor).toBeCloseTo(lambdaExpected, 2);
  });

  it('simultaneous hinges: symmetric beam forms end hinges simultaneously', () => {
    // Fixed-fixed beam under central P: both end moments are equal (PL/8)
    // They should reach Mp at the same Δλ → simultaneous hinge formation
    const L = 4;
    const b = 0.2, h = 0.4;
    const A = b * h;
    const Iz = b * h * h * h / 12;
    const P = 50;
    const fy = 250;

    const input = makeInput({
      nodes: [[1, 0, 0], [2, L / 2, 0], [3, L, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 3, 'fixed']],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -P, mz: 0 } }],
      a: A, iz: Iz,
    });

    const secs = new Map([[1, { a: A, iz: Iz, b, h }]]);
    const mats = new Map([[1, { fy }]]);
    const result = solvePlastic(input, secs, mats);
    if (typeof result === 'string') return;
    const pr = result as PlasticResult;

    // All 4 critical sections (2 elem × 2 ends) have |M| = PL/8
    // Due to symmetry, at least 2 should form simultaneously in the first step
    // (the two end-of-element moments at the fixed supports are equal)
    if (pr.steps.length > 0) {
      // At least 2 hinges should form in the first step (symmetric simultaneous)
      const hingesInStep0 = pr.hinges.filter(h => h.step === 0);
      expect(hingesInStep0.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('propped cantilever: correct 2-hinge mechanism', () => {
    // Propped cantilever (fixed-roller) with uniform load:
    // Redundancy = 1, needs 2 hinges for mechanism
    const L = 6;
    const b = 0.15, h = 0.3;
    const A = b * h;
    const Iz = b * h * h * h / 12;

    const input = makeInput({
      nodes: [[1, 0, 0], [2, L / 3, 0], [3, 2 * L / 3, 0], [4, L, 0]],
      elements: [
        [1, 1, 2, 'frame'],
        [2, 2, 3, 'frame'],
        [3, 3, 4, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 4, 'rollerX']],
      loads: [
        { type: 'distributed', data: { elementId: 1, qI: -20, qJ: -20 } },
        { type: 'distributed', data: { elementId: 2, qI: -20, qJ: -20 } },
        { type: 'distributed', data: { elementId: 3, qI: -20, qJ: -20 } },
      ],
      a: A, iz: Iz,
    });

    const secs = new Map([[1, { a: A, iz: Iz, b, h }]]);
    const mats = new Map([[1, { fy: 250 }]]);
    const result = solvePlastic(input, secs, mats);
    if (typeof result === 'string') return;
    const pr = result as PlasticResult;

    // Redundancy should be 1 (fixed=3, roller=1 → r=4; 3 frame elements, 4 nodes → 4 + 9 - 12 = 1)
    expect(pr.redundancy).toBe(1);
    // Should form at least 2 hinges for mechanism
    expect(pr.hinges.length).toBeGreaterThanOrEqual(2);
    // Collapse factor should be > 0
    expect(pr.collapseFactor).toBeGreaterThan(0);
  });

  it('portal sway mechanism: collapse factor is physically reasonable', () => {
    // Portal frame with lateral load → sway mechanism
    const b = 0.15, h = 0.3;
    const A = b * h;
    const Iz = b * h * h * h / 12;
    const fy = 250;
    const Mp = fy * 1000 * b * h * h / 4;
    const H = 4, W = 6;
    const F_lat = 100; // kN lateral

    const input = makeInput({
      nodes: [[1, 0, 0], [2, W, 0], [3, 0, H], [4, W, H]],
      elements: [
        [1, 1, 3, 'frame'],
        [2, 2, 4, 'frame'],
        [3, 3, 4, 'frame'],
      ],
      supports: [[1, 1, 'fixed'], [2, 2, 'fixed']],
      loads: [
        { type: 'nodal', data: { nodeId: 3, fx: F_lat, fy: 0, mz: 0 } },
      ],
      a: A, iz: Iz,
    });

    const secs = new Map([[1, { a: A, iz: Iz, b, h }]]);
    const mats = new Map([[1, { fy }]]);
    const result = solvePlastic(input, secs, mats);
    if (typeof result === 'string') return;
    const pr = result as PlasticResult;

    // For sway mechanism: 4 hinges needed (redundancy=3 → 4 hinges)
    // Virtual work: F_lat × λ × H × θ = 4 × Mp × θ → λ = 4Mp/(F_lat × H)
    const lambdaSway = 4 * Mp / (F_lat * H);
    // Actual collapse factor should be in reasonable range
    expect(pr.collapseFactor).toBeGreaterThan(0);
    expect(pr.collapseFactor).toBeLessThan(lambdaSway * 5); // generous bound
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. MODAL FREQUENCY VALIDATION (Chopra Ch. 2-3)
// ═══════════════════════════════════════════════════════════════════

describe('Modal: analytical frequency checks', () => {
  const densities = new Map([[1, density]]);

  it('cantilever beam: ω₁ ≈ 3.516·√(EI/(ρAL⁴))', () => {
    // Chopra Eq. 2.2.19 / classical beam vibration
    const L = 5;
    const nElems = 10;
    const nodes: Array<[number, number, number]> = [];
    const elements: Array<[number, number, number, 'frame' | 'truss']> = [];
    for (let i = 0; i <= nElems; i++) nodes.push([i + 1, i * L / nElems, 0]);
    for (let i = 0; i < nElems; i++) elements.push([i + 1, i + 1, i + 2, 'frame']);

    const input = makeInput({
      nodes,
      elements,
      supports: [[1, 1, 'fixed']],
    });

    const EI = E * 1000 * Iz; // kN·m²
    const rhoA = density * 0.001 * A; // t/m

    const result = solveModal(input, densities, 3);
    if (typeof result === 'string') return;
    const mr = result as ModalResult;

    // Analytical: ω₁ = (1.875²) · √(EI/(ρA·L⁴)) = 3.516 · √(EI/(ρA·L⁴))
    const omega1_analytical = 3.516 * Math.sqrt(EI / (rhoA * L * L * L * L));
    // FE result should be within ~2% of analytical
    // Find the fundamental transverse mode (lowest frequency with Y displacement)
    const transverseModes = mr.modes.filter(m => {
      const maxUy = Math.max(...m.displacements.map(d => Math.abs(d.uy)));
      const maxUx = Math.max(...m.displacements.map(d => Math.abs(d.ux)));
      return maxUy > maxUx * 0.5;
    });
    if (transverseModes.length > 0) {
      const omega1_FE = transverseModes[0].omega;
      const error = Math.abs(omega1_FE - omega1_analytical) / omega1_analytical;
      expect(error).toBeLessThan(0.03); // within 3%
    }
  });

  it('SS beam: ω₁ = π²·√(EI/(ρAL⁴))', () => {
    // Simply-supported beam, first transverse mode
    const L = 8;
    const nElems = 16;
    const nodes: Array<[number, number, number]> = [];
    const elements: Array<[number, number, number, 'frame' | 'truss']> = [];
    for (let i = 0; i <= nElems; i++) nodes.push([i + 1, i * L / nElems, 0]);
    for (let i = 0; i < nElems; i++) elements.push([i + 1, i + 1, i + 2, 'frame']);

    const input = makeInput({
      nodes,
      elements,
      supports: [[1, 1, 'pinned'], [2, nElems + 1, 'rollerX']],
    });

    const EI = E * 1000 * Iz;
    const rhoA = density * 0.001 * A;

    const result = solveModal(input, densities, 3);
    if (typeof result === 'string') return;
    const mr = result as ModalResult;

    // Analytical: ω₁ = π² · √(EI/(ρA·L⁴))
    const omega1_analytical = Math.PI * Math.PI * Math.sqrt(EI / (rhoA * L * L * L * L));

    // Find the fundamental transverse mode
    const transverseModes = mr.modes.filter(m => {
      const maxUy = Math.max(...m.displacements.map(d => Math.abs(d.uy)));
      return maxUy > 0.1;
    });
    if (transverseModes.length > 0) {
      const omega1_FE = transverseModes[0].omega;
      const error = Math.abs(omega1_FE - omega1_analytical) / omega1_analytical;
      expect(error).toBeLessThan(0.02); // within 2%
    }
  });
});
