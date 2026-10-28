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

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }));
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
import { serializeProject } from '../../store/file';
import { message } from '@tauri-apps/plugin-dialog';
import { confirmDiscard, openPath, saveActive, saveSessionAs, unsavedTabs } from '../desktop.svelte';

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
