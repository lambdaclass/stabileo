/**
 * The autosave, end to end, on projects that have actually been designed.
 *
 * ── The lost afternoon this exists to prevent ──────────────────────
 *
 * `localStorage` gives an origin a few megabytes. Measured in a real browser on
 * `Edificio H.A. 7 pisos — PRO`: the autosave is 172 kB after the example loads, is rewritten
 * normally after the solve, and from the moment `designAll` finishes every write throws
 * `QuotaExceededError` — for the rest of the session, on a 30 s timer.
 *
 * The damage was never the missing write. It was that the key STILL HELD THE PRE-DESIGN
 * SNAPSHOT, so a reload offered a restore banner, and the banner restored the model as it was
 * before the design ran. The user pressed Restaurar expecting their afternoon back and was
 * handed the morning.
 *
 * So the assertions here are about the whole path, not about storage: what is written after a
 * design run CONTAINS the design, what comes back is the same project, restoring it twice
 * accumulates nothing, and a failure to write is reported rather than absorbed.
 *
 * ── Why the small fixtures ─────────────────────────────────────────
 *
 * `rc-design-qa-8` and `rc-qa-diagnostic-shells` run the same production commands as the
 * 7-storey building — solve, design, detail, floor-design — over 8 and a handful of members
 * instead of 119. The property being asserted is "the payload survives the round trip", which
 * does not get truer with more members, and `fake-indexeddb` has no size ceiling to trip
 * anyway. The size claim belongs in a real browser and is made by the Playwright journey.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import { detailingStore } from '../detailing.svelte';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import {
  acceptAutosavePayload, autosaveFingerprint, buildProjectFile, projectAutosavePolicy,
  clearAutosave, loadAutosave, resetAutosaveNotices, saveAutosave,
} from '../file';
import { autosaveRevisions, autosaveWrite, resetAutosaveDbForTests } from '../autosave-db';
import { requestAutosave, resetAutosaveService, lastAutosaveOutcome, autosaveSettled } from '../autosave-service';
import { findUncloneablePath } from '../../utils/plain-deep-copy';
import { isSolverReady } from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

const DB_NAME = 'stabileo-autosave';

function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const rq = indexedDB.deleteDatabase(DB_NAME);
    rq.onsuccess = () => resolve();
    rq.onerror = () => resolve();
    rq.onblocked = () => resolve();
  });
}

function stubStorage(opts: { throwOn?: 'quota' | 'none' } = {}) {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => { map.delete(k); },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    clear: () => map.clear(),
    setItem: (k: string, v: string) => {
      if (opts.throwOn === 'quota') {
        const e = new Error("Setting the value of 'stabileo-autosave' exceeded the quota.");
        e.name = 'QuotaExceededError';
        throw e;
      }
      map.set(k, v);
    },
  });
  return map;
}

/**
 * The snapshot as the restore path actually receives it: every object and array proxied.
 *
 * Two production callers hold a parsed project in `$state` before handing it to `restore()` —
 * the autosave banner and the tab manager — and Svelte hands a DEEP PROXY back out. Compiled
 * for the server, which is how Vitest builds these modules, `$state` is the identity function
 * and proxies nothing, so the condition is reproduced directly.
 */
function deepProxy<T>(value: T, depth = 0): T {
  if (value === null || typeof value !== 'object' || depth > 12) return value;
  if (Array.isArray(value)) return new Proxy(value.map((v) => deepProxy(v, depth + 1)), {}) as unknown as T;
  const inner: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>)) {
    inner[k] = deepProxy((value as Record<string, unknown>)[k], depth + 1);
  }
  return new Proxy(inner, {}) as unknown as T;
}

/** Run the production chain over one example, leaving the stores holding its result. */
async function designExample(example: string, opts: { floors?: boolean } = {}): Promise<void> {
  modelStore.clear();
  resultsStore.clear();
  detailingStore.clear();
  designRunStore.resetMarks();
  verificationStore.clear();

  await modelStore.loadExample(example);
  expect(isSolverReady(), 'real WASM solver, not the Vite stub').toBe(true);

  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  expect(typeof solved, 'the solver returned results rather than an error string').not.toBe('string');
  const r = solved as { perCase: never; perCombo: never; envelope: never };
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);

  designRunStore.computeDemands();
  designRunStore.runCodeCheck();
  designRunStore.designAll();
  detailingStore.generate({ verifierId: 'cirsoc201.provided.v2.2025' });
  if (opts.floors) detailingStore.generateFloors({ verifierId: 'cirsoc201.provided.v2.2025' });
  await autosaveSettled();
}

