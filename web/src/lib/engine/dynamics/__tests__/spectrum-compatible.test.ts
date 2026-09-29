/**
 * A spectrum-compatible accelerogram: its response spectrum follows the INPRES-CIRSOC 103
 * elastic spectrum it was matched to, the same seed gives the same record, and the SDOF
 * spectrum routine reproduces a closed form (a harmonic's steady resonance).
 */
import { describe, it, expect } from 'vitest';
import { responseSpectrum, spectrumCompatible } from '../spectrum-compatible';
import { designSpectrum, isBlocked, spectralOrdinate } from '../../../codes/cirsoc103/spectrum';

describe('response spectrum', () => {
  it('a long harmonic at a period drives that oscillator to 1/(2ξ) times its amplitude', () => {
    const T = 0.5, dt = 0.002, xi = 0.05, A = 1;
    const w = (2 * Math.PI) / T;
    const accel = Array.from({ length: Math.round(40 / dt) }, (_, i) => A * Math.sin(w * i * dt));
    const [sa] = responseSpectrum(accel, dt, [T], xi);
    expect((sa! * 9.80665) / A).toBeCloseTo(1 / (2 * xi), 0);
  });
});

describe('matched to CIRSOC 103', () => {
  const s = designSpectrum({ zone: 3, site: 'SD' as never });
  if (isBlocked(s)) throw new Error('spectrum blocked');
  const target = (T: number) => spectralOrdinate(T, s);

  it.each([1, 7, 11])('follows the target over 0,1–3 s: mean within ±5 %, each ordinate within 0,8–1,25 (seed %i)', (seed) => {
    const r = spectrumCompatible({ target, duration: 20, dt: 0.01, seed });
    const ratios = r.periods.map((T, k) => ({ T, q: r.achieved[k]! / r.target[k]! })).filter((x) => x.T >= 0.1 && x.T <= 3);
    for (const x of ratios) { expect(x.q).toBeGreaterThan(0.8); expect(x.q).toBeLessThan(1.25); }
    const mean = ratios.reduce((a, x) => a + x.q, 0) / ratios.length;
    expect(Math.abs(mean - 1)).toBeLessThan(0.05);
  });

  it('the same seed gives the same record, another seed another', () => {
    const a = spectrumCompatible({ target, duration: 10, dt: 0.02, seed: 3, iterations: 3 }).accel;
    const b = spectrumCompatible({ target, duration: 10, dt: 0.02, seed: 3, iterations: 3 }).accel;
    const c = spectrumCompatible({ target, duration: 10, dt: 0.02, seed: 4, iterations: 3 }).accel;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
