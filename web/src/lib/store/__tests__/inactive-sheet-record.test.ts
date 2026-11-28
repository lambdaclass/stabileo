import { expect, it } from 'vitest';
import { modelStore } from '..';
import { applyTemplate, templateFromProject } from '../office-templates';
import { designData, patchDesignData } from '../design-data';
import { acceptAutosavePayload, acceptSessionTabs, buildProjectFile, deserializeProject, loadFile, loadProject, serializeProject } from '../file';

const openers = ['project', 'loadProject', 'loadFile', 'autosave', 'tab', 'office template'] as const;

async function openDesignData(opener: (typeof openers)[number], inputs: Record<string, unknown>) {
  modelStore.clear();
  modelStore.addNode(0, 0);
  const file = buildProjectFile();
  const project = { ...file, snapshot: { ...file.snapshot, designData: { version: 1 as const, ...inputs } } };
  const text = JSON.stringify(project);
  if (opener === 'project') expect(deserializeProject(text)).toBe(true);
  else if (opener === 'loadProject' || opener === 'loadFile') await (opener === 'loadProject' ? loadProject : loadFile)(new File([text], 'sheets.ded'));
  else if (opener === 'autosave') {
    const accepted = acceptAutosavePayload(project);
    expect(accepted).not.toBeNull();
    modelStore.restore(accepted!.snapshot);
  } else if (opener === 'office template') {
    applyTemplate({ ...templateFromProject('Sheet archive'), designData: project.snapshot.designData });
  } else {
    const accepted = acceptSessionTabs([{ id: 't', name: 'archive', analysisMode: 'pro', modelSnapshot: project.snapshot, undoStack: [], redoStack: [] }]);
    expect(accepted.dropped).toEqual([]);
    modelStore.restore(accepted.tabs[0]!.modelSnapshot);
  }
}

it.each(openers)('known wrong result: #1928 an inactive sheet record survives %s and an unrelated design edit', async opener => {
  const sheets = __PUBLIC_FEATURES__.proRcSheets;
  const sheet = { version: 1, adopted: {}, foundationSystem: null, schedule: { scope: 'level', markPrefix: 'C' }, columnSchedule: { revision: 'R2' } };
  await openDesignData(opener, { rcSheets: sheet });
  patchDesignData({ rebarGrade: 'changed grade' });
  const normalized = { version: 1, adopted: {}, foundationSystem: null, schedule: { scope: 'level' } };
  expect(designData().rcSheets).toEqual(sheets ? normalized : undefined);
  const saved = JSON.parse(serializeProject()).snapshot.designData;
  expect(saved.rcSheets).toEqual(sheets ? normalized : sheet);
  expect(saved.rebarGrade).toBe('changed grade');
});

it.each(openers)('known wrong result: #1928 inactive sheet assumptions survive %s without being interpreted', async opener => {
  const pile = { length: 9, soilReference: 'BH-2' };
  const inputs = { presumedPile: pile, foundingElevation: -2, presumedBearingKPa: 200, minTieSpacingMm: 110, maxAggregateMm: 20 };
  await openDesignData(opener, inputs);
  patchDesignData({ rebarGrade: 'reviewed grade' });
  const live = designData();
  const saved = JSON.parse(serializeProject()).snapshot.designData;
  if (__PUBLIC_FEATURES__.proRcSheets) {
    expect(live.presumedPile).toMatchObject({ length: pile.length });
    expect(live.presumedPile).not.toHaveProperty('soilReference');
    for (const [key, value] of Object.entries(inputs).filter(([key]) => key !== 'presumedPile')) expect(live).toHaveProperty(key, value);
    expect(saved.presumedPile).toEqual(live.presumedPile);
  } else {
    for (const key of Object.keys(inputs)) expect.soft(live).not.toHaveProperty(key);
    expect(saved).toMatchObject(inputs);
    expect(saved.presumedPile).toEqual(pile);
  }
  expect(saved.rebarGrade).toBe('reviewed grade');
});

it('applies the sheet limits only to the active read model and keeps unstated defaults out of the file', async () => {
  const { readSheetAssumptions, FOUNDING_RANGE, MIN_TIE_SPACING_RANGE, PRESUMED_BEARING_RANGE } = await import('../../model/sheet-design-assumptions');
  const { AGGREGATE_RANGE } = await import('../../rc-sheets/types');
  const defaults = readSheetAssumptions();
  const ranges = { minTieSpacingMm: MIN_TIE_SPACING_RANGE, maxAggregateMm: AGGREGATE_RANGE, presumedBearingKPa: PRESUMED_BEARING_RANGE, foundingElevation: FOUNDING_RANGE };
  const sheets = __PUBLIC_FEATURES__.proRcSheets;
  for (const [key, range] of Object.entries(ranges)) {
    const fallback = { ...defaults.detailing, ...defaults.foundation, ...defaults.elevation }[key as keyof typeof ranges];
    for (const value of [range.min - 1, range.min, range.max, range.max + 1]) {
      await openDesignData('project', { [key]: value });
      const accepted = value >= range.min && value <= range.max;
      const expected = accepted ? value : fallback;
      expect(designData()[key as keyof typeof ranges]).toBe(sheets ? expected : undefined);
      const saved = JSON.parse(serializeProject()).snapshot.designData;
      expect(saved[key]).toBe(sheets ? expected : value);
    }
  }
  await openDesignData('project', {});
  for (const key of Object.keys(ranges)) expect(JSON.parse(serializeProject()).snapshot.designData).not.toHaveProperty(key);
});

it.each(openers)('known wrong result: #1928 %s preserves the order of reinforcement lists while both consumers are absent', async opener => {
  const savedLists = { wallDiametersMm: [12, 8, 12], slabDiametersMm: [10, 8, 10] };
  await openDesignData(opener, { ...savedLists, wallBarDiaMm: 10 });
  patchDesignData({ rebarGrade: 'reviewed grade' });
  const active = __PUBLIC_FEATURES__.proPlatesUnified || __PUBLIC_FEATURES__.proRcSheets;
  const sorted = { wallDiametersMm: [8, 12], slabDiametersMm: [8, 10] };
  const live = designData();
  for (const key of ['wallDiametersMm', 'slabDiametersMm'] as const) {
    expect.soft(live[key]).toEqual(active ? sorted[key] : undefined);
    expect.soft(JSON.parse(serializeProject()).snapshot.designData[key]).toEqual(active ? sorted[key] : savedLists[key]);
  }
  expect(live.wallBarDiaMm).toBe(__PUBLIC_FEATURES__.proPlatesUnified ? 12 : 10);
});
