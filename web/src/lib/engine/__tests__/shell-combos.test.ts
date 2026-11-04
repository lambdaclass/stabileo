import { getShellCombinationKernel, registerShellCombinationKernel } from '../shell-combination-kernel';
/**
 * FIX2 root cause — shell stresses are dropped by the WASM combination solver;
 * they are recombined in JS from per-case results (linear in displacement).
 * Pins the linear recombination, Von Mises recompute, and governing envelope.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { combineShellStresses, envelopeShellStresses, enrichComboShellStresses } from '../shell-combos';
import { combineShellStressesOracle, enrichComboShellStressesOracle, envelopeShellStressesOracle } from './differential/shell-combos-oracle';
import { EngineUnavailableError } from '../engine-unavailable';
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
  const sets = (...lists: QuadStress[][]) => lists.map((l, i) => ({ source: { kind: 'combination' as const, id: 10 * (i + 1) }, results: emptyResult(l) }));

  it('holds each component\'s own extremes, each with the combination it comes from', () => {
    const { quadStresses } = envelopeShellStresses(sets([q(7, 80), q(8, 30)], [q(7, 120), q(8, -40)]));
    const e7 = quadStresses.find(x => x.elementId === 7)!, e8 = quadStresses.find(x => x.elementId === 8)!;
    expect(e7.vonMises).toBe(120);
    expect(e8.sigmaXx).toBe(-40);
    expect(e8.envelope!.sigmaXx).toEqual({ max: 30, maxSource: { kind: 'combination', id: 10 }, min: -40, minSource: { kind: 'combination', id: 20 } });
  });

  it('every enveloped component bounds each combination\'s value and is reached by the one it names', () => {
    const value = fc.double({ min: -1e3, max: 1e3, noNaN: true });
    const row = fc.record({ id: fc.integer({ min: 1, max: 4 }), s: fc.array(value, { minLength: 6, maxLength: 6 }), q: fc.option(fc.tuple(value, value), { nil: undefined }) });
    fc.assert(fc.property(fc.array(fc.array(row, { maxLength: 6 }), { minLength: 1, maxLength: 5 }), (lists) => {
      const input = lists.map((rows, i) => {
        const byId = new Map(rows.map((r) => [r.id, r]));
        const quads: QuadStress[] = [...byId.values()].map((r) => ({ elementId: r.id, sigmaXx: r.s[0]!, sigmaYy: r.s[1]!, tauXy: r.s[2]!, mx: r.s[3]!, my: r.s[4]!, mxy: r.s[5]!, vonMises: Math.hypot(r.s[0]!, r.s[1]!), ...(r.q ? { qx: r.q[0], qy: r.q[1] } : {}) }));
        return { source: { kind: 'combination' as const, id: i + 1 }, results: emptyResult(quads) };
      });
      const env = envelopeShellStresses(input);
      expect(env).toEqual(envelopeShellStressesOracle(input));
      for (const e of env.quadStresses) {
        for (const [key, x] of Object.entries(e.envelope!)) {
          const values = input.flatMap((set) => {
            const s = set.results.quadStresses!.find((r) => r.elementId === e.elementId);
            if (!s) return [];
            const v = key in s ? (s as unknown as Record<string, number>)[key] : undefined;
            return v === undefined ? [] : [{ id: set.source.id, v }];
          });
          for (const { v } of values) { expect(x!.max).toBeGreaterThanOrEqual(v); expect(x!.min).toBeLessThanOrEqual(v); }
          if (values.length) {
            expect(values.some(({ id, v }) => id === x!.maxSource.id && v === x!.max)).toBe(true);
            expect(values.some(({ id, v }) => id === x!.minSource.id && v === x!.min)).toBe(true);
          }
        }
      }
    }), { numRuns: 300, seed: 11 });
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
  const run = (enrich: typeof enrichComboShellStresses) => {
    const results = new Map([[40, emptyResult([q(8, 900)])], [20, emptyResult([])], [10, emptyResult([])], [30, emptyResult([])]]);
    const envelope = emptyResult([]);
    enrich(pc, results, envelope, combinations, new Map([[3, { thickness: 0.2 }]]));
    return { results, envelope };
  };
  // The kernel against the TypeScript oracle (the app's former silent fallback).
  expect(run(enrichComboShellStresses)).toEqual(run(enrichComboShellStressesOracle));
});

it('without the kernel, a model with shells is refused, not recombined in TypeScript', () => {
  const kernel = getShellCombinationKernel();
  const pc = new Map([[1, emptyResult([q(7, 30)])]]);
  const combos = [{ id: 10, factors: [{ caseId: 1, factor: 1.2 }] }];
  registerShellCombinationKernel(null);
  try {
    expect(() => enrichComboShellStresses(pc, new Map([[10, emptyResult([])]]), undefined, combos, new Map())).toThrow(EngineUnavailableError);
    expect(() => combineShellStresses([{ caseId: 1, factor: 1 }], new Map(), new Map([[1, new Map([[7, q(7, 30)]])]]), new Map())).toThrow(EngineUnavailableError);
    // A frame has nothing to combine and needs no kernel.
    expect(combineShellStresses([{ caseId: 1, factor: 1 }], new Map(), new Map(), new Map())).toEqual({ plateStresses: [], quadStresses: [] });
  } finally { registerShellCombinationKernel(kernel); }
});

it('combineShellStresses through the kernel equals the TypeScript oracle on random batches', () => {
  fc.assert(fc.property(
    fc.array(fc.array(fc.record({ id: fc.integer({ min: 1, max: 12 }), s: fc.array(fc.double({ min: -1e3, max: 1e3, noNaN: true }), { minLength: 6, maxLength: 6 }), q: fc.option(fc.tuple(fc.double({ min: -50, max: 50, noNaN: true }), fc.double({ min: -50, max: 50, noNaN: true })), { nil: undefined }) }), { maxLength: 8 }), { minLength: 1, maxLength: 4 }),
    fc.array(fc.record({ caseId: fc.integer({ min: 0, max: 4 }), factor: fc.double({ min: -2, max: 2, noNaN: true }) }), { maxLength: 6 }),
    fc.boolean(), fc.double({ min: 0.05, max: 0.4, noNaN: true }),
    (cases, factors, withIds, thickness) => {
      const toMap = (rows: Array<{ id: number; s: number[]; q?: [number, number] }>) => {
        const m = new Map<number, { sigmaXx: number; sigmaYy: number; tauXy: number; mx: number; my: number; mxy: number; qx?: number; qy?: number }>();
        for (const r of rows) m.set(r.id, { sigmaXx: r.s[0]!, sigmaYy: r.s[1]!, tauXy: r.s[2]!, mx: r.s[3]!, my: r.s[4]!, mxy: r.s[5]!, ...(r.q ? { qx: r.q[0], qy: r.q[1] } : {}) });
        return m;
      };
      const plates = new Map(cases.map((c, i) => [i, toMap(c.filter((r) => r.id % 2 === 0))]));
      const quads = new Map(cases.map((c, i) => [i, toMap(c.filter((r) => r.id % 2 === 1))]));
      const thick = new Map([...Array(13).keys()].filter((id) => id % 4 === 0).map((id) => [id, { thickness }]));
      const ids = withIds ? {
        plates: new Set([...plates.values()].flatMap((m) => [...m.keys()])),
        quads: new Set([...quads.values()].flatMap((m) => [...m.keys()])),
      } : undefined;
      const e = combineShellStresses(factors, plates, quads, thick, ids);
      const o = combineShellStressesOracle(factors, plates, quads, thick, ids);
      expect(e.plateStresses.map((p) => p.elementId)).toEqual(o.plateStresses.map((p) => p.elementId));
      expect(e.quadStresses.map((p) => p.elementId)).toEqual(o.quadStresses.map((p) => p.elementId));
      for (const [a, b] of [...e.plateStresses.map((p, i) => [p, o.plateStresses[i]!] as const), ...e.quadStresses.map((p, i) => [p, o.quadStresses[i]!] as const)]) {
        for (const k of Object.keys(b) as Array<keyof typeof b>) {
          const x = a[k] as number, y = b[k] as number;
          if (y === undefined) { expect(x).toBeUndefined(); continue; }
          expect(Math.abs(x - y)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(y)));
        }
      }
    },
  ), { numRuns: 500, seed: 7 });
});

it('envelopes a retained combination from its own record, and rejects nonfinite shell inputs', () => {
  const kernel = getShellCombinationKernel()!;
  const retained = { ...q(7, 300), nodalVonMises: [99, 100, 101, 102], qx: 1, qy: 2 };
  const input = {
    cases: [{ id: 1, plateStresses: [], quadStresses: [{ ...q(7, 100), qx: 5, qy: -6 }] }],
    combinations: [{ id: 10, factors: [{ caseId: 1, factor: 1 }] }],
    thicknesses: [],
    envelopeOrder: [
      { id: 20, plateStresses: [], quadStresses: [retained] },
      { id: 10, plateStresses: [], quadStresses: [] },
    ],
  };
  const row = kernel(input).envelope.quads[0]!;
  expect(row.extremes.sigmaXx).toEqual({ max: 300, maxSource: 0, min: 100, minSource: 1 });
  expect(row.extremes.qy).toEqual({ max: 2, maxSource: 0, min: -6, minSource: 1 });
  for (const field of ['sigmaXx', 'mx', 'qx'] as const) {
    const invalid = structuredClone(input);
    invalid.cases[0].quadStresses[0][field] = NaN;
    expect(() => kernel(invalid)).toThrow();
  }
  const badRetained = structuredClone(input);
  badRetained.envelopeOrder[0].quadStresses[0].mx = Infinity;
  expect(() => kernel(badRetained)).toThrow();
});

it('does not turn overflowing Von Mises arithmetic into a zero stress', () => {
  expect(() => getShellCombinationKernel()!({
    cases: [{ id: 1, plateStresses: [], quadStresses: [{ ...q(7, 1e200), sigmaYy: 1e200 }] }],
    combinations: [{ id: 10, factors: [{ caseId: 1, factor: 1 }] }], thicknesses: [], envelopeOrder: [],
  })).toThrow();
});
