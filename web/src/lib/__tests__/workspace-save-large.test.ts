import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { workspaceScene } from '../engine/detailing/__tests__/helpers/workspace-scene';
import {
  loadWorkspaceFromLocalStorage, resetWorkspaceGuard, restoreWorkspaceDetailing,
  saveWorkspaceSettled, saveWorkspaceToLocalStorage, workspaceNeedsDetailing,
} from '../store/file';
import { readDetailing, resetWorkspaceDetailingDb, resetWorkspaceDetailingMemory } from '../store/workspace-detailing';
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
  workspaceSaveStatus.reset();
});

afterEach(async () => {
  toast.mockRestore();
  vi.unstubAllGlobals();
  await resetWorkspaceDetailingDb();
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
    const bar = detailing.assemblies.find((a) => a.bars.length > 0)!.bars[0]!;
    (bar as { locked?: boolean }).locked = true;
    detailing.titleBlock = { project: 'Edificio Los Álamos', office: 'Estudio C' };
    designed = { ...live, id: 'building', name: 'Edificio', modelSnapshot: { ...live.modelSnapshot, detailing } };
  }, 900_000);

  function startWith(tabs: TabState[], active: string) {
    resetWorkspaceDetailingMemory();
    tabManager.restoreSession(tabs.map((tab) => ({ ...tab })), active);
  }

  async function settled() {
    const tabs = JSON.parse(storage.getItem(WORKSPACE_KEY)!).tabs as Array<{ id: string; detailingRef?: string }>;
    const wanted = tabs.filter((tab) => tab.detailingRef);
    await vi.waitFor(async () => {
      const records = await readDetailing(wanted.map((tab) => tab.id));
      for (const tab of wanted) expect(records.get(tab.id)?.ref).toBe(tab.detailingRef);
    }, { timeout: 60_000 });
    expect(workspaceSaveStatus.failed).toBe(false);
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
    expect(saveWorkspaceToLocalStorage()).toBe(true);
    const text = storage.getItem(WORKSPACE_KEY)!;
    expect(text.length, 'the workspace text carries the detailing again').toBeLessThan(1_000_000);
    const stored = JSON.parse(text);
    expect(stored.tabs[0].modelSnapshot.detailing.assemblies).toEqual([]);
    expect(stored.tabs[0].detailingRef).toEqual(expect.any(String));
    await settled();
  }, 300_000);

  it('round-trips every input of the designed model, the pinned bar included', async () => {
    const other = smallTab('b', 'Pórtico B');
    startWith([designed, other], designed.id);
    const before = modelStore.snapshot();
    expect(saveWorkspaceToLocalStorage()).toBe(true);
    await settled();

    await reload();

    const after = modelStore.snapshot();
    for (const k of ['nodes', 'elements', 'sections', 'materials', 'supports', 'loads', 'loadCases', 'combinations', 'quads', 'designDecisions', 'designData', 'codeSettings', 'regulations'] as const) {
      expect(canon(after[k]), k).toBe(canon(before[k]));
    }
    expect(after.elements.filter(([, e]) => e.reinforcement).length).toBeGreaterThan(0);
    expect(canon(withoutDemandRevision(after.detailing))).toBe(canon(withoutDemandRevision(before.detailing)));
    expect(after.detailing!.assemblies.every((a) => a.demandRevision === -1), 'bars read back are stale until solved again').toBe(true);
    expect(after.detailing!.assemblies.flatMap((a) => a.bars).filter((b) => (b as { locked?: boolean }).locked)).toHaveLength(1);
    expect(after.detailing!.titleBlock).toEqual({ project: 'Edificio Los Álamos', office: 'Estudio C' });
    expect(tabManager.tabs.map((tab) => tab.name)).toEqual(['Edificio', 'Pórtico B']);
    expect(toast).not.toHaveBeenCalled();
  }, 300_000);

  it('writes the bars once per version, not on every save', async () => {
    startWith([designed], designed.id);
    expect(saveWorkspaceToLocalStorage()).toBe(true);
    const first = JSON.parse(storage.getItem(WORKSPACE_KEY)!).tabs[0].detailingRef;
    expect(saveWorkspaceToLocalStorage()).toBe(true);
    expect(JSON.parse(storage.getItem(WORKSPACE_KEY)!).tabs[0].detailingRef, 'a save while the bars are being written names the same write').toBe(first);
    await settled();
    expect(saveWorkspaceToLocalStorage()).toBe(true);
    expect(JSON.parse(storage.getItem(WORKSPACE_KEY)!).tabs[0].detailingRef).toBe(first);
  }, 300_000);

  it('says which tab lost its bars when their record is gone, and restores it without them', async () => {
    startWith([designed, smallTab('b', 'Pórtico B')], designed.id);
    expect(saveWorkspaceToLocalStorage()).toBe(true);
    await settled();
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

  it('a save before a reload resolves only once the bars are stored', async () => {
    startWith([designed], designed.id);
    expect(await saveWorkspaceSettled()).toBe(true);
    const ref = JSON.parse(storage.getItem(WORKSPACE_KEY)!).tabs[0].detailingRef;
    expect((await readDetailing([designed.id])).get(designed.id)?.ref).toBe(ref);
  }, 300_000);

  it('shows the notice when the bars cannot be written', async () => {
    await resetWorkspaceDetailingDb();
    vi.stubGlobal('indexedDB', undefined);
    startWith([designed], designed.id);
    expect(await saveWorkspaceSettled()).toBe(false);
    expect(workspaceSaveStatus.failed).toBe(true);
  }, 300_000);
});
