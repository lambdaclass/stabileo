/**
 * The localStorage workspace survives one bad tab.
 *
 * The workspace holds every open tab under one key. It used to be read all or nothing: one tab
 * refused by the project gate made `loadWorkspaceFromLocalStorage` return null, App restored
 * nothing, and the next `saveWorkspaceToLocalStorage` (the 30 s timer, or leaving the page)
 * wrote the empty session over the stored one. Every other tab was gone.
 *
 * Now the valid tabs are restored, the refused ones are named in a toast, and the stored text
 * is copied to a backup key before anything can overwrite it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptSessionTabs,
  loadWorkspaceFromLocalStorage,
  saveWorkspaceToLocalStorage,
  readWorkspaceBackups,
  WORKSPACE_BACKUP_KEY,
  WORKSPACE_BACKUP_LIMIT,
  resetWorkspaceGuard,
} from '../store/file';
import { render } from 'svelte/server';
import RecheckNotice from '../../components/RecheckNotice.svelte';
import { recheckStore } from '../store/recheck.svelte';
import { modelStore } from '../store/model.svelte';
import '../store/index';
import { tabManager } from '../store/tabs.svelte';
import { uiStore } from '../store/ui.svelte';

const WORKSPACE_KEY = 'stabileo-workspace';

/** A Storage with an optional quota, in characters, over keys plus values. */
function memoryStorage(quota = Infinity) {
  const map = new Map<string, string>();
  const used = () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      const before = map.get(k);
      map.set(k, String(v));
      if (used() > quota) {
        if (before === undefined) map.delete(k); else map.set(k, before);
        throw new DOMException('quota', 'QuotaExceededError');
      }
    },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

function snapshot(extra: Record<string, unknown> = {}) {
  return {
    name: 'p',
    nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]],
    materials: [[1, { id: 1, name: 'steel', e: 210000, nu: 0.3, rho: 78.5 }]],
    sections: [[1, { id: 1, name: 'S', a: 0.01, iz: 0.001 }]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed' }]],
    loads: [],
    nextId: { node: 3, material: 2, section: 2, element: 2, support: 2, load: 1, loadCase: 1, combination: 1 },
    ...extra,
  };
}

/** An element pointing at node 99, which does not exist: the project gate refuses it. */
const broken = () => snapshot({ elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 99, materialId: 1, sectionId: 1 }]] });

function tab(id: string, name: string, snap: unknown) {
  return { id, name, modelSnapshot: snap, analysisMode: '2d', undoStack: [], redoStack: [] };
}

function storedWorkspace() {
  return JSON.stringify({
    version: '1.0',
    type: 'session',
    timestamp: '2026-10-18T10:00:00.000Z',
    activeTabId: 'b',
    tabs: [tab('a', 'Pórtico A', snapshot()), tab('b', 'Viga rota', broken()), tab('c', 'Pórtico C', snapshot())],
  });
}

/** What App.svelte does on mount and then on its 30 s timer. */
function mountAndAutosave() {
  const saved = loadWorkspaceFromLocalStorage();
  if (saved && saved.tabs.length > 0) tabManager.restoreSession(saved.tabs, saved.activeTabId);
  saveWorkspaceToLocalStorage();
  return saved;
}

let storage: ReturnType<typeof memoryStorage>;
let toast: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => {});
  resetWorkspaceGuard();
});

afterEach(() => {
  toast.mockRestore();
  vi.unstubAllGlobals();
});

