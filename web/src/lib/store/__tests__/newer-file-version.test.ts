import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import '../index';
import { recheckStore } from '../recheck.svelte';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { createPlate, plateEntry } from '../physical-plates';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import { tabManager } from '../tabs.svelte';
import { setLocale } from '../../i18n';
import { deserializeProject, loadFile, loadProject, serializeProject, isNewerFileVersion } from '../file';

const SESSION_FILE = (JSON.parse(readFileSync(new URL('../../../../legacy-projects/v0.4.0/manifest.json', import.meta.url), 'utf8')) as { session: { file: string } }).session.file;
const SESSION_BYTES = readFileSync(new URL(`../../../../legacy-projects/v0.4.0/${SESSION_FILE}`, import.meta.url));
const SESSION_V1 = (SESSION_FILE.endsWith('.gz') ? gunzipSync(SESSION_BYTES) : SESSION_BYTES).toString('utf8');

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

const unified = __PUBLIC_FEATURES__.proPlatesUnified;
const NEWER = unified
  ? /newer version of Stabileo \(file format 3\.0; this version reads up to 2\.1\)/
  : /newer version of Stabileo \(file format 3\.0; this version reads up to 2\.0\)/;

describe('a file from a newer version is refused before anything is changed', () => {
  beforeEach(() => setLocale('en'));

  it('compares format versions numerically', () => {
    expect(isNewerFileVersion('3.0')).toBe(true);
    expect(isNewerFileVersion('2.2')).toBe(true);
    expect(isNewerFileVersion('2.1')).toBe(!unified);
    expect(isNewerFileVersion('10.0')).toBe(true);
    expect(isNewerFileVersion('2.0')).toBe(false);
    expect(isNewerFileVersion('1.0')).toBe(false);
    expect(isNewerFileVersion('2.0', '1.0')).toBe(true);
    expect(isNewerFileVersion('beta')).toBe(false);
    expect(isNewerFileVersion(3)).toBe(false);
  });

  if (!unified) {
    it('refuses compact 2.1 projects at every opener before adopting the model', async () => {
      const file = JSON.parse(otherProject('2.1'));
      file.snapshot.detailing = {
        designRefusals: { fingerprint: '0000000000000000', records: [], members: [] },
      };
      const text = JSON.stringify(file);
      openModel();
      const before = state();
      const message = /newer version of Stabileo \(file format 2\.1; this version reads up to 2\.0\)/;
      expect(deserializeProject(text)).toBe(false);
      await expect(loadProject(new File([text], 'compact.ded'))).rejects.toThrow(message);
      await expect(loadFile(new File([text], 'compact.ded'))).rejects.toThrow(message);
      expect(state()).toEqual(before);
    });
  }

  for (const [what, open] of [['loadFile', loadFile], ['loadProject', loadProject]] as const) {
    for (const version of [3, '3.0-rc1', 'beta', null, { major: 3 }]) {
      it(`${what}: NEGATIVE: a project in format ${JSON.stringify(version)} is refused, the open model untouched`, async () => {
        const text = JSON.stringify({ ...JSON.parse(otherProject('2.0')), version });
        openModel();
        const before = state();
        await expect(open(new File([text], 'unknown.ded'))).rejects.toThrow();
        expect(state()).toEqual(before);
      });
    }

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

  for (const [what, open] of [['loadFile', loadFile], ['loadProject', loadProject]] as const) {
    for (const version of ['1.1', '2.0']) {
      it(`${what}: a session in envelope ${version}, the open tabs untouched`, async () => {
        openModel();
        const before = state();
        const text = JSON.stringify({ ...JSON.parse(SESSION_V1), version });
        await expect(open(new File([text], 'session.ded'))).rejects.toThrow(/newer version of Stabileo \(file format (1\.1|2\.0); this version reads up to 1\.0\)/);
        expect(state()).toEqual(before);
      });
    }
  }

  it('loadFile: the same session in envelope 1.0 restores its tabs (the refusal above is the version\'s)', async () => {
    openModel();
    await expect(loadFile(new File([SESSION_V1], 'session.ded'))).resolves.toEqual({ type: 'session', count: 3 });
    expect(tabManager.tabs).toHaveLength(3);
  });
});

it.each(['deserializeProject', 'loadProject', 'loadFile'] as const)('a wind-release project with a curved opening sees the later geometry notice through %s', async opener => {
  modelStore.clear();
  uiStore.analysisMode = 'pro';
  const nodes = (points: number[][]) => points.map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const outline = nodes([[0, 0], [8, 0], [8, 6], [0, 6]]);
  const opening = nodes([[2, 2], [3, 1.5], [4, 2], [4, 4], [2, 4]]);
  const plate = createPlate({ outline, holes: [opening], materialId: 1, thickness: 0.15 });
  if ('problem' in plate) throw new Error(plate.problem);
  const entry = plateEntry(plate.id)!;
  modelStore.setGroupData(plate.id, { ...entry.group.data, surface: { ...entry.surface, arcMids: [outline.length + 1] } });
  recheckStore.noteSolved('linear');
  const project = JSON.parse(serializeProject());
  const release = RESULT_CHANGES.changes.find(c => c.id === 'wind-two-part-moments')!;
  project.snapshot.solvedWith.resultsVersion = release.resultsVersion;
  const text = JSON.stringify(project);
  openModel();
  recheckStore.reset();
  if (opener === 'deserializeProject') expect(deserializeProject(text)).toBe(true);
  else if (opener === 'loadProject') await loadProject(new File([text], 'curved.ded'));
  else await loadFile(new File([text], 'curved.ded'));
  await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
  expect(recheckStore.assessment?.changes.map(c => c.id)).toContain('plate-curved-opening-edits');
});
