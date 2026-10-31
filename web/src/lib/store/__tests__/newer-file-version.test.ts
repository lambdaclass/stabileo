import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import '../index';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import { tabManager } from '../tabs.svelte';
import { setLocale } from '../../i18n';
import { loadFile, loadProject, serializeProject, isNewerFileVersion } from '../file';

const SESSION_V1 = gunzipSync(readFileSync(new URL('../../../../legacy-projects/v0.4.0/session.ded.gz', import.meta.url))).toString('utf8');

function otherProject(version: string): string {
  modelStore.clear();
  modelStore.addNode(0, 0);
  modelStore.addNode(4, 0);
  modelStore.addNode(8, 0);
  modelStore.addElement(1, 2, 'frame');
  modelStore.model.name = 'from the future';
  return JSON.stringify({ ...JSON.parse(serializeProject()), version, analysisMode: '3d' });
}

function openModel(): void {
  modelStore.clear();
  historyStore.clear();
  uiStore.analysisMode = '2d';
  modelStore.addNode(1, 2);
  modelStore.model.name = 'open model';
}

function state() {
  return {
    nodes: [...modelStore.nodes.values()].map((n) => [n.id, n.x, n.y]),
    elements: modelStore.elements.size,
    name: modelStore.model.name,
    mode: uiStore.analysisMode,
    undo: historyStore.undoCount,
    tabs: tabManager.tabs.map((t) => t.id),
    active: tabManager.activeTabId,
  };
}

const NEWER = /newer version of Stabileo \(file format (3\.0|2\.0); this version reads up to (2\.0|1\.0)\)/;

describe('a file from a newer version is refused before anything is changed', () => {
  beforeEach(() => setLocale('en'));

  it('compares format versions numerically', () => {
    expect(isNewerFileVersion('3.0')).toBe(true);
    expect(isNewerFileVersion('2.1')).toBe(true);
    expect(isNewerFileVersion('10.0')).toBe(true);
    expect(isNewerFileVersion('2.0')).toBe(false);
    expect(isNewerFileVersion('1.0')).toBe(false);
    expect(isNewerFileVersion('2.0', '1.0')).toBe(true);
    expect(isNewerFileVersion('beta')).toBe(false);
    expect(isNewerFileVersion(3)).toBe(false);
  });

  for (const [what, open] of [['loadFile', loadFile], ['loadProject', loadProject]] as const) {
    it(`${what}: a project in format 3.0, the open model untouched`, async () => {
      const text = otherProject('3.0');
      openModel();
      const before = state();
      await expect(open(new File([text], 'future.ded'))).rejects.toThrow(NEWER);
      expect(state()).toEqual(before);
    });

    it(`${what}: the same project in format 2.0 opens and replaces the model (the refusal above is the version's)`, async () => {
      const text = otherProject('2.0');
      openModel();
      const before = state();
      await open(new File([text], 'current.ded'));
      expect(state()).not.toEqual(before);
      expect(modelStore.nodes.size).toBe(3);
      expect(modelStore.model.name).toBe('from the future');
    });
  }

  it('loadFile: a session in envelope 2.0, the open tabs untouched', async () => {
    openModel();
    const before = state();
    const text = JSON.stringify({ ...JSON.parse(SESSION_V1), version: '2.0' });
    await expect(loadFile(new File([text], 'session.ded'))).rejects.toThrow(NEWER);
    expect(state()).toEqual(before);
  });

  it('loadFile: the same session in envelope 1.0 restores its tabs (the refusal above is the version\'s)', async () => {
    openModel();
    await expect(loadFile(new File([SESSION_V1], 'session.ded'))).resolves.toEqual({ type: 'session', count: 3 });
    expect(tabManager.tabs).toHaveLength(3);
  });
});
