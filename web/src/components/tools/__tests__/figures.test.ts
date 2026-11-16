import { describe, expect, it } from 'vitest';
import { BATCH_IDS, DEFAULT_BATCH } from '../batch';
import { calculateBatch } from '../batch-solve';
import { batchFigures } from '../figures/batch-figures';
import { chartFigure, peakOf } from '../figures/figure';
import { curvesView, structureView } from '../figures/structure';
import { batchModel } from '../batch';

const KEYS: Record<string, string[]> = {
  'continuous-beam': ['structure', 'deflection', 'shear', 'moment'],
  'influence-line': ['structure', 'influence', 'deflection', 'shear', 'moment'],
  'portal-frame': ['structure', 'deflection', 'moment', 'shear', 'axial'],
  'truss-2d': ['structure', 'axial', 'deflection'],
  'beam-natural-frequency': ['structure', 'mode1', 'mode2', 'mode3'],
};

describe('result figures', () => {
  for (const id of BATCH_IDS) it(`draws every ${id} result at once, each with its largest value`, async () => {
    const result = await calculateBatch(id, { ...DEFAULT_BATCH });
    const figures = batchFigures(id, result, key => key, 'm');
    expect(figures.map(f => f.key)).toEqual(KEYS[id]);
    for (const f of figures.slice(1)) {
      expect(f.peak, f.key).toBeDefined();
      expect(Number.isFinite(f.peak!.value) && f.peak!.value > 0, `${f.key} ${f.peak!.value}`).toBe(true);
      expect(f.sketch ?? f.chart, f.key).toBeDefined();
    }
    const moment = figures.find(f => f.key === 'moment');
    if (moment && id === 'continuous-beam') expect(moment.peak!.value).toBeCloseTo(Math.max(result.sagging, -result.hogging), 9);
    if (moment && id === 'portal-frame') expect(moment.peak!.value).toBeCloseTo(result.maxMoment, 9);
    const modes = figures.filter(f => f.key.startsWith('mode'));
    modes.forEach((f, j) => expect(f.peak!.value).toBe(result.modes[j].frequency));
    const axial = figures.find(f => f.key === 'axial');
    if (axial) expect(axial.peak!.value).toBeCloseTo(Math.max(...result.linear.elementForces.map(ef => Math.abs(ef.nStart))), 9);
  });

  it('marks the largest ordinate of a curve and where it is', () => {
    expect(peakOf([[0, 1], [1, -3], [2, 2]])).toEqual([1, -3]);
    const f = chartFigure('moment', 'Moment', 'kN·m', [[0, 0], [3, 45], [6, 0]]);
    expect(f.peak).toEqual({ value: 45, unit: 'kN·m', label: 'max', at: [3, 45] });
    expect(f.chart!.yLabel).toBe('Moment (kN·m)');
  });

  it('draws the supports and loads of a model, and a diagram off its members with the peak on the drawing', () => {
    const model = batchModel('portal-frame', { ...DEFAULT_BATCH });
    const structure = structureView(model);
    expect(structure.geometryOnly).toBe(true);
    expect(new Set(structure.values)).toEqual(new Set([0, 2]));
    const view = curvesView(model, [{ elementId: 2, points: [[0, 0], [3, -12], [6, 0]] }], 'moment', 'kN·m');
    expect(view.peak!.value).toBe(-12);
    const [x0, y0, x1, y1] = view.bounds;
    expect(view.peak!.at[0]).toBeGreaterThan(x0);
    expect(view.peak!.at[0]).toBeLessThan(x1);
    expect(view.peak!.at[1]).toBeGreaterThan(y0);
    expect(view.peak!.at[1]).toBeLessThan(y1);
  });
});
