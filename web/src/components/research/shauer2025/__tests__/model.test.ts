import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, LIMITS, MESHES, REFERENCE_KEY, configOf, inRange, reference, refPeak } from '../model';

describe('Shauer model', () => {
  it('the default parameters are exactly the reference run, key order included', () => {
    expect(JSON.stringify(configOf(DEFAULT_PARAMS))).toBe(REFERENCE_KEY);
    expect(JSON.parse(REFERENCE_KEY)).toEqual({
      material: { e: 210, nu: 0.3, gc: 0.0027, l0: 0.0075, plane: 'strain' },
      mesh: { nx: 70, ny: 80, nx_fine: 32, ny_fine: 16, h_fine: 0.00125 },
      top_displacement: 0.01,
      controls: { dt: 0.01, total_time: 0.8, max_iterations: 1000, tolerance: 1e-5, irreversibility: 'none' },
    });
  });

  it('any changed parameter leaves the reference run', () => {
    for (const change of [{ e: 200 }, { nu: 0.25 }, { gc: 0.003 }, { l0: 0.015 }, { u: 0.012 }, { dt: 0.02 }, { meshKey: 'coarse' as const }, { history: true }]) {
      expect(JSON.stringify(configOf({ ...DEFAULT_PARAMS, ...change })), JSON.stringify(change)).not.toBe(REFERENCE_KEY);
    }
    const history = configOf({ ...DEFAULT_PARAMS, history: true, meshKey: 'medium' });
    expect(history.controls.irreversibility).toBe('history');
    expect(history.mesh).toEqual(MESHES.medium.mesh);
    expect(history.mesh).not.toBe(MESHES.medium.mesh);
  });

  it('the defaults sit inside every limit and the limits are closed intervals', () => {
    for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
      expect(inRange(DEFAULT_PARAMS[key], LIMITS[key]), key).toBe(true);
      expect(inRange(LIMITS[key][0], LIMITS[key])).toBe(true);
      expect(inRange(LIMITS[key][1], LIMITS[key])).toBe(true);
    }
    expect(inRange(Number.NaN, LIMITS.e)).toBe(false);
    expect(inRange(401, LIMITS.e)).toBe(false);
  });

  it('reads the reference code steps from its CSV columns', () => {
    expect(reference.length).toBeGreaterThan(70);
    expect(reference[0].step).toBe(0);
    for (const r of reference) {
      expect(Number.isFinite(r.pseudotime) && Number.isFinite(r.reaction) && Number.isInteger(r.iterations)).toBe(true);
      expect(r.damageMax).toBeGreaterThanOrEqual(0);
    }
    expect(refPeak.reaction).toBe(Math.max(...reference.map((r) => r.reaction)));
  });
});
