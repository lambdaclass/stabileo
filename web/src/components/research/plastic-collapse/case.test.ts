import { describe, expect, it, vi } from 'vitest';
import { compare, cumulativeStep, mechanisms, portal, run, viewer } from './case';
import { strings } from './i18n';
vi.mock('../../../lib/engine/wasm-solver', () => ({ initSolver: vi.fn(), solvePlastic3D: vi.fn() }));
import { initSolver, solvePlastic3D } from '../../../lib/engine/wasm-solver';

describe('portal mechanism benchmark', () => {
  it('derives all three bounds from the shared case', () => {
    expect(mechanisms()).toEqual(portal.reference);
    expect(Math.min(...Object.values(mechanisms()))).toBe(portal.reference.combined);
  });
  it('shows signed differences from all bounds, not three collapse predictions', () => {
    const rows = compare({ collapseFactor: 600 / 7, isMechanism: true, steps: [{ loadFactor: 1, results: { displacements: [] } }] });
    expect(rows[2].difference).toBe(0);
    expect(rows[0].difference).toBeCloseTo(-100 / 7, 10);
    expect(() => compare({ collapseFactor: NaN, isMechanism: false, steps: [] })).toThrow();
  });
  it('uses the production 3D WASM wrapper and propagates refusals', async () => {
    vi.mocked(solvePlastic3D).mockImplementation(() => { throw new Error('refused'); });
    await expect(run()).rejects.toThrow('refused');
    expect(initSolver).toHaveBeenCalled();
    expect(solvePlastic3D).toHaveBeenCalledWith(portal.input);
  });
  it('maps the XZ frame to the shared viewer without losing the split beam', () => {
    const data = viewer();
    expect(data.xy).toEqual([0, 0, 0, 3, 4, 3, 4, 0, 2, 3]);
    expect(data.cells).toHaveLength(8);
    expect(() => viewer({ loadFactor: 1, results: { displacements: [] } })).toThrow('Missing');
  });
  it('accumulates event displacement increments', () => {
    const steps = [1, 2].map(n => ({ loadFactor: n, results: { displacements: [{ nodeId: 1, ux: n, uz: -n }] } }));
    expect(cumulativeStep(steps, 1)?.results.displacements).toEqual([{ nodeId: 1, ux: 3, uz: -3 }]);
    expect(cumulativeStep([], 0)).toBeUndefined();
  });
  it('has complete research translations', () => {
    for (const locale of Object.values(strings)) {
      expect(Object.keys(locale).sort()).toEqual(Object.keys(strings.en).sort());
      expect(locale.limits).toHaveLength(strings.en.limits.length);
      expect(Object.values(locale).every(Boolean)).toBe(true);
    }
  });
});
