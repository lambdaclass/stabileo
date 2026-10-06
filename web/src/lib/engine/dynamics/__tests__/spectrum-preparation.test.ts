import { afterEach, expect, it, vi } from 'vitest';
import { spectrumCompatible, clearSpectrumRecordCache } from '../spectrum-compatible';
import { groundSeries } from '../time-history-spec';
afterEach(() => { clearSpectrumRecordCache(); vi.restoreAllMocks(); });
const target = (T: number) => T <= 0.5 ? 0.8 : 0.4 / T;
it('prepared basis matches original arithmetic exactly across seeds and matching passes', () => {
  for (const seed of [1, 7, 99]) for (const iterations of [0, 1, 5]) {
    const o = { target, duration: 2, dt: 0.01, seed, iterations };
    expect(spectrumCompatible(o)).toEqual(spectrumCompatible({ ...o, reference: true }));
  }
});
it('reuses records across preview/analysis and scale edits without exposing cached arrays', () => {
  const g = { source: 'spectrum' as const, scale: 1, spectrum: { seed: 7, duration: 2 } };
  const first = groundSeries(g, 0.01, 200, target)!;
  const sin = vi.spyOn(Math, 'sin');
  const second = groundSeries({ ...g, scale: 2 }, 0.01, 200, target)!;
  expect(second).toEqual(first.map(v => v * 2));
  expect(sin).not.toHaveBeenCalled();
  first[0] = 999;
  expect(groundSeries(g, 0.01, 200, target)![0]).toBe(second[0] / 2);
  const o = { target, duration: 2, dt: 0.01, seed: 7 };
  const r = spectrumCompatible(o); r.accel[0] = 999; r.periods[0] = 999; r.target[0] = 999; r.achieved[0] = 999;
  expect(spectrumCompatible(o)).toEqual(spectrumCompatible({ ...o, reference: true }));
});
it('invalidates on target values, time step, seed, periods, and iterations', () => {
  let scale = 1;
  const o = { target: (T: number) => scale * target(T), duration: 1, dt: 0.02, seed: 1, iterations: 2 };
  const old = spectrumCompatible(o);
  scale = 1.7;
  for (const change of [{}, { dt: 0.01 }, { seed: 2 }, { iterations: 1 }, { periods: [0.1, 0.2, 0.5, 1, 2] }]) {
    const next = { ...o, ...change };
    expect(spectrumCompatible(next)).toEqual(spectrumCompatible({ ...next, reference: true }));
  }
  expect(spectrumCompatible(o).accel).not.toEqual(old.accel);
});
it('evicts old records from the bounded cache', () => {
  const o = { target, duration: 0.1, dt: 0.01, iterations: 0 };
  for (let seed = 1; seed <= 5; seed++) spectrumCompatible({ ...o, seed });
  const sin = vi.spyOn(Math, 'sin');
  spectrumCompatible({ ...o, seed: 5 }); expect(sin).not.toHaveBeenCalled();
  spectrumCompatible({ ...o, seed: 1 }); expect(sin).toHaveBeenCalled();
});
