import { getShellCombinationKernel, registerShellCombinationKernel } from '../shell-combination-kernel';
/**
 * FIX2 root cause — shell stresses are dropped by the WASM combination solver;
 * they are recombined in JS from per-case results (linear in displacement).
 * Pins the linear recombination, Von Mises recompute, and governing envelope.
 */
import { describe, it, expect } from 'vitest';
import { combineShellStresses, envelopeShellStresses, enrichComboShellStresses } from '../shell-combos';
import type { AnalysisResults3D, QuadStress } from '../types-3d';

const emptyResult = (quadStresses: QuadStress[]): AnalysisResults3D => ({
  displacements: [], reactions: [], elementForces: [], quadStresses, plateStresses: [],
} as unknown as AnalysisResults3D);

const q = (id: number, sxx: number, syy = 0, txy = 0): QuadStress => ({
  elementId: id, sigmaXx: sxx, sigmaYy: syy, tauXy: txy, mx: sxx, my: 0, mxy: 0, vonMises: Math.abs(sxx),
});

describe('combineShellStresses', () => {
  it('linearly combines membrane stresses + moments by factor', () => {
    const caseQuads = new Map([
      [1, new Map([[7, { sigmaXx: 100, sigmaYy: 0, tauXy: 0, mx: 10, my: 0, mxy: 0 }]])],
      [2, new Map([[7, { sigmaXx: 50, sigmaYy: 0, tauXy: 0, mx: 4, my: 0, mxy: 0 }]])],
    ]);
    const { quadStresses } = combineShellStresses(
      [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }], new Map(), caseQuads, new Map(),
    );
    const s = quadStresses.find(x => x.elementId === 7)!;
    expect(s.sigmaXx).toBeCloseTo(1.2 * 100 + 1.6 * 50, 9); // 200
    expect(s.mx).toBeCloseTo(1.2 * 10 + 1.6 * 4, 9);       // 18.4
    // uniaxial → Von Mises = |σxx|
    expect(s.vonMises).toBeCloseTo(200, 9);
  });

  it('recomputes Von Mises (nonlinear) from combined components, not linearly', () => {
    // case A pure σxx=100, case B pure τxy=100; combo 1·A + 1·B
    const caseQuads = new Map([
      [1, new Map([[1, { sigmaXx: 100, sigmaYy: 0, tauXy: 0, mx: 0, my: 0, mxy: 0 }]])],
      [2, new Map([[1, { sigmaXx: 0, sigmaYy: 0, tauXy: 100, mx: 0, my: 0, mxy: 0 }]])],
    ]);
    const { quadStresses } = combineShellStresses([{ caseId: 1, factor: 1 }, { caseId: 2, factor: 1 }], new Map(), caseQuads, new Map());
    // vM = sqrt(100² + 3·100²) = 200, NOT 100+100=200 by luck? sqrt(10000+30000)=200. Use σxx=100,τxy=50:
    const s = quadStresses[0];
    expect(s.vonMises).toBeCloseTo(Math.sqrt(100 * 100 + 3 * 100 * 100), 6);
  });
});

describe('envelopeShellStresses', () => {
  it('picks the governing (max Von Mises) combo per element', () => {
    const combos = [emptyResult([q(7, 80), q(8, 30)]), emptyResult([q(7, 120), q(8, 10)])];
    const { quadStresses } = envelopeShellStresses(combos);
    expect(quadStresses.find(x => x.elementId === 7)!.vonMises).toBe(120);
    expect(quadStresses.find(x => x.elementId === 8)!.vonMises).toBe(30);
  });
});

describe('enrichComboShellStresses', () => {
  it('fills per-combo + envelope shell stresses from per-case (no-op without shells)', () => {
    const perCase = new Map<number, AnalysisResults3D>([
      [1, emptyResult([q(7, 100)])],
      [2, emptyResult([q(7, 40)])],
    ]);
    const perCombo = new Map<number, AnalysisResults3D>([[10, emptyResult([])]]);
    const envMaxAbs = emptyResult([]);
    enrichComboShellStresses(perCase, perCombo, envMaxAbs, [{ id: 10, factors: [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 1 }] }], new Map());
    expect(perCombo.get(10)!.quadStresses![0].sigmaXx).toBeCloseTo(140, 9);
    expect(envMaxAbs.quadStresses![0].vonMises).toBeCloseTo(140, 9);

    // no shells anywhere → no-op
    const pc = new Map<number, AnalysisResults3D>([[1, emptyResult([])]]);
    const pco = new Map<number, AnalysisResults3D>([[10, emptyResult([])]]);
    enrichComboShellStresses(pc, pco, emptyResult([]), [{ id: 10, factors: [{ caseId: 1, factor: 1 }] }], new Map());
    expect(pco.get(10)!.quadStresses).toEqual([]);
  });
});

