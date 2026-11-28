import { expect, it } from 'vitest';
import { modelStore, uiStore } from '..';
import { acceptAutosavePayload, acceptSessionTabs, buildProjectFile, deserializeProject, loadFile, loadProject } from '../file';

it.each(['2d', '3d'] as const)('a compact refusal table cannot masquerade as plain project evidence in %s', async mode => {
  modelStore.clear();
  uiStore.analysisMode = mode;
  modelStore.addNode(0, 0);
  const plain = buildProjectFile();
  const snapshot = { ...plain.snapshot, detailing: { ...plain.snapshot.detailing, designRefusals: {
    fingerprint: '0000000000000000', records: [{ outcome: 'UNSUPPORTED' }], members: [[1, 0]],
  } } };
  const source = { ...plain, snapshot };
  const text = JSON.stringify(source);
  const file = new File([text], 'evidence.ded');
  modelStore.addNode(1, 1);
  const before = modelStore.snapshot();
  expect.soft(deserializeProject(text)).toBe(false);
  await expect.soft(loadProject(file)).rejects.toThrow();
  await expect.soft(loadFile(file)).rejects.toThrow();
  expect.soft(acceptAutosavePayload(source)).toBeNull();
  const tab = { id: 't', name: 'test', analysisMode: mode, modelSnapshot: plain.snapshot, undoStack: [], redoStack: [] };
  expect.soft(acceptSessionTabs([{ ...tab, modelSnapshot: snapshot }]).dropped).toHaveLength(1);
  for (const key of ['undoStack', 'redoStack']) {
    const verdict = acceptSessionTabs([{ ...tab, [key]: [snapshot] }]);
    expect.soft(verdict.tabs).toHaveLength(1);
    expect.soft(verdict.discardedHistory).toHaveLength(1);
  }
  expect(modelStore.snapshot()).toEqual(before);
  expect(deserializeProject(JSON.stringify(plain))).toBe(true);
  expect(acceptAutosavePayload(plain)).not.toBeNull();
  expect(acceptSessionTabs([tab]).tabs).toHaveLength(1);
});
