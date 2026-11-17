import { afterEach, expect, it } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { designContextOptions, designData, patchOwnDesignData, verifyOptions } from '../design-data';
import { defaultDesignData, migrateDesignData, migrateStoredDesignData } from '../../model/design-data';
import { modelFeatures } from '../../provenance/model-features';

const mainCovers = { beam: 0.025, column: 0.025, slab: 0.025, wall: 0.025, footing: 0.025 };

afterEach(() => { modelStore.clear(); uiStore.analysisMode = '2d'; });

it('known wrong result: #2092 reinforcement sheets preserve every unstated main design cover', () => {
  expect(defaultDesignData().covers).toEqual(mainCovers);
  for (const mode of ['2d', '3d', 'pro'] as const) {
  uiStore.analysisMode = mode;
  for (const saved of [undefined, {}, { version: 1 }, { version: 1, covers: { slab: mainCovers.slab } }]) {
    expect(migrateDesignData(saved).covers).toEqual(mainCovers);
    modelStore.setDesignData(migrateStoredDesignData(saved) ?? null);
    for (const edit of [false, true]) {
      if (edit) patchOwnDesignData({ rcSheets: { version: 1, adopted: {} } });
      expect(designData().covers).toEqual(mainCovers);
      expect(designContextOptions().coverFor('beam')).toBe(mainCovers.beam);
      expect(designContextOptions().coverFor('column')).toBe(mainCovers.column);
      expect(verifyOptions()).toMatchObject({ cover: mainCovers.beam, columnCover: mainCovers.column });
      const node = modelStore.addNode(0, 0, 0);
      const footing = modelStore.addFooting(node);
      expect(modelStore.model.footings.get(footing)!.cover).toBe(mainCovers.footing);
    }
    modelStore.clear();
  }
  }
});

it('#2092 reinforcement sheets retain explicitly stated covers and per-member overrides', () => {
  const covers = { beam: 0.035, column: 0.045, slab: 0.02, wall: 0.025, footing: 0.075 };
  modelStore.setDesignData({ version: 1, covers, coverByElement: { '7': 0.04 } });
  patchOwnDesignData({ rcSheets: { version: 1, adopted: {} } });
  expect(designData().covers).toEqual(covers);
  expect(designContextOptions().coverFor('beam', 7)).toBe(0.04);
  expect(designContextOptions().coverFor('beam', 8)).toBe(covers.beam);
  expect(verifyOptions()).toMatchObject({ cover: covers.beam, columnCover: covers.column });
});

it('known wrong result: #2092 sheet metadata preserves generated wind and snow recheck applicability', () => {
  for (const type of ['W', 'Wa', 'S']) {
    const saved = { loadCases: [{ id: 1, type }], loads: [{ type: 'point3d', data: { caseId: 1, generatedBy: 'cirsoc' } }] };
    const features = modelFeatures(saved);
    expect(features.has('generatedLoads')).toBe(true);
    expect(features.has(type === 'S' ? 'snow' : 'wind')).toBe(true);
    expect(features.has('generatedWindLoads')).toBe(type !== 'S');
    expect(modelFeatures({ ...saved, loads: [] }).has('generatedWindLoads')).toBe(false);
  }
});
