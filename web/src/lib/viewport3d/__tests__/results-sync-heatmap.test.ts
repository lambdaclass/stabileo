/**
 * The 3D heat map's two unit mismatches.
 *
 * The legend labelled stresses "MPa" while publishing the raw maximum of
 * `computeSectionStress`, which returns kPa — every value on the bar a
 * thousand times too big. And the same path fed the material's fy (MPa in the
 * model store) straight into that evaluation, which expects kPa — every
 * utilisation a thousand times too small. Both conversions now live at the
 * boundary where the units change, and are pinned here.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore, resultsStore } from '../../store';
import { publishedHeatmapScale, getSectionProps } from '../results-sync';

function loadOneMember() {
  modelStore.replaceModelData(
    new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 1, y: 0, z: 0 }]]) as never,
    new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]]) as never,
    new Map(),
    [],
  );
  modelStore.sections.set(1, { id: 1, name: 'S', a: 0.01, iz: 1e-4, iy: 2e-5, h: 0.2, b: 0.1 } as never);
}

beforeEach(() => {
  loadOneMember();
  resultsStore.diagramType = 'colorMap' as never;
  resultsStore.colorMapKind = 'vonMises';
});

describe('what the legend publishes for a 3D heat map', () => {
  it('converts stresses from the solver\'s kPa to the labelled MPa', () => {
    const s = publishedHeatmapScale('vonMises', 250_000);
    expect(s).toEqual({ max: 250, unit: 'MPa', source: 'colorMap:vonMises' });
    expect(publishedHeatmapScale('sigmaMax', 123_400)?.max).toBeCloseTo(123.4);
    expect(publishedHeatmapScale('tauMax', 80_000)?.max).toBe(80);
  });

  it('publishes forces and moments unconverted', () => {
    expect(publishedHeatmapScale('momentZ', 12)?.max).toBe(12);
    expect(publishedHeatmapScale('momentZ', 12)?.unit).toBe('kN·m');
    expect(publishedHeatmapScale('axial', 50)?.unit).toBe('kN');
  });

  it('publishes utilisation as a bare ratio on the fixed 0–1 scale', () => {
    resultsStore.colorMapKind = 'stressRatio';
    const s = publishedHeatmapScale('stressRatio', 1.0);
    expect(s).toEqual({ max: 1.0, unit: '', source: 'colorMap:stressRatio' });
  });

  it('publishes nothing when nothing is painted', () => {
    expect(publishedHeatmapScale('vonMises', 0)).toBeNull();
  });
});

describe('the yield strength crossing into the section-stress evaluation', () => {
  it('converts fy from the model\'s MPa to the evaluation\'s kPa', () => {
    modelStore.materials.set(1, { id: 1, name: 'S355', e: 210_000, nu: 0.3, rho: 78.5, fy: 355 } as never);
    expect(getSectionProps(1)?.fy).toBe(355_000);
  });

  it('is null — not an assumed steel strength — when the material has no fy', () => {
    modelStore.materials.set(1, { id: 1, name: 'C25', e: 30_000, nu: 0.2, rho: 25 } as never);
    expect(getSectionProps(1)?.fy).toBeNull();
  });

  it('is null when the member\'s material is gone entirely', () => {
    modelStore.materials.delete(1);
    expect(getSectionProps(1)?.fy).toBeNull();
  });
});