describe('workspace with one invalid tab', () => {
  it('keeps the valid tabs through a reload and the next autosave', () => {
    storage.setItem(WORKSPACE_KEY, storedWorkspace());

    const saved = mountAndAutosave();

    expect(saved?.tabs.map((t) => t.name)).toEqual(['Pórtico A', 'Pórtico C']);
    const after = JSON.parse(storage.getItem(WORKSPACE_KEY)!);
    expect(after.tabs.map((t: { name: string }) => t.name)).toEqual(['Pórtico A', 'Pórtico C']);
  });

  it('activates a surviving tab when the active one was refused', () => {
    storage.setItem(WORKSPACE_KEY, storedWorkspace());
    const saved = loadWorkspaceFromLocalStorage();
    expect(saved?.activeTabId).toBe('a');
  });

  it('names the refused tab to the user', () => {
    storage.setItem(WORKSPACE_KEY, storedWorkspace());
    loadWorkspaceFromLocalStorage();
    const messages = toast.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('Viga rota'))).toBe(true);
    expect(toast.mock.calls.find((c) => String(c[0]).includes('Viga rota'))?.[1]).toBe('error');
  });

  it('copies the stored text to the backup key before the first overwrite', () => {
    const raw = storedWorkspace();
    storage.setItem(WORKSPACE_KEY, raw);

    mountAndAutosave();

    const backups = readWorkspaceBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0].raw).toBe(raw);
    expect(backups[0].dropped).toEqual(['Viga rota']);
    expect(Number.isNaN(Date.parse(backups[0].savedAt))).toBe(false);
  });

  it('a workspace that restores whole leaves no backup and shows nothing', () => {
    storage.setItem(WORKSPACE_KEY, JSON.stringify({
      version: '1.0', type: 'session', timestamp: '', activeTabId: 'a',
      tabs: [tab('a', 'Pórtico A', snapshot())],
    }));
    expect(loadWorkspaceFromLocalStorage()?.tabs).toHaveLength(1);
    expect(storage.getItem(WORKSPACE_BACKUP_KEY)).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('an unreadable workspace is backed up too, not replaced unseen', () => {
    storage.setItem(WORKSPACE_KEY, '{"type":"session","tabs":[');
    expect(mountAndAutosave()).toBeNull();
    expect(readWorkspaceBackups()[0].raw).toBe('{"type":"session","tabs":[');
    expect(toast).toHaveBeenCalled();
  });

  it('every tab refused: nothing restored, the backup holds all of it', () => {
    const raw = JSON.stringify({ version: '1.0', type: 'session', timestamp: '', activeTabId: 'x', tabs: [tab('x', 'Rota', broken())] });
    storage.setItem(WORKSPACE_KEY, raw);
    expect(loadWorkspaceFromLocalStorage()).toBeNull();
    expect(readWorkspaceBackups()[0].raw).toBe(raw);
  });
});

describe('workspace backup is bounded', () => {
  it(`keeps at most ${WORKSPACE_BACKUP_LIMIT} copies, newest first, and skips a repeat`, () => {
    for (let i = 0; i < WORKSPACE_BACKUP_LIMIT + 2; i++) {
      storage.setItem(WORKSPACE_KEY, storedWorkspace().replace('Viga rota', `Viga rota ${i}`));
      resetWorkspaceGuard();
      loadWorkspaceFromLocalStorage();
      // The same stored text read twice is one backup, not two.
      resetWorkspaceGuard();
      loadWorkspaceFromLocalStorage();
    }
    const backups = readWorkspaceBackups();
    expect(backups).toHaveLength(WORKSPACE_BACKUP_LIMIT);
    expect(backups[0].dropped).toEqual([`Viga rota ${WORKSPACE_BACKUP_LIMIT + 1}`]);
  });

  it('evicts older copies when the quota is short, and keeps the newest', () => {
    const raw = storedWorkspace();
    // Room for the workspace and one backup of it, not two. A backup holds the text escaped
    // inside JSON, so it is measured that way.
    const oneCopy = JSON.stringify(raw).length + 300;
    storage = memoryStorage(raw.length + oneCopy + Math.floor(oneCopy / 2));
    vi.stubGlobal('localStorage', storage);
    storage.setItem(WORKSPACE_KEY, raw);
    loadWorkspaceFromLocalStorage();
    const second = raw.replace('Viga rota', 'Viga rota 2');
    storage.setItem(WORKSPACE_KEY, second);
    resetWorkspaceGuard();
    loadWorkspaceFromLocalStorage();
    const backups = readWorkspaceBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0].raw).toBe(second);
  });

  it('when no copy fits, the stored workspace is not overwritten in this session, and the user is told', () => {
    const raw = storedWorkspace();
    // The workspace fits; a second copy of it never does.
    storage = memoryStorage(raw.length + Math.floor(JSON.stringify(raw).length / 2));
    vi.stubGlobal('localStorage', storage);
    storage.setItem(WORKSPACE_KEY, raw);

    mountAndAutosave();

    expect(storage.getItem(WORKSPACE_KEY)).toBe(raw);
    expect(readWorkspaceBackups()).toEqual([]);
    expect(saveWorkspaceToLocalStorage()).toBe(false);
    expect(toast.mock.calls.some((c) => c[1] === 'error' && String(c[0]) !== '')).toBe(true);
  });
});

