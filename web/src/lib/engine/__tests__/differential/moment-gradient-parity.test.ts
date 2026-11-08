import { describe, it, expect } from 'vitest';
import * as oracle from './moment-gradient-oracle';
import { momentGradient, registerCirsoc301InputsKernel, type MomentGradientInput, type StationMoment } from '../../steel/moment-gradient';
import { EngineUnavailableError } from '../../engine-unavailable';
import * as wasm from '../../../wasm/dedaliano_engine.js';

const SHAPES = ['I', 'H', 'RHS', 'CHS', 'rect', 'U', 'C', 'T', 'Z', 'L', 'invL', 'generic', '', undefined];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIAGRAMS: Array<(t: number) => number> = [
  () => 100,
  (t) => 4 * 100 * t * (1 - t),
  (t) => 100 * (1 - t),
  (t) => 100 * (1 - 2 * t),
  (t) => 100 * (t <= 0.5 ? 2 * t : 2 * (1 - t)),
  (t) => 6 * t - 6 * t * t - 1,
  (t) => -37.25 * Math.sin(Math.PI * t),
  (t) => 12.5 * Math.cos(7 * t),
  (t) => (t < 1 ? 0 : 1),
  () => 0,
  () => -0,
  (t) => 1e-300 * (1 - t),
  (t) => 3.7e5 * t * t * t - 2.1e5 * t,
];

const grid = (n: number, f: (t: number) => number): StationMoment[] =>
  Array.from({ length: n }, (_, i) => { const t = n === 1 ? 0 : i / (n - 1); return { t, m: f(t) }; });

function cases(): MomentGradientInput[] {
  const out: MomentGradientInput[] = [];
  const segments: Array<[number | undefined, number | undefined]> = [[undefined, undefined], [0, 1], [0.5, 1], [0, 0.5], [0.2, 0.7], [0.3, 0.3 + 1e-10]];
  for (const shape of SHAPES) {
    for (const f of DIAGRAMS) {
      for (const n of [0, 1, 2, 3, 4, 5, 9, 11, 17, 41]) {
        for (const [tStart, tEnd] of segments) {
          for (const cantileverFreeEnd of [undefined, false, true]) {
            out.push({ stations: grid(n, f), tStart, tEnd, shape, cantileverFreeEnd });
          }
        }
      }
    }
  }
  const r = rng(391);
  for (let k = 0; k < 6000; k++) {
    const n = Math.floor(r() * 40);
    const scale = 10 ** (r() * 8 - 3);
    const ts = Array.from({ length: n }, () => (r() < 0.1 ? Math.round(r() * 4) / 4 : r()));
    if (r() < 0.5) { ts.push(0, 1); }
    if (r() < 0.2 && ts.length > 0) ts.push(ts[0]!);
    const stations = ts.map((t) => ({ t, m: (r() < 0.05 ? 0 : (r() * 2 - 1) * scale) }));
    const w = r();
    const s0 = r() * (1 - w);
    out.push({
      stations,
      ...(r() < 0.5 ? { tStart: s0, tEnd: s0 + w } : {}),
      shape: SHAPES[Math.floor(r() * SHAPES.length)],
      ...(r() < 0.1 ? { cantileverFreeEnd: true } : {}),
    });
  }
  return out;
}

describe('Cb: the engine against the TypeScript it replaced', () => {
  it('is bit-identical on every field over the input grid', () => {
    const all = cases();
    const mismatches: string[] = [];
    const bases = new Map<string, number>();
    for (const input of all) {
      const ts = oracle.momentGradient(input);
      const rs = momentGradient(input);
      bases.set(rs.basis, (bases.get(rs.basis) ?? 0) + 1);
      for (const k of ['cb', 'mMax', 'mA', 'mB', 'mC'] as const) {
        if (!Object.is(ts[k] === 0 ? 0 : ts[k], rs[k] === 0 ? 0 : rs[k])) mismatches.push(`${k}: ${ts[k]} vs ${rs[k]} for ${JSON.stringify(input)}`);
      }
      for (const k of ['basis', 'reasonKey', 'curvature'] as const) {
        if (ts[k] !== rs[k]) mismatches.push(`${k}: ${ts[k]} vs ${rs[k]} for ${JSON.stringify(input)}`);
      }
      if (oracle.shapeSymmetry(input.shape) !== rs.symmetry) mismatches.push(`symmetry of ${input.shape}`);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(all.length).toBeGreaterThan(30_000);
    for (const b of ['computed', 'unityRequiredCantilever', 'unityNoDiagram', 'unityOutOfScope']) expect(bases.get(b) ?? 0, b).toBeGreaterThan(500);
  });

  it('refuses what the TypeScript turned into a NaN Cb', () => {
    const stations = grid(9, (t) => 100 * (1 - t));
    stations[4] = { t: 0.5, m: Number.NaN };
    expect(Number.isNaN(oracle.momentGradient({ stations, shape: 'I' }).cb)).toBe(true);
    expect(() => momentGradient({ stations, shape: 'I' })).toThrow();
  });

  it('says the engine is not available rather than computing Cb itself', () => {
    registerCirsoc301InputsKernel(null);
    try {
      expect(() => momentGradient({ stations: grid(9, () => 1), shape: 'I' })).toThrow(EngineUnavailableError);
    } finally {
      registerCirsoc301InputsKernel(wasm.cirsoc301_inputs);
    }
    expect(momentGradient({ stations: grid(9, () => 1), shape: 'I' }).cb).toBe(1);
  });
});
