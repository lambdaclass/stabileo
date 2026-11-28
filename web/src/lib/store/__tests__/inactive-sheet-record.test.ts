import { expect, it } from 'vitest';
import { modelStore } from '..';
import { applyTemplate, templateFromProject } from '../office-templates';
import { designData, patchDesignData } from '../design-data';
import { acceptAutosavePayload, acceptSessionTabs, buildProjectFile, deserializeProject, loadFile, loadProject, serializeProject } from '../file';

it.each(['project', 'loadProject', 'loadFile', 'autosave', 'tab', 'office template'] as const)('known wrong result: #1928 an inactive sheet record survives %s and an unrelated design edit', async opener => {
  modelStore.clear();
  modelStore.addNode(0, 0);
  const sheets = __PUBLIC_FEATURES__.proRcSheets;
  const file = buildProjectFile();
  const sheet = { version: 1, adopted: {}, foundationSystem: null, schedule: { scope: 'level', markPrefix: 'C' }, columnSchedule: { revision: 'R2' } };
  const project = { ...file, snapshot: { ...file.snapshot, designData: { version: 1, rcSheets: sheet } } };
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
  patchDesignData({ rebarGrade: 'changed grade' });
  const normalized = { version: 1, adopted: {}, foundationSystem: null, schedule: { scope: 'level' } };
  expect(designData().rcSheets).toEqual(sheets ? normalized : undefined);
  const saved = JSON.parse(serializeProject()).snapshot.designData;
  expect(saved.rcSheets).toEqual(sheets ? normalized : sheet);
  expect(saved.rebarGrade).toBe('changed grade');
});