describe('a combination means what a case means', () => {
  it('a plate\'s Von Mises is its worse face\'s, as the engine reports it per case', () => {
    const t = 0.2;
    const casePlates = new Map([[1, new Map([[3, { sigmaXx: 100, sigmaYy: 0, tauXy: 0, mx: 2, my: 0, mxy: 0 }]])]]);
    const { plateStresses } = combineShellStresses([{ caseId: 1, factor: 1.5 }], casePlates, new Map(), new Map([[3, { thickness: t }]]));
    const p = plateStresses[0]!;
    // 1.5 × (100 + 6·2/0.04) on the top face: 1.5 × 400.
    expect(p.vonMises).toBeCloseTo(1.5 * (100 + (6 * 2) / (t * t)), 9);
    expect(p.sigma1).toBeCloseTo(p.vonMises, 9);
  });

  it('a quad\'s transverse shear combines with the factors, and only where every case has it', () => {
    const caseQuads = new Map([
      [1, new Map([[7, { sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 0, my: 0, mxy: 0, qx: 10, qy: -2 }]])],
      [2, new Map([[7, { sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 0, my: 0, mxy: 0, qx: 4, qy: 1 }], [8, { sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 0, my: 0, mxy: 0 }]])],
      [3, new Map([[8, { sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 0, my: 0, mxy: 0, qx: 5, qy: 5 }]])],
    ]);
    const { quadStresses } = combineShellStresses([{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }, { caseId: 3, factor: 1 }], new Map(), caseQuads, new Map());
    const q7 = quadStresses.find((x) => x.elementId === 7)!, q8 = quadStresses.find((x) => x.elementId === 8)!;
    expect(q7.qx).toBeCloseTo(1.2 * 10 + 1.6 * 4, 12);
    expect(q7.qy).toBeCloseTo(1.2 * -2 + 1.6 * 1, 12);
    expect(q8.qx).toBeUndefined();
  });
});

it('matches the TS batch for sparse cases, negative/duplicate factors, missing shear and retained combos', () => {
  const kernel = getShellCombinationKernel(); expect(kernel).not.toBeNull();
  const pc = new Map([[1, emptyResult([q(9, 100), q(7, 30)])], [2, emptyResult([q(7, 40), q(8, -20)])]]);
  pc.get(1)!.quadStresses![0] = { ...q(9, 100), qx: 2, qy: 3 };
  pc.get(1)!.plateStresses = [{ elementId: 3, sigmaXx: 10, sigmaYy: 20, tauXy: -3, mx: 2, my: -1, mxy: 0.3, sigma1: 0, sigma2: 0, vonMises: 0 }];
  const combinations = [
    { id: 10, factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: -0.5 }, { caseId: 1, factor: 0.3 }] },
    { id: 20, factors: [{ caseId: 2, factor: 0 }, { caseId: 99, factor: 2 }] },
    { id: 30, factors: [] },
  ];
  const run = () => {
    const results = new Map([[40, emptyResult([q(8, 900)])], [20, emptyResult([])], [10, emptyResult([])], [30, emptyResult([])]]);
    const envelope = emptyResult([]);
    enrichComboShellStresses(pc, results, envelope, combinations, new Map([[3, { thickness: 0.2 }]]));
    return { results, envelope };
  };
  const actual = run();
  registerShellCombinationKernel(null);
  try { expect(actual).toEqual(run()); } finally { registerShellCombinationKernel(kernel); }
});

it('keeps first-wins ties, retained nodal fields, and rejects nonfinite shell inputs', () => {
  const kernel = getShellCombinationKernel()!;
  const retained = { ...q(7, 100), nodalVonMises: [99, 100, 101, 102], qx: 1, qy: 2 };
  const input = {
    cases: [{ id: 1, plateStresses: [], quadStresses: [q(7, 100)] }],
    combinations: [{ id: 10, factors: [{ caseId: 1, factor: 1 }] }],
    thicknesses: [],
    envelopeOrder: [
      { id: 20, plateStresses: [], quadStresses: [retained] },
      { id: 10, plateStresses: [], quadStresses: [] },
    ],
  };
  expect(kernel(input).envelope.quadStresses[0]).toBe(retained);
  for (const field of ['sigmaXx', 'mx', 'qx'] as const) {
    const invalid = structuredClone(input);
    invalid.cases[0].quadStresses[0][field] = NaN;
    expect(() => kernel(invalid)).toThrow();
  }
});

it('does not turn overflowing Von Mises arithmetic into a zero stress', () => {
  expect(() => getShellCombinationKernel()!({
    cases: [{ id: 1, plateStresses: [], quadStresses: [{ ...q(7, 1e200), sigmaYy: 1e200 }] }],
    combinations: [{ id: 10, factors: [{ caseId: 1, factor: 1 }] }], thicknesses: [], envelopeOrder: [],
  })).toThrow();
});