describe('acceptSessionTabs', () => {
  it('reports the refused tabs by name and position', () => {
    const verdict = acceptSessionTabs(JSON.parse(storedWorkspace()).tabs);
    expect(verdict.tabs.map((t) => t.id)).toEqual(['a', 'c']);
    expect(verdict.dropped).toEqual([{ index: 1, name: 'Viga rota' }]);
  });
});

/*
 * The workspace a write could not replace. A small workspace written early (an example, the
 * project before its design) stayed behind when a larger one overflowed the quota, and at the
 * next start it was restored over the newer autosave, which was then never offered.
 */
describe('a workspace write that does not fit', () => {
  it('withdraws the older stored workspace, so the autosave is offered at the next start', () => {
    storage.setItem(WORKSPACE_KEY, storedWorkspace());
    const big = memoryStorage(storage.getItem(WORKSPACE_KEY)!.length + 64);
    big.setItem(WORKSPACE_KEY, storage.getItem(WORKSPACE_KEY)!);
    vi.stubGlobal('localStorage', big);
    tabManager.restoreSession([tab('a', 'Pórtico A', snapshot({ notes: [{ id: 1, text: 'x'.repeat(4000) }] })) as never], 'a');
    expect(saveWorkspaceToLocalStorage()).toBe(false);
    expect(big.getItem(WORKSPACE_KEY)).toBeNull();
    expect(loadWorkspaceFromLocalStorage()).toBeNull();
  });

  it('is written without the undo stacks', () => {
    tabManager.restoreSession([{ ...tab('a', 'Pórtico A', snapshot()), undoStack: [snapshot(), snapshot()] } as never], 'a');
    expect(saveWorkspaceToLocalStorage()).toBe(true);
    const stored = JSON.parse(storage.getItem(WORKSPACE_KEY)!);
    expect(stored.tabs[0].undoStack).toEqual([]);
    expect(stored.tabs[0].redoStack).toEqual([]);
  });
});

it('reopens the notice with every change id when a stale project is restored after reload', async () => {
  const old = snapshot({
    localAxisConvention: 'zUpStrongAxis',
    materials: [[1, { id: 1, name: 'steel', e: 210000, nu: 0.3, rho: 78.5, fy: 235 }]],
  });
  tabManager.restoreSession([{ ...tab('stale', 'Unsaved work', old), analysisMode: 'pro' } as never], 'stale');
  await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
  const ids = recheckStore.assessment!.changes.map(c => c.id);
  expect(ids).toContain('cirsoc301-tension-needs-connection');
  const before = modelStore.snapshot();
  expect(saveWorkspaceToLocalStorage()).toBe(true);

  // Reload starts with a fresh project, then App restores the saved workspace.
  modelStore.clear();
  expect(recheckStore.noticeOpen).toBe(false);
  const saved = loadWorkspaceFromLocalStorage()!;
  tabManager.restoreSession(saved.tabs, saved.activeTabId);

  expect(modelStore.snapshot()).toEqual(before);
  expect(recheckStore.stale).toBe(true);
  expect(recheckStore.noticeOpen).toBe(true);
  await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
  const restoredIds = recheckStore.assessment!.changes.map(c => c.id);
  expect(restoredIds).toEqual(expect.arrayContaining(ids));
  const html = render(RecheckNotice).body;
  expect(html).toContain('data-testid="recheck-notice"');
  for (const id of restoredIds) expect(html).toContain(`data-change-id="${id}"`);
});