/** A census of what a project is carrying, for comparing two vintages of it. */
function census() {
  const m = modelStore.model;
  let reinforced = 0;
  for (const [, e] of m.elements) if (e.reinforcement) reinforced += 1;
  const detailing = m.detailing;
  return {
    name: m.name,
    nodes: m.nodes.size,
    elements: m.elements.size,
    loads: m.loads.length,
    quads: m.quads.size,
    footings: m.footings.size,
    reinforced,
    assemblies: detailing?.assemblies.length ?? 0,
    bars: (detailing?.assemblies ?? []).reduce((n, a) => n + a.bars.length, 0),
  };
}

describe('autosave — a designed project, saved and restored', () => {
  let designed: ReturnType<typeof census>;

  beforeAll(async () => {
    stubStorage();
    await designExample('rc-design-qa-8');
    designed = census();
    expect(designed.reinforced, 'the fixture actually designed something').toBeGreaterThan(0);
    expect(designed.bars, 'and detailed it').toBeGreaterThan(0);
  }, 900_000);

  beforeEach(async () => {
    vi.unstubAllGlobals();
    stubStorage();
    resetAutosaveNotices();
    resetAutosaveService();
    uiStore.toasts.length = 0;
    await resetAutosaveDbForTests();
    await deleteDatabase();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    uiStore.toasts.length = 0;
  });

  it('writes the DESIGN, not the model as it was before it', async () => {
    const write = await saveAutosave();
    expect(write.ok).toBe(true);
    expect(write.backend).toBe('indexeddb');

    const read = await loadAutosave();
    expect(read.value).toBeTruthy();
    // The exact fact the localStorage autosave got wrong: reinforcement in the stored copy.
    expect(autosaveFingerprint(read.value).reinforced).toBe(designed.reinforced);
    expect(read.value!.snapshot.detailing?.assemblies.length).toBe(designed.assemblies);
  });

  it('round-trips the whole project through a simulated reload', async () => {
    await saveAutosave();

    // The reload: nothing survives in memory, only what is in storage.
    const read = await loadAutosave();
    modelStore.clear();
    resultsStore.clear();
    detailingStore.clear();
    expect(modelStore.model.elements.size).toBe(0);

    modelStore.restore(read.value!.snapshot);
    modelStore.model.name = read.value!.name;
    expect(census()).toEqual(designed);
  });

  it('restores twice without accumulating state', async () => {
    await saveAutosave();
    const read = await loadAutosave();

    modelStore.restore(read.value!.snapshot);
    modelStore.model.name = read.value!.name;
    const once = census();
    modelStore.restore(read.value!.snapshot);
    modelStore.model.name = read.value!.name;
    expect(census(), 'a second restore is a no-op, not an append').toEqual(once);
    expect(once).toEqual(designed);
  });

  it('keeps the payload structured-cloneable even after a proxied restore', async () => {
    // A payload IndexedDB refuses to clone is an autosave that silently stops working. The
    // banner and the tab manager both hand `restore()` a deep proxy, and `restore()` used to
    // adopt those proxies into the live model, from where they reached every wire.
    expect(findUncloneablePath(buildProjectFile(), 'project')).toBeNull();

    const payload = buildProjectFile();
    modelStore.restore(deepProxy(payload.snapshot));
    expect(findUncloneablePath(buildProjectFile(), 'project'),
      'the model owns plain data after restoring a proxied snapshot').toBeNull();

    // And the round trip still works from there, which is the property that actually matters.
    const write = await saveAutosave();
    expect(write.ok).toBe(true);
    const read = await loadAutosave();
    expect(read.value).toBeTruthy();
  });

  it('hands back the newest revision when several were written', async () => {
    modelStore.model.name = 'first';
    await saveAutosave();
    modelStore.model.name = 'second';
    await saveAutosave();
    modelStore.model.name = 'third';
    const last = await saveAutosave();

    const read = await loadAutosave();
    expect(read.value!.name).toBe('third');
    expect(read.revision).toBe(last.revision);
    modelStore.model.name = designed.name;
  });

  it('does not copy the detailing again for the payload', () => {
    const payload = buildProjectFile();
    expect(payload.snapshot.detailing!.assemblies.length).toBe(designed.assemblies);
    expect(payload.snapshot.detailing!.assemblies).toBe(modelStore.snapshot().detailing!.assemblies);
    expect(Object.keys(payload.snapshot)).toEqual(Object.keys(modelStore.snapshot()));
  });

  it('does not write an unchanged project again while its write is still the newest', async () => {
    const first = await saveAutosave();
    expect(first.ok).toBe(true);
    const again = await saveAutosave();
    expect(again).toMatchObject({ ok: true, backend: 'indexeddb', revision: first.revision });
    expect((await autosaveRevisions()).map((r) => r.revision)).toEqual([first.revision]);

    modelStore.model.name = 'renamed';
    const renamed = await saveAutosave();
    expect(renamed.revision).toBe(first.revision! + 1);
    expect((await loadAutosave()).value!.name).toBe('renamed');
    modelStore.model.name = designed.name;

    const detailing = modelStore.model.detailing!;
    modelStore.model.detailing = { ...detailing, assemblies: detailing.assemblies.slice(1) };
    const lessBars = await saveAutosave();
    expect(lessBars.revision, 'a new detailing is written').toBe(renamed.revision! + 1);
    expect((await loadAutosave()).value!.snapshot.detailing!.assemblies.length).toBe(designed.assemblies - 1);
    modelStore.model.detailing = detailing;
    const restored = await saveAutosave();
    expect((await loadAutosave()).value!.snapshot.detailing!.assemblies.length).toBe(designed.assemblies);

    const other = buildProjectFile();
    await autosaveWrite({ ...other, name: 'another window' }, projectAutosavePolicy);
    const afterOther = await saveAutosave();
    expect(afterOther.revision, 'another window wrote since: written again').toBe(restored.revision! + 2);
    expect((await loadAutosave()).value!.name).toBe(designed.name);

    await clearAutosave();
    const afterClear = await saveAutosave();
    expect(afterClear.ok).toBe(true);
    expect((await loadAutosave()).value!.name, 'a discarded save is written again').toBe(designed.name);
  });

  it('clears every revision when the user discards the save', async () => {
    await saveAutosave();
    await saveAutosave();
    await clearAutosave();
    const read = await loadAutosave();
    expect(read.value).toBeNull();
  });

  it('reports a failed write instead of letting the caller believe it saved', async () => {
    vi.stubGlobal('indexedDB', undefined);
    stubStorage({ throwOn: 'quota' });
    await resetAutosaveDbForTests();

    const write = await saveAutosave();
    expect(write.ok, 'the caller learns the write did not happen').toBe(false);
    expect(write.failure?.kind).toBe('quota');
    expect(uiStore.toasts, 'the user is told, rather than left believing it saved').not.toHaveLength(0);
    expect(uiStore.toasts.some((x) => /\.ded/.test(x.message)),
      'and the message names the way out').toBe(true);
  });

  it('says so when the browser offers no storage at all', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', undefined);
    await resetAutosaveDbForTests();

    const write = await saveAutosave();
    expect(write.ok).toBe(false);
    expect(write.backend).toBe('none');
    expect(uiStore.toasts).not.toHaveLength(0);
  });

  it('warns once per session rather than once every thirty seconds', async () => {
    vi.stubGlobal('indexedDB', undefined);
    stubStorage({ throwOn: 'quota' });
    await resetAutosaveDbForTests();

    for (let i = 0; i < 5; i++) await saveAutosave();
    expect(uiStore.toasts).toHaveLength(1);
  });

  it('coalesces overlapping requests instead of racing two writes', async () => {
    const results = await Promise.all([
      requestAutosave('design'),
      requestAutosave('detailing'),
      requestAutosave('timer'),
    ]);
    await autosaveSettled();
    expect(results.every((r) => r?.ok)).toBe(true);
    const outcome = lastAutosaveOutcome();
    expect(outcome?.ok).toBe(true);
    expect(outcome?.backend).toBe('indexeddb');

    // Whatever the coalescing did, the stored project is the current one.
    const read = await loadAutosave();
    expect(autosaveFingerprint(read.value).reinforced).toBe(designed.reinforced);
  });

  it('never overwrites a stored project with an empty model', async () => {
    await saveAutosave();
    const before = await loadAutosave();
    expect(before.value).toBeTruthy();

    modelStore.clear();
    const skipped = await requestAutosave('timer');
    expect(skipped, 'an empty model is not something to save over a real one').toBeNull();

    const after = await loadAutosave();
    expect(autosaveFingerprint(after.value).reinforced).toBe(designed.reinforced);

    // Put the shared fixture back for the remaining cases in this file.
    modelStore.restore(after.value!.snapshot);
    modelStore.model.name = after.value!.name;
  });
});

