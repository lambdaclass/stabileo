/**
 * Codex's review of #663: restoring a session over open tabs reused their file paths. Save session
 * A, open project B in the same tab, restore A (whose tab has the same id), press Save: A's content
 * went into B's file. Through the real desktop module, with Tauri's APIs replaced by a file system
 * in memory: B must come out untouched, and Save must ask where instead.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
const saveAnswers: (string | null)[] = [];
const saveCalls: unknown[] = [];

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (cmd: string, args?: { path: string; content: string }) => { if (cmd === 'atomic_save' && args) files.set(args.path, args.content); }) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => undefined) }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setTitle: vi.fn(async () => undefined), onCloseRequested: vi.fn(async () => undefined) }),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn(async () => 'Cancel'),
  open: vi.fn(async () => null),
  save: vi.fn(async (opts: unknown) => {
    saveCalls.push(opts);
    return saveAnswers.shift() ?? null;
  }),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async (p: string) => {
    const text = files.get(p);
    if (text === undefined) throw new Error(`no file ${p}`);
    return text;
  }),
  writeTextFile: vi.fn(async (p: string, text: string) => void files.set(p, text)),
}));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => undefined) }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn(async () => undefined) }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn(async () => null) }));

import '../../i18n/full-dictionaries';
import '../../store/index';
import { modelStore } from '../../store/model.svelte';
import { tabManager } from '../../store/tabs.svelte';
import { deserializeProject, saveTextTo, serializeProject } from '../../store/file';
import { uiStore } from '../../store/ui.svelte';
import { invoke } from '@tauri-apps/api/core';
import { message } from '@tauri-apps/plugin-dialog';
import { confirmDiscard, openPath, saveActive, saveActiveAs, saveSessionAs, trackDocuments, unsavedTabs } from '../desktop.svelte';

function nameModel(name: string): void {
  modelStore.clear();
  modelStore.model.name = name;
  modelStore.addNode(0, 0);
  if (name === 'B') modelStore.addNode(5, 0);
}

describe('desktop: a restored session does not save into the files of the tabs it replaced', () => {
  beforeEach(() => {
    files.clear();
    saveAnswers.length = 0;
    saveCalls.length = 0;
    if (tabManager.tabs.length === 0) tabManager.createTab();
  });

  it('save session A, open B in the same tab, restore A, Save: B is untouched and Save asks where', async () => {
    nameModel('A');
    saveAnswers.push('/x/A-session.ded');
    expect(await saveSessionAs()).toBe(true);
    const sessionText = files.get('/x/A-session.ded')!;
    expect(sessionText).toContain('"type": "session"');

    nameModel('B');
    files.set('/x/B.ded', serializeProject());
    const bOnDisk = files.get('/x/B.ded');
    await openPath('/x/B.ded');
    expect(modelStore.model.name).toBe('B');

    await openPath('/x/A-session.ded');
    expect(modelStore.model.name).toBe('A');

    saveCalls.length = 0;
    saveAnswers.push(null); // the user cancels the Save dialog
    expect(await saveActive()).toBe(false);
    expect(saveCalls.length).toBe(1); // it asked where, as for a tab with no file
    expect(files.get('/x/B.ded')).toBe(bOnDisk);
  });

  it('a restored session is clean, and an edit to it is unsaved at once', async () => {
    nameModel('A');
    saveAnswers.push('/x/A-session.ded');
    await saveSessionAs();
    await openPath('/x/A-session.ded');
    expect(unsavedTabs()).toEqual([]);
    modelStore.addNode(9, 9);
    expect(unsavedTabs()).toEqual([tabManager.activeTabId]);
  });

  it('an inactive tab with unsaved changes is asked about (quit, open, update), and Cancel stops it', async () => {
    nameModel('A');
    saveAnswers.push('/x/A-session.ded');
    await saveSessionAs();
    await openPath('/x/A-session.ded');
    const edited = tabManager.activeTabId!;
    modelStore.addNode(7, 7); // unsaved, in this tab
    tabManager.createTab(); // and now another tab is the active one
    expect(tabManager.activeTabId).not.toBe(edited);
    expect(unsavedTabs()).toContain(edited);
    vi.mocked(message).mockClear();
    vi.mocked(message).mockResolvedValueOnce('Cancel');
    expect(await confirmDiscard()).toBe(false);
    expect(message).toHaveBeenCalledTimes(1);
  });
});


describe('desktop persistence regressions', () => {
  it('a save finishing after session replacement cannot reattach the old file path', async () => {
    nameModel('session');
    saveAnswers.push('/x/replacement.ded');
    await saveSessionAs();
    nameModel('unrelated');
    saveAnswers.push('/x/unrelated.ded');
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(invoke).mockImplementationOnce(async (_cmd, args: any) => {
      files.set(args.path, args.content);
      await waiting;
    });
    const saving = saveActiveAs();
    await vi.waitFor(() => expect(files.has('/x/unrelated.ded')).toBe(true));
    await openPath('/x/replacement.ded');
    release();
    await saving;
    saveCalls.length = 0;
    saveAnswers.push(null);
    expect(await saveActive()).toBe(false);
    expect(saveCalls).toHaveLength(1);
    expect(JSON.parse(files.get('/x/unrelated.ded')!).name).toBe('unrelated');
  });

  it('keeps edits made during a write dirty and retains the originating path after switching', async () => {
    nameModel('saved version');
    const original = tabManager.activeTabId!;
    saveAnswers.push('/x/exact-name');
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(invoke).mockImplementationOnce(async (_cmd, args: any) => {
      files.set(args.path, args.content);
      await waiting;
    });
    const saving = saveActiveAs();
    await vi.waitFor(() => expect(files.has('/x/exact-name')).toBe(true));
    modelStore.model.name = 'new edit';
    tabManager.createTab();
    release();
    expect(await saving).toBe(true);
    expect(JSON.parse(files.get('/x/exact-name')!).name).toBe('saved version');
    expect(unsavedTabs()).toContain(original);
    saveCalls.length = 0;
    saveAnswers.push(null);
    expect(await saveActive()).toBe(false);
    expect(saveCalls).toHaveLength(1);
  });

  it.each(['includeSelfWeight', 'selfWeightCaseId', 'analysisMode', 'axisConvention3D'] as const)('tracks changes to %s', async (key) => {
    nameModel('settings');
    saveAnswers.push('/x/settings.ded');
    await saveActiveAs();
    if (key === 'includeSelfWeight') uiStore.includeSelfWeight = !uiStore.includeSelfWeight;
    if (key === 'selfWeightCaseId') uiStore.selfWeightCaseId = modelStore.model.loadCases[0].id;
    if (key === 'analysisMode') uiStore.analysisMode = uiStore.analysisMode === '2d' ? '3d' : '2d';
    if (key === 'axisConvention3D') uiStore.axisConvention3D = uiStore.axisConvention3D === 'rightHand' ? 'leftHand' : 'rightHand';
    expect(unsavedTabs()).toContain(tabManager.activeTabId);
  });

  it('page-level saveTextTo establishes the desktop target and baseline', async () => {
    vi.stubEnv('VITE_DESKTOP', '1');
    nameModel('toolbar');
    saveAnswers.push('/x/toolbar.ded');
    expect(await saveTextTo(serializeProject(), 'toolbar.ded', 'application/json')).toBe('saved');
    expect(unsavedTabs()).not.toContain(tabManager.activeTabId);
    saveCalls.length = 0;
    modelStore.model.name = 'toolbar edited';
    await saveActive();
    expect(saveCalls).toHaveLength(0);
    expect(JSON.parse(files.get('/x/toolbar.ded')!).name).toBe('toolbar edited');
    vi.unstubAllEnvs();
  });

  it.each([
    { combinations: [{ id: 1, factors: null }] },
    { combinations: [{ id: 1, factors: [{ caseId: 1, factor: 'bad' }] }] },
    { nodes: [[1, null]] },
    { provenance: { layerMappings: {} } },
    { groups: {} },
    { manualEdits: {} },
    { exports: {} },
    { exports: [null] },
    { exports: [{ state: 'ready', error: null }] },
    { loads: [{ type: 'distributed', data: null }] },
  ])('rejects hostile project data without changing model or settings: %j', (patch) => {
    nameModel('keep me');
    const before = serializeProject();
    const hostile = JSON.parse(before);
    Object.assign(hostile.snapshot, patch);
    hostile.name = 'hostile';
    expect(deserializeProject(JSON.stringify(hostile))).toBe(false);
    const after = JSON.parse(serializeProject());
    const expected = JSON.parse(before);
    delete after.timestamp;
    delete expected.timestamp;
    expect(after).toEqual(expected);
  });
});


it('a page-created tab has its baseline before the first edit or timer', () => {
  trackDocuments();
  tabManager.createTab();
  expect(unsavedTabs()).not.toContain(tabManager.activeTabId);
  modelStore.addNode(12, 13);
  expect(unsavedTabs()).toContain(tabManager.activeTabId);
});

it('keeps distinct restored tabs clean through activation and tracks their own edits', async () => {
  if (tabManager.tabs.length === 0) tabManager.createTab();
  trackDocuments();
  nameModel('first');
  const first = tabManager.activeTabId!;
  tabManager.createTab();
  nameModel('B');
  const second = tabManager.activeTabId!;
  saveAnswers.push('/x/two-tabs.ded');
  await saveSessionAs();
  await openPath('/x/two-tabs.ded');
  expect(unsavedTabs()).toEqual([]);
  tabManager.switchTab(first);
  expect(unsavedTabs()).toEqual([]);
  modelStore.addNode(20, 20);
  tabManager.switchTab(second);
  expect(unsavedTabs()).toEqual([first]);
});

it('refuses an entire hostile desktop session without replacing tabs', async () => {
  vi.stubEnv('VITE_DESKTOP', '1');
  nameModel('existing');
  saveAnswers.push('/x/good-session.ded');
  await saveSessionAs();
  const session = JSON.parse(files.get('/x/good-session.ded')!);
  session.tabs[0].modelSnapshot.combinations = [{ factors: null }];
  files.set('/x/hostile.ded', JSON.stringify(session));
  const ids = tabManager.tabs.map((tab) => tab.id);
  await openPath('/x/hostile.ded');
  expect(modelStore.model.name).toBe('existing');
  expect(tabManager.tabs.map((tab) => tab.id)).toEqual(ids);
  vi.unstubAllEnvs();
});
