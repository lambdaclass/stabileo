import { describe, it, expect } from 'vitest';
import { sdofProps, freeResponse, harmonic, forcedResponse, dynamicAmplification, phaseLag, resonancePeak, regimeOf, freeConstants } from '../sdof';

const m = 2, k = 800;
const w = Math.sqrt(k / m);

describe('single degree of freedom: properties', () => {
  it('ω, f, T, c_cr and the regime', () => {
    const p = sdofProps(m, k, 0.05);
    expect(p.omega).toBeCloseTo(20, 12);
    expect(p.f).toBeCloseTo(20 / (2 * Math.PI), 12);
    expect(p.T).toBeCloseTo(Math.PI / 10, 12);
    expect(p.cCr).toBeCloseTo(80, 12);
    expect(p.c).toBeCloseTo(4, 12);
    expect(p.omegaD).toBeCloseTo(20 * Math.sqrt(1 - 0.0025), 12);
    expect(p.regime).toBe('underdamped');
    expect(regimeOf(0)).toBe('undamped');
    expect(regimeOf(1)).toBe('critical');
    expect(regimeOf(1.5)).toBe('overdamped');
  });

  it('logarithmic decrement δ = 2πξ/√(1 − ξ²) = ln of the ratio of two peaks one damped period apart', () => {
    const p = sdofProps(m, k, 0.05);
    expect(p.logDec).toBeCloseTo(0.3145527, 6);
    const u = freeResponse(p, 0.01, 0);
    const t = 0.37;
    expect(Math.log(u(t) / u(t + p.TD))).toBeCloseTo(p.logDec, 10);
  });
});

describe('single degree of freedom: free vibration from u0, v0', () => {
  const u0 = 0.02, v0 = 0.3, t = 0.13;

  it('undamped: u0·cos ωt + v0/ω·sin ωt', () => {
    const p = sdofProps(m, k, 0);
    expect(freeResponse(p, u0, v0)(t)).toBeCloseTo(u0 * Math.cos(w * t) + (v0 / w) * Math.sin(w * t), 14);
    expect(freeConstants(p, u0, v0).rho).toBeCloseTo(Math.hypot(u0, v0 / w), 14);
  });

  it('underdamped: e^(−ξωt)·(u0·cos ω_D t + (v0 + ξωu0)/ω_D·sin ω_D t)', () => {
    const xi = 0.1, p = sdofProps(m, k, xi), wd = w * Math.sqrt(1 - xi * xi);
    const hand = Math.exp(-xi * w * t) * (u0 * Math.cos(wd * t) + ((v0 + xi * w * u0) / wd) * Math.sin(wd * t));
    expect(freeResponse(p, u0, v0)(t)).toBeCloseTo(hand, 14);
  });

  it('critical: e^(−ωt)·(u0 + (v0 + ωu0)·t)', () => {
    const p = sdofProps(m, k, 1);
    expect(freeResponse(p, u0, v0)(t)).toBeCloseTo(Math.exp(-w * t) * (u0 + (v0 + w * u0) * t), 14);
  });

  it('overdamped: e^(−ξωt)·(u0·cosh ω*t + (v0 + ξωu0)/ω*·sinh ω*t) and no oscillation', () => {
    const xi = 2, p = sdofProps(m, k, xi), ws = w * Math.sqrt(xi * xi - 1);
    const hand = Math.exp(-xi * w * t) * (u0 * Math.cosh(ws * t) + ((v0 + xi * w * u0) / ws) * Math.sinh(ws * t));
    expect(freeResponse(p, u0, v0)(t)).toBeCloseTo(hand, 14);
    expect(Number.isNaN(p.logDec)).toBe(true);
    expect(p.omegaD).toBe(0);
  });

  it('every regime starts from u0 and satisfies m·ü + c·u̇ + k·u = 0', () => {
    for (const xi of [0, 0.05, 1, 2]) {
      const p = sdofProps(m, k, xi);
      const u = freeResponse(p, u0, v0);
      expect(u(0)).toBeCloseTo(u0, 14);
      const h = 1e-5;
      expect((u(h) - u(-h)) / (2 * h)).toBeCloseTo(v0, 6);
      const ts = 0.21;
      const ud = (u(ts + h) - u(ts - h)) / (2 * h), udd = (u(ts + h) - 2 * u(ts) + u(ts - h)) / (h * h);
      expect(Math.abs(m * udd + p.c * ud + k * u(ts))).toBeLessThan(1e-3);
    }
  });
});