describe('autosave — a floor design survives the round trip', () => {
  beforeAll(async () => {
    stubStorage();
    await designExample('rc-qa-diagnostic-shells', { floors: true });
  }, 900_000);

  beforeEach(async () => {
    vi.unstubAllGlobals();
    stubStorage();
    resetAutosaveNotices();
    resetAutosaveService();
    uiStore.toasts.length = 0;
    await resetAutosaveDbForTests();
    await deleteDatabase();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores and returns the floor assemblies the floor pass produced', async () => {
    const before = census();
    const floorAssemblies = (modelStore.model.detailing?.assemblies ?? [])
      .filter((a) => a.id.startsWith('FLOOR-')).length;
    expect(floorAssemblies, 'the floor pass produced assemblies').toBeGreaterThan(0);

    expect((await saveAutosave()).ok).toBe(true);
    const read = await loadAutosave();

    modelStore.clear();
    detailingStore.clear();
    modelStore.restore(read.value!.snapshot);
    modelStore.model.name = read.value!.name;

    expect(census()).toEqual(before);
    expect((modelStore.model.detailing?.assemblies ?? [])
      .filter((a) => a.id.startsWith('FLOOR-')).length).toBe(floorAssemblies);
  });
});

describe('autosave — refusals and migrations of a stored payload', () => {
  it('migrates a v1.0 payload the way opening a .ded would', () => {
    const v1 = {
      version: '1.0',
      name: 'legacy',
      timestamp: '2024-01-01T00:00:00.000Z',
      snapshot: {
        nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 3, y: 0 }]],
        materials: [], sections: [], supports: [], loads: [],
        elements: [[1, {
          id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
          hingeStart: true, hingeEnd: false,
        }]],
        nextId: { node: 3 },
      },
    };
    const accepted = acceptAutosavePayload(v1);
    expect(accepted, 'a v1.0 autosave is still restorable').toBeTruthy();
    expect(accepted!.version).toBe('2.0');
    const elem = accepted!.snapshot.elements[0][1] as unknown as Record<string, unknown>;
    expect((elem.releaseI as { mz: boolean }).mz, 'hingeStart became releaseI.mz').toBe(true);
    expect(elem.hingeStart, 'and the legacy field is gone').toBeUndefined();
  });

  it('does not mutate the stored record while migrating it', () => {
    const v1 = {
      version: '1.0', name: 'legacy', timestamp: '2024-01-01T00:00:00.000Z',
      snapshot: {
        nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 3, y: 0 }]],
        materials: [], sections: [], supports: [], loads: [],
        elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: true }]],
        nextId: { node: 3 },
      },
    };
    acceptAutosavePayload(v1);
    // A read that rewrites the record it read is a write nobody asked for, and it would
    // silently change what a LATER reader sees.
    expect((v1.snapshot.elements[0][1] as Record<string, unknown>).hingeStart).toBe(true);
    expect(v1.version).toBe('1.0');
  });

  it('refuses an unknown version rather than guessing at it', () => {
    expect(acceptAutosavePayload({ version: '9.9', name: 'x', snapshot: {} })).toBeNull();
  });

  it('refuses a payload whose elements point at nodes that do not exist', () => {
    expect(acceptAutosavePayload({
      version: '2.0', name: 'broken', timestamp: '',
      snapshot: {
        nodes: [[1, { id: 1, x: 0, y: 0 }]],
        materials: [], sections: [], supports: [], loads: [],
        elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 77, materialId: 1, sectionId: 1 }]],
        nextId: { node: 2 },
      },
    })).toBeNull();
  });

  it('counts the families a restore depends on, reinforcement included', () => {
    const fp = autosaveFingerprint({
      snapshot: {
        nodes: [1, 2, 3], elements: [[1, { reinforcement: {} }], [2, {}]],
        materials: [1], sections: [1], supports: [], loads: [1, 2],
        plates: [], quads: [], footings: [],
      },
    });
    expect(fp).toMatchObject({ nodes: 3, elements: 2, loads: 2, reinforced: 1 });
  });

  it('refuses anything that is not an object', () => {
    expect(acceptAutosavePayload(null)).toBeNull();
    expect(acceptAutosavePayload('a string')).toBeNull();
    expect(acceptAutosavePayload(42)).toBeNull();
  });
});
