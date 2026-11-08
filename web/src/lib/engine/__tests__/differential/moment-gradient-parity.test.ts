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

const EDGE = 1e-9;

function interpolated(stations: readonly StationMoment[], t: number): number {
  const s = [...stations].sort((a, b) => a.t - b.t);
  if (t <= s[0]!.t) return s[0]!.m;
  const last = s[s.length - 1]!;
  if (t >= last.t) return last.m;
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]!, b = s[i]!;
    if (t <= b.t) return b.t - a.t <= 0 ? b.m : a.m + ((t - a.t) / (b.t - a.t)) * (b.m - a.m);
  }
  return last.m;
}

function classify(input: MomentGradientInput): 'same' | 'ends' | 'sparse' {
  const t0 = input.tStart ?? 0, t1 = input.tEnd ?? 1;
  const inside = input.stations.filter((s) => s.t >= t0 - EDGE && s.t <= t1 + EDGE);
  if (input.cantileverFreeEnd || inside.length === 0) return 'same';
  const sorted = [...input.stations].sort((a, b) => a.t - b.t);
  const read = (t: number) => interpolated(sorted, t);
  const ends = [read(t0), read(t1)];
  const sign = (m: number) => (m > 0 ? 1 : m < 0 ? -1 : 0);
  const signs = new Set([...inside.map((s) => s.m), ...ends].map(sign).filter((x) => x !== 0));
  const signsInside = new Set(inside.map((s) => sign(s.m)).filter((x) => x !== 0));
  const max = Math.max(...inside.map((s) => Math.abs(s.m)));
  const moved = signs.size !== signsInside.size || ends.some((m) => Math.abs(m) > max);
  if (!moved) return 'same';
  return inside.length < 3 ? 'sparse' : 'ends';
}

describe('Cb: the engine against the TypeScript it replaced', () => {
  it('is bit-identical wherever the old read saw the whole segment, and reads the segment ends where it did not', () => {
    const all = cases();
    const mismatches: string[] = [];
    const bases = new Map<string, number>();
    const classes = new Map<string, number>();
    const zero = (x: number) => (x === 0 ? 0 : x);
    for (const input of all) {
      const rs = momentGradient(input);
      const kind = classify(input);
      bases.set(rs.basis, (bases.get(rs.basis) ?? 0) + 1);
      classes.set(kind, (classes.get(kind) ?? 0) + 1);
      if (oracle.shapeSymmetry(input.shape) !== rs.symmetry) mismatches.push(`symmetry of ${input.shape}`);
      if (kind === 'sparse') {
        if (rs.cb !== 1) mismatches.push(`sparse: ${rs.cb} for ${JSON.stringify(input)}`);
        continue;
      }
      const t0 = input.tStart ?? 0, t1 = input.tEnd ?? 1;
      const reference = kind === 'same' ? input : {
        ...input,
        stations: [...input.stations, { t: t0, m: interpolated(input.stations, t0) }, { t: t1, m: interpolated(input.stations, t1) }],
      };
      const ts = oracle.momentGradient(reference);
      for (const k of ['cb', 'mMax', 'mA', 'mB', 'mC'] as const) {
        const same = kind === 'same'
          ? Object.is(zero(ts[k]), zero(rs[k]))
          : Math.abs(ts[k] - rs[k]) <= 1e-12 * Math.max(Math.abs(ts.mMax), Math.abs(ts.cb));
        if (!same) mismatches.push(`${kind} ${k}: ${ts[k]} vs ${rs[k]} for ${JSON.stringify(input)}`);
      }
      for (const k of ['basis', 'reasonKey', 'curvature'] as const) {
        if (ts[k] !== rs[k]) mismatches.push(`${kind} ${k}: ${ts[k]} vs ${rs[k]} for ${JSON.stringify(input)}`);
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(all.length).toBeGreaterThan(30_000);
    expect(classes.get('ends') ?? 0).toBeGreaterThan(100);
    for (const b of ['computed', 'unityRequiredCantilever', 'unityNoDiagram', 'unityOutOfScope']) expect(bases.get(b) ?? 0, b).toBeGreaterThan(500);
  });

  it('reads a sign change at an interpolated segment end as double curvature, which the TypeScript missed', () => {
    const stations = [{ t: 0, m: -100 }, { t: 0.25, m: 100 }, { t: 0.5, m: 0 }, { t: 0.75, m: 0 }, { t: 1, m: 0 }];
    const input = { stations, tStart: 0.1, tEnd: 0.9, shape: 'U' };
    expect(oracle.momentGradient(input).basis).toBe('computed');
    expect(oracle.momentGradient(input).cb).toBeGreaterThan(2.5);
    const g = momentGradient(input);
    expect(g.basis).toBe('unityOutOfScope');
    expect(g.cb).toBe(1);
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
