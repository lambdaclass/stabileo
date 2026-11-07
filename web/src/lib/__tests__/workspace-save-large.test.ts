import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { workspaceScene } from '../engine/detailing/__tests__/helpers/workspace-scene';
import {
  loadWorkspaceFromLocalStorage, resetWorkspaceGuard, restoreWorkspaceDetailing,
  saveWorkspaceSettled, saveWorkspaceToLocalStorage, workspaceNeedsDetailing,
} from '../store/file';
import { pruneDetailing, readDetailing, resetWorkspaceDetailingDb, resetWorkspaceDetailingMemory } from '../store/workspace-detailing';
import type { DetailingStore } from '../engine/detailing/assembly';
import { workspaceSaveStatus } from '../store/workspace-save-status.svelte';
import { modelStore } from '../store/model.svelte';
import { detailingStore } from '../store/detailing.svelte';
import { tabManager, type TabState } from '../store/tabs.svelte';
import { uiStore } from '../store/ui.svelte';
import type { ModelSnapshot } from '../store/history.svelte';
import WorkspaceSaveNotice from '../../components/WorkspaceSaveNotice.svelte';
import '../store/index';

const WORKSPACE_KEY = 'stabileo-workspace';

function memoryStorage(failOn: (key: string) => Error | null = () => null) {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const err = failOn(k);
      if (err) throw err;
      map.set(k, String(v));
    },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

const quota = () => new DOMException("Setting the value of 'stabileo-workspace' exceeded the quota.", 'QuotaExceededError');

function smallTab(id: string, name: string): TabState {
  return {
    id, name, analysisMode: '2d', undoStack: [], redoStack: [],
    modelSnapshot: {
      name,
      nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]],
      materials: [[1, { id: 1, name: 'steel', e: 210000, nu: 0.3, rho: 78.5 }]],
      sections: [[1, { id: 1, name: 'S', a: 0.01, iz: 0.001 }]],
      elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
      supports: [[1, { id: 1, nodeId: 1, type: 'fixed' }]],
      loads: [],
      nextId: { node: 3, material: 2, section: 2, element: 2, support: 2, load: 1, loadCase: 1, combination: 1 },
    },
  } as unknown as TabState;
}

function rawWrite(store: string, write: (s: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('stabileo-workspace-detailing');
    open.onsuccess = () => {
      const tx = open.result.transaction(store, 'readwrite');
      write(tx.objectStore(store));
      tx.oncomplete = () => { open.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

const canon = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));

function withoutDemandRevision(d: ModelSnapshot['detailing']) {
  return { ...d, assemblies: (d?.assemblies ?? []).map((a) => ({ ...a, demandRevision: -1 })) };
}

let storage: ReturnType<typeof memoryStorage>;
let toast: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => {});
  resetWorkspaceGuard();
  workspaceSaveStatus.report(true);
});

afterEach(async () => {
  toast.mockRestore();
  vi.unstubAllGlobals();
  await resetWorkspaceDetailingDb();
  await new Promise<void>((resolve) => {
    const rq = indexedDB.deleteDatabase('stabileo-workspace-detailing');
    rq.onsuccess = rq.onerror = rq.onblocked = () => resolve();
  });
});

describe('a workspace save the browser refuses', () => {
  it('shows the persistent notice on a quota error and clears it once a save succeeds', () => {
    let full = true;
    storage = memoryStorage((k) => (full && k === WORKSPACE_KEY ? quota() : null));
    vi.stubGlobal('localStorage', storage);
    tabManager.restoreSession([smallTab('a', 'Pórtico A')], 'a');

    expect(saveWorkspaceToLocalStorage()).toBe(false);
    expect(workspaceSaveStatus.failed).toBe(true);
    expect(storage.getItem(WORKSPACE_KEY)).toBeNull();
    const html = render(WorkspaceSaveNotice).body;
    expect(html).toContain('data-testid="workspace-save-notice"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="workspace-save-session"');

    expect(saveWorkspaceToLocalStorage()).toBe(false);
    expect(workspaceSaveStatus.failed, 'still failing: still shown').toBe(true);

    full = false;
    expect(saveWorkspaceToLocalStorage()).toBe(true);
    expect(workspaceSaveStatus.failed).toBe(false);
    expect(render(WorkspaceSaveNotice).body).not.toContain('workspace-save-notice');
  });

  it('shows the notice for any other write error too', () => {
    storage = memoryStorage((k) => (k === WORKSPACE_KEY ? new Error('SecurityError') : null));
    vi.stubGlobal('localStorage', storage);
    tabManager.restoreSession([smallTab('a', 'Pórtico A')], 'a');
    expect(saveWorkspaceToLocalStorage()).toBe(false);
    expect(workspaceSaveStatus.failed).toBe(true);
  });
});

