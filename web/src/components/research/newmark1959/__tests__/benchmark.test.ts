import { describe, expect, it } from 'vitest';
import replay from '../../../../../../research/benchmarks/newmark-1959/results/stabileo_results.json';
import { amplitude, benchmark, compute, discretePeriod, exact, period, request, summarize } from '../benchmark';
import { translations } from '../i18n';


describe('Newmark SDOF benchmark', () => {
  it('uses the shared production input and exact response', () => {
    expect(request(0.05)).toMatchObject({ method: 'newmark', beta: 0.25, gamma: 0.5, nSteps: 80 });
    expect(request(0.05).solver).toEqual(benchmark.input.solver);
    expect(exact(0)).toBe(0);
    expect(exact(period / 2)).toBeCloseTo(2 * amplitude, 12);
    expect(() => request(NaN)).toThrow();
  });
  it('measures elongation from production histories and checks the exact discrete solution', () => {
    let previous = 0;
    for (const r of replay.runs) {
      const summary = summarize(r.ratio, r.time, r.u);
      expect(summary.measuredPeriod).toBeCloseTo(r.measuredPeriod, 12);
      expect(summary.maxError).toBeCloseTo(r.maxError, 12);
      expect(Math.abs(summary.measuredPeriod / discretePeriod(r.ratio) - 1)).toBeLessThan(0.005);
      expect(summary.maxError).toBeGreaterThan(previous);
      previous = summary.maxError;
      r.u.forEach((u, i) => expect(Math.abs(u - amplitude * (1 - Math.cos(i * 2 * Math.atan(Math.PI * r.ratio))))).toBeLessThan(1e-10));
    }
    expect(replay.runs[0].maxError).toBeLessThan(0.0005);
  });
  it('rejects missing, nonfinite and nonoscillating histories', () => {
    expect(() => summarize(0.05, [], [])).toThrow();
    expect(() => summarize(0.05, Array(81).fill(0), Array(81).fill(NaN))).toThrow();
    expect(() => summarize(0.05, Array(81).fill(0), Array(81).fill(0))).toThrow();
  });
  it('dispatches to the existing production WASM wrapper', async () => {
    const r = replay.runs[1];
    const live = await compute(r.ratio);
    expect(live.maxError).toBeCloseTo(r.maxError, 10);
    expect(live.measuredPeriod).toBeCloseTo(r.measuredPeriod, 10);
    live.u.forEach((u, i) => expect(Math.abs(u - r.u[i])).toBeLessThan(1e-10));
  });
  it('has complete research translations', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      expect(Object.keys(translations[locale]).sort()).toEqual(Object.keys(translations.en).sort());
      expect(Object.values(translations[locale]).every(v => Array.isArray(v) ? v.length === 3 : v.length > 0)).toBe(true);
    }
  });
});