describe('single degree of freedom: harmonic force F0·sin Ωt', () => {
  it('D(β) at β = 0.5, 1, 2 with ξ = 0.05', () => {
    expect(dynamicAmplification(0.5, 0.05)).toBeCloseTo(1 / Math.sqrt(0.75 ** 2 + 0.05 ** 2), 12);
    expect(dynamicAmplification(0.5, 0.05)).toBeCloseTo(1.330376, 5);
    expect(dynamicAmplification(1, 0.05)).toBeCloseTo(10, 12);
    expect(dynamicAmplification(2, 0.05)).toBeCloseTo(0.3325951, 6);
    expect(dynamicAmplification(1, 0)).toBe(Infinity);
  });

  it('phase: 0 below, π/2 at, near π above resonance', () => {
    expect(phaseLag(1, 0.05)).toBeCloseTo(Math.PI / 2, 12);
    expect(phaseLag(0.5, 0.05)).toBeCloseTo(Math.atan2(0.05, 0.75), 12);
    expect(phaseLag(2, 0.05)).toBeCloseTo(Math.PI - Math.atan2(0.2, 3), 12);
  });

  it('steady amplitude X = D·F0/k and the peak of D', () => {
    const p = sdofProps(m, k, 0.05);
    const h = harmonic(p, 10, 0.5 * w);
    expect(h.beta).toBeCloseTo(0.5, 12);
    expect(h.ust).toBeCloseTo(10 / 800, 14);
    expect(h.X).toBeCloseTo((10 / 800) * 1.330376, 6);
    const peak = resonancePeak(0.05)!;
    expect(peak.beta).toBeCloseTo(Math.sqrt(1 - 2 * 0.0025), 12);
    expect(peak.D).toBeCloseTo(1 / (2 * 0.05 * Math.sqrt(1 - 0.0025)), 12);
    expect(resonancePeak(0.8)).toBeNull();
  });

  it('transient + steady starts from u0, v0 and satisfies the equation of motion', () => {
    for (const [xi, beta] of [[0.05, 0.5], [0.05, 1], [0.05, 2], [0, 0.5], [1, 1.3], [2, 0.7]] as const) {
      const p = sdofProps(m, k, xi);
      const F0 = 10, W = beta * w;
      const r = forcedResponse(p, harmonic(p, F0, W), 0.004, -0.1);
      const h = 1e-5;
      expect(r.total(0)).toBeCloseTo(0.004, 12);
      expect((r.total(h) - r.total(-h)) / (2 * h)).toBeCloseTo(-0.1, 6);
      for (const t of [0.05, 0.4, 1.1]) {
        const u = r.total(t), ud = (r.total(t + h) - r.total(t - h)) / (2 * h), udd = (r.total(t + h) - 2 * u + r.total(t - h)) / (h * h);
        expect(Math.abs(m * udd + p.c * ud + k * u - F0 * Math.sin(W * t))).toBeLessThan(2e-3);
      }
    }
  });

  it('undamped resonance from rest: (F0/2k)·(sin ωt − ωt·cos ωt)', () => {
    const p = sdofProps(m, k, 0);
    const h = harmonic(p, 10, w);
    expect(h.resonant).toBe(true);
    const r = forcedResponse(p, h, 0, 0);
    const t = 0.9;
    expect(r.total(t)).toBeCloseTo((10 / 1600) * (Math.sin(w * t) - w * t * Math.cos(w * t)), 12);
  });
});