describe('the designed and detailed 7-storey building', () => {
  let designed: TabState;

  beforeAll(async () => {
    await workspaceScene('pro-edificio-7p');
    tabManager.init();
    tabManager.syncCurrentTab();
    const live = tabManager.tabs.find((tab) => tab.id === tabManager.activeTabId)!;
    const detailing = structuredClone(live.modelSnapshot.detailing!);
    pin(detailing, 0);
    detailing.titleBlock = { project: 'Edificio Los Álamos', office: 'Estudio C' };
    designed = { ...live, id: 'building', name: 'Edificio', modelSnapshot: { ...live.modelSnapshot, detailing } };
  }, 900_000);

  function pin(detailing: DetailingStore, n: number) {
    const bar = detailing.assemblies.filter((a) => a.bars.length > 0)[n]!.bars[0]!;
    (bar as { locked?: boolean }).locked = true;
  }

  const pinned = (d: ModelSnapshot['detailing']) => (d?.assemblies ?? []).flatMap((a) => a.bars).filter((b) => (b as { locked?: boolean }).locked).length;
  const storedRef = () => JSON.parse(storage.getItem(WORKSPACE_KEY)!).tabs[0].detailingRef as string;

  function startWith(tabs: TabState[], active: string) {
    resetWorkspaceDetailingMemory();
    tabManager.restoreSession(tabs.map((tab) => ({ ...tab })), active);
  }

  let repinnedTab: TabState | undefined;
  function repinned(): TabState {
    if (!repinnedTab) {
      const assemblies = designed.modelSnapshot.detailing!.assemblies.map((a) => ({ ...a, bars: a.bars.map((b) => ({ ...b })) }));
      const detailing = { ...designed.modelSnapshot.detailing!, assemblies };
      pin(detailing, 1);
      repinnedTab = { ...designed, modelSnapshot: { ...designed.modelSnapshot, detailing } };
    }
    return repinnedTab;
  }

  async function reload() {
    resetWorkspaceDetailingMemory();
    modelStore.clear();
    detailingStore.clear();
    const saved = loadWorkspaceFromLocalStorage()!;
    expect(saved).not.toBeNull();
    if (workspaceNeedsDetailing(saved)) await restoreWorkspaceDetailing(saved);
    tabManager.restoreSession(saved.tabs, saved.activeTabId);
    return saved;
  }

  it('stores well under a megabyte of text, not the ~46 MB of bars', async () => {
    startWith([designed], designed.id);
    expect(await saveWorkspaceSettled()).toBe(true);
    const text = storage.getItem(WORKSPACE_KEY)!;
    expect(text.length, 'the workspace text carries the detailing again').toBeLessThan(1_000_000);
    const stored = JSON.parse(text);
    expect(stored.tabs[0].modelSnapshot.detailing.assemblies).toEqual([]);
    expect((await readDetailing([storedRef()])).get(storedRef())?.assemblies?.length).toBe(designed.modelSnapshot.detailing!.assemblies.length);
  }, 300_000);

  it('round-trips every input of the designed model, the pinned bar included', async () => {
    startWith([designed, smallTab('b', 'Pórtico B')], designed.id);
    const before = modelStore.snapshot();
    expect(await saveWorkspaceSettled()).toBe(true);

    await reload();

    const after = modelStore.snapshot();
    for (const k of ['nodes', 'elements', 'sections', 'materials', 'supports', 'loads', 'loadCases', 'combinations', 'quads', 'designDecisions', 'designData', 'codeSettings', 'regulations'] as const) {
      expect(canon(after[k]), k).toBe(canon(before[k]));
    }
    expect(after.elements.filter(([, e]) => e.reinforcement).length).toBeGreaterThan(0);
    expect(canon(withoutDemandRevision(after.detailing))).toBe(canon(withoutDemandRevision(before.detailing)));
    expect(after.detailing!.assemblies.every((a) => a.demandRevision === -1), 'bars read back are stale until solved again').toBe(true);
    expect(pinned(after.detailing)).toBe(1);
    expect(after.detailing!.titleBlock).toEqual({ project: 'Edificio Los Álamos', office: 'Estudio C' });
    expect(tabManager.tabs.map((tab) => tab.name)).toEqual(['Edificio', 'Pórtico B']);
    expect(toast).not.toHaveBeenCalled();
  }, 300_000);

  it('stores the bars of an edit made through the detailing store, not the version before it', async () => {
    startWith([designed], designed.id);
    expect(await saveWorkspaceSettled()).toBe(true);
    const before = storedRef();
    const assembly = modelStore.model.detailing!.assemblies.find((a) => a.bars.some((b) => !(b as { locked?: boolean }).locked))!;
    const bar = assembly.bars.find((b) => !(b as { locked?: boolean }).locked)!;
    detailingStore.select(assembly.id);
    detailingStore.toggleLock(bar.id);
    const edited = pinned(modelStore.snapshot().detailing);
    expect(edited).toBeGreaterThan(pinned(designed.modelSnapshot.detailing));

    expect(await saveWorkspaceSettled()).toBe(true);
    expect(storedRef(), 'an edit that kept the old version would store the bars before it').not.toBe(before);

    await reload();
    const restored = modelStore.snapshot().detailing!;
    expect(pinned(restored)).toBe(edited);
    const back = restored.assemblies.find((a) => a.id === assembly.id)!.bars.find((b) => b.id === bar.id) as { locked?: boolean };
    expect(back.locked).toBe(true);
  }, 300_000);

  it('writes the text naming new bars only once they are stored: a reload mid-save gets the previous complete workspace', async () => {
    startWith([designed], designed.id);
    expect(await saveWorkspaceSettled()).toBe(true);
    const first = storedRef();
    startWith([repinned()], designed.id);
    expect(saveWorkspaceToLocalStorage()).toBe(true);
    expect(storedRef(), 'not yet stored: the text still names the previous bars').toBe(first);

    await reload();
    expect(pinned(modelStore.snapshot().detailing)).toBe(1);
    expect(toast).not.toHaveBeenCalled();
  }, 300_000);

  it('keeps one version per change, and the text of the latest save is the one kept', async () => {
    startWith([designed], designed.id);
    expect(saveWorkspaceToLocalStorage()).toBe(true);
    startWith([repinned()], designed.id);
    expect(await saveWorkspaceSettled()).toBe(true);
    const second = storedRef();
    expect(await saveWorkspaceSettled()).toBe(true);
    expect(storedRef(), 'unchanged bars keep their version').toBe(second);

    await reload();
    expect(pinned(modelStore.snapshot().detailing)).toBe(2);
  }, 300_000);

  it('writes the bars again when another window pruned the version this page named', async () => {
    startWith([designed], designed.id);
    expect(await saveWorkspaceSettled()).toBe(true);
    const ref = storedRef();
    await rawWrite('detailing', (s) => s.delete(ref));
    expect((await readDetailing([ref])).has(ref)).toBe(false);
    expect(await saveWorkspaceSettled()).toBe(true);
    expect(storedRef()).toBe(ref);
    expect((await readDetailing([ref])).has(ref)).toBe(true);
  }, 300_000);

  it('a snapshot of the detailing cannot be written in place', () => {
    startWith([designed], designed.id);
    const snap = modelStore.snapshot();
    const bar = snap.detailing!.assemblies.find((a) => a.bars.length > 0)!.bars[0] as { locked?: boolean };
    expect(() => { bar.locked = !bar.locked; }).toThrow(TypeError);
    expect(() => { snap.detailing!.assemblies.push(snap.detailing!.assemblies[0]!); }).toThrow(TypeError);
  });

  it('a version reused by a save is kept by a prune from another window, however old it was', async () => {
    startWith([designed], designed.id);
    expect(await saveWorkspaceSettled()).toBe(true);
    const ref = storedRef();
    const old = Date.now() - 60 * 60 * 1000;
    await rawWrite('touched', (s) => s.put({ ref, at: old }));
    expect(await saveWorkspaceSettled()).toBe(true);
    expect(storedRef()).toBe(ref);

    await resetWorkspaceDetailingDb();
    await pruneDetailing(() => new Set());
    expect((await readDetailing([ref])).has(ref), 'used just now: kept').toBe(true);

    await rawWrite('touched', (s) => s.put({ ref, at: old }));
    await pruneDetailing(() => new Set());
    expect((await readDetailing([ref])).has(ref), 'not used for an hour and named by nothing: pruned').toBe(false);
  }, 300_000);

  it('the save keeps the versions the workspace backup names, and prunes them once nothing names them', async () => {
    const aged = async (withBackup: boolean) => {
      storage.removeItem('stabileo-workspace-backup');
      startWith([designed], designed.id);
      expect(await saveWorkspaceSettled()).toBe(true);
      const ref = storedRef();
      if (withBackup) storage.setItem('stabileo-workspace-backup', JSON.stringify({ version: 1, entries: [{ savedAt: '', reason: 'tabs-dropped', dropped: [], raw: storage.getItem(WORKSPACE_KEY) }] }));
      await rawWrite('touched', (s) => s.put({ ref, at: Date.now() - 60 * 60 * 1000 }));
      startWith([repinned()], designed.id);
      expect(await saveWorkspaceSettled()).toBe(true);
      expect(storedRef()).not.toBe(ref);
      return ref;
    };
    const unnamed = await aged(false);
    await vi.waitFor(async () => expect((await readDetailing([unnamed])).has(unnamed)).toBe(false));
    const named = await aged(true);
    await new Promise((r) => setTimeout(r, 300));
    expect((await readDetailing([named])).has(named)).toBe(true);
  }, 300_000);

  it('treats a malformed record as lost bars, not as a tab with none', async () => {
    startWith([designed], designed.id);
    expect(await saveWorkspaceSettled()).toBe(true);
    const ref = storedRef();
    for (const heavy of [{}, { assemblies: [{ id: 'a', bars: [null] }] }, { assemblies: [{ bars: [] }] }]) {
      toast.mockClear();
      storage.setItem(WORKSPACE_KEY, JSON.stringify({ ...JSON.parse(storage.getItem(WORKSPACE_KEY)!), tabs: JSON.parse(storage.getItem(WORKSPACE_KEY)!).tabs.map((tab: TabState) => ({ ...tab, detailingRef: ref })) }));
      await rawWrite('detailing', (s) => s.put({ ref, heavy }));

      await reload();

      expect(toast.mock.calls.find((c) => String(c[0]).includes('«Edificio»'))?.[1], JSON.stringify(heavy)).toBe('error');
    }
  }, 300_000);

  it('says which tab lost its bars when their record is gone, and restores it without them', async () => {
    startWith([designed, smallTab('b', 'Pórtico B')], designed.id);
    expect(await saveWorkspaceSettled()).toBe(true);
    const stored = JSON.parse(storage.getItem(WORKSPACE_KEY)!);
    stored.tabs[0].detailingRef = 'building:another-save';
    storage.setItem(WORKSPACE_KEY, JSON.stringify(stored));

    await reload();

    expect(modelStore.snapshot().detailing?.assemblies ?? []).toEqual([]);
    expect(modelStore.snapshot().nodes.length).toBe(designed.modelSnapshot.nodes.length);
    const lost = toast.mock.calls.find((c) => String(c[0]).includes('«Edificio»'));
    expect(lost?.[1]).toBe('error');
    expect(lost?.[3], 'kept on screen until dismissed').toBe(true);
  }, 300_000);

  it('when the bars cannot be stored, keeps the previous workspace, shows the notice, and clears it once the tab is closed', async () => {
    startWith([designed], designed.id);
    expect(await saveWorkspaceSettled()).toBe(true);
    const previous = storage.getItem(WORKSPACE_KEY);

    await resetWorkspaceDetailingDb();
    vi.stubGlobal('indexedDB', undefined);
    startWith([repinned()], designed.id);
    expect(await saveWorkspaceSettled()).toBe(false);
    expect(workspaceSaveStatus.failed).toBe(true);
    expect(storage.getItem(WORKSPACE_KEY)).toBe(previous);

    startWith([smallTab('b', 'Pórtico B')], 'b');
    expect(await saveWorkspaceSettled()).toBe(true);
    expect(workspaceSaveStatus.failed).toBe(false);
  }, 300_000);
});
