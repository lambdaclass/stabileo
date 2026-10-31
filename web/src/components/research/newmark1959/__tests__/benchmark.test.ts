import { describe, expect, it } from 'vitest';
import replay from '../../../../../../research/benchmarks/newmark-1959/results/stabileo_results.json';
import evidence from '../../../../../../research/benchmarks/newmark-1959/VALIDATION.json';
import { amplitude, benchmark, compute, discretePeriod, evaluate, exact, mass, model, omega, period, phaseLagBound, playbackMs, request, steps, stiffness, summarize } from '../benchmark';
import { fill, translations } from '../i18n';


describe('Newmark SDOF benchmark', () => {
  it('uses the shared production input and exact response', () => {
    expect(request(0.05)).toMatchObject({ method: 'newmark', beta: 0.25, gamma: 0.5, nSteps: 80 });
    expect(request(0.05).solver).toEqual(benchmark.input.solver);
    expect(exact(0)).toBe(0);
    expect(exact(period / 2)).toBeCloseTo(2 * amplitude, 12);
    expect(() => request(NaN)).toThrow();
  });
  it('derives k, m and ω from the solver input and matches the case reference', () => {
    expect(model).toEqual({ length: 1, e: 10, area: 0.01, density: 300000, force: 1 });
    expect(stiffness).toBeCloseTo(benchmark.reference.stiffness, 12);
    expect(mass).toBeCloseTo(benchmark.reference.mass, 12);
    expect(omega).toBeCloseTo(benchmark.reference.omega, 12);
    expect(model.force).toBe(benchmark.reference.force);
  });
  it('measures elongation from production histories and checks the exact discrete solution', () => {
    let previous = 0;
    for (const r of replay.runs) {
      const summary = summarize(r.ratio, r.time, r.u);
      expect(summary.measuredPeriod).toBeCloseTo(r.measuredPeriod, 12);
      expect(summary.maxError).toBeCloseTo(r.maxError, 12);
      expect(summary.discreteError).toBeLessThan(1e-10);
      expect(Math.abs(summary.measuredPeriod / discretePeriod(r.ratio) - 1)).toBeLessThan(0.005);
      expect(summary.maxError).toBeGreaterThan(previous);
      expect(summary.maxError).toBeLessThan(phaseLagBound(r.ratio));
      previous = summary.maxError;
      r.u.forEach((u, i) => expect(Math.abs(u - amplitude * (1 - Math.cos(i * 2 * Math.atan(Math.PI * r.ratio))))).toBeLessThan(1e-10));
    }
    expect(replay.runs[0].maxError).toBeLessThan(0.0005);
    expect(phaseLagBound(0.025)).toBeCloseTo(0.01 * 8 * Math.PI * (1 - Math.atan(Math.PI * 0.025) / (Math.PI * 0.025)), 9);
  });
  it('recomputes every evidence check from the replay histories', () => {
    const computed = evaluate(replay.runs.map(r => summarize(r.ratio, r.time, r.u)));
    expect(computed.map(c => c.metric)).toEqual(evidence.checks.map(c => c.metric));
    computed.forEach((c, i) => {
      const e = evidence.checks[i];
      expect(c.passed).toBe(true);
      expect(e.passed).toBe(true);
      expect(c.tolerance).toBeCloseTo(e.tolerance, 15);
      if (c.metric.includes('discrete displacement')) expect(Math.abs(c.observed - e.observed)).toBeLessThan(1e-14);
      else expect(Math.abs(c.observed / e.observed - 1)).toBeLessThan(1e-9);
    });
    expect(computed).toHaveLength(13);
  });
  it('fails a check when a history leaves the discrete solution', () => {
    const r = replay.runs[0];
    const u = [...r.u];
    u[10] += 1e-9;
    expect(evaluate([summarize(r.ratio, r.time, u)]).filter(c => !c.passed).map(c => c.metric)).toEqual(['dt/T=0.025: maximum discrete displacement error (m)']);
  });
  it('rejects missing, nonfinite and nonoscillating histories', () => {
    expect(() => summarize(0.05, [], [])).toThrow();
    expect(() => summarize(0.05, Array(81).fill(0), Array(81).fill(NaN))).toThrow();
    expect(() => summarize(0.05, Array(81).fill(0), Array(81).fill(0))).toThrow();
  });
  it('plays every time step at the same physical speed', () => {
    const durations = benchmark.ratios.map(r => steps(r) * playbackMs(r));
    for (const d of durations) expect(d).toBeCloseTo(durations[0], 6);
    expect(playbackMs(0.2) / playbackMs(0.025)).toBeCloseTo(8, 12);
  });
  it('dispatches to the existing production WASM wrapper', async () => {
    const r = replay.runs[1];
    const live = await compute(r.ratio);
    expect(live.maxError).toBeCloseTo(r.maxError, 10);
    expect(live.measuredPeriod).toBeCloseTo(r.measuredPeriod, 10);
    live.u.forEach((u, i) => expect(Math.abs(u - r.u[i])).toBeLessThan(1e-10));
  });
  it('has complete research translations with every placeholder filled', () => {
    const values = { L: '1', E: '10', A: '0.01', rho: '300000', m: '1', k: '100', F: '1', omega: '10', T: '0.628319', i: '0', n: '80', t: '0', x: '2.5' };
    for (const locale of ['en', 'es', 'pt'] as const) {
      expect(Object.keys(translations[locale]).sort()).toEqual(Object.keys(translations.en).sort());
      expect(Object.values(translations[locale]).every(v => Array.isArray(v) ? v.length === 3 : v.length > 0)).toBe(true);
      for (const v of Object.values(translations[locale]).flat()) expect(fill(v, values)).not.toMatch(/\{\w+\}/);
      expect(fill(translations[locale].description, values)).toMatch(/k = EA\/L = 100 kN\/m/);
    }
  });
});
