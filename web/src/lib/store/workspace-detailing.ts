import type { DetailingStore } from '../engine/detailing/assembly';

const DB_NAME = 'stabileo-workspace-detailing';
const STORE = 'detailing';
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

export const HEAVY_DETAILING_KEYS = ['assemblies', 'designRefusals', 'floorReadings'] as const;
type HeavyKey = (typeof HEAVY_DETAILING_KEYS)[number];
export type HeavyDetailing = Partial<Pick<DetailingStore, HeavyKey>>;

interface DetailingRecord { tabId: string; ref: string; savedAt: number; heavy: HeavyDetailing }

export function splitDetailing(d: DetailingStore | undefined): { light: DetailingStore | undefined; heavy: HeavyDetailing | null } {
  if (!d || ((d.assemblies?.length ?? 0) === 0 && d.designRefusals === undefined && d.floorReadings === undefined)) {
    return { light: d, heavy: null };
  }
  const light: Record<string, unknown> = { ...d, assemblies: [] };
  const heavy: Record<string, unknown> = {};
  for (const k of HEAVY_DETAILING_KEYS) {
    if (k !== 'assemblies') delete light[k];
    if (d[k] !== undefined) heavy[k] = d[k];
  }
  return { light: light as unknown as DetailingStore, heavy: heavy as HeavyDetailing };
}

const partsOf = (h: HeavyDetailing): unknown[] => HEAVY_DETAILING_KEYS.map((k) => h[k]);

const held = new Map<string, { ref: string; parts: unknown[] }>();
const writing = new Map<string, { ref: string; parts: unknown[] }>();
let seq = 0;

/** Test seam: forget what this page has written. */
export function resetWorkspaceDetailingMemory(): void {
  held.clear();
  writing.clear();
}

export interface StagedDetailing { tabId: string; ref: string; heavy: HeavyDetailing; write: boolean }

export function stageDetailing(tabId: string, heavy: HeavyDetailing): StagedDetailing {
  const parts = partsOf(heavy);
  for (const prev of [writing.get(tabId), held.get(tabId)]) {
    if (prev && prev.parts.every((p, i) => p === parts[i])) return { tabId, ref: prev.ref, heavy, write: false };
  }
  return { tabId, ref: `${tabId}:${Date.now().toString(36)}:${(++seq).toString(36)}`, heavy, write: true };
}

export function noteDetailingHeld(tabId: string, ref: string, heavy: HeavyDetailing): void {
  held.set(tabId, { ref, parts: partsOf(heavy) });
}

let dbPromise: Promise<IDBDatabase | null> | undefined;

function db(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined' || indexedDB === null) { resolve(null); return; }
    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: 'tabId' });
    };
    open.onsuccess = () => {
      open.result.onversionchange = () => { open.result.close(); dbPromise = undefined; };
      resolve(open.result);
    };
    open.onerror = () => resolve(null);
    open.onblocked = () => resolve(null);
  });
  const p = dbPromise;
  void p.then((d) => { if (!d && dbPromise === p) dbPromise = undefined; });
  return p;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Records of tabs this page no longer has are dropped only once a day old: another window's workspace may still name them. */
export async function writeDetailing(staged: StagedDetailing[], liveTabIds: readonly string[]): Promise<boolean> {
  const pending = staged.filter((s) => s.write);
  for (const s of pending) writing.set(s.tabId, { ref: s.ref, parts: partsOf(s.heavy) });
  const database = await db().catch(() => null);
  if (!database) {
    for (const s of pending) if (writing.get(s.tabId)?.ref === s.ref) writing.delete(s.tabId);
    return pending.length === 0;
  }
  let ok = true;
  for (const s of pending) {
    try {
      const tx = database.transaction(STORE, 'readwrite');
      const record: DetailingRecord = { tabId: s.tabId, ref: s.ref, savedAt: Date.now(), heavy: s.heavy };
      tx.objectStore(STORE).put(record);
      await done(tx);
      noteDetailingHeld(s.tabId, s.ref, s.heavy);
    } catch {
      ok = false;
    } finally {
      if (writing.get(s.tabId)?.ref === s.ref) writing.delete(s.tabId);
    }
  }
  try {
    const live = new Set(liveTabIds);
    const tx = database.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const cutoff = Date.now() - ORPHAN_AGE_MS;
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      const rec = c.value as DetailingRecord;
      if (!live.has(rec.tabId) && rec.savedAt < cutoff) c.delete();
      c.continue();
    };
    await done(tx);
  } catch {
    /* an orphan left for the next save */
  }
  return ok;
}

export async function readDetailing(tabIds: readonly string[]): Promise<Map<string, { ref: string; heavy: HeavyDetailing }>> {
  const out = new Map<string, { ref: string; heavy: HeavyDetailing }>();
  const database = await db().catch(() => null);
  if (!database) return out;
  try {
    const tx = database.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const reads = tabIds.map((id) => new Promise<void>((resolve) => {
      const rq = store.get(id);
      rq.onsuccess = () => {
        const rec = rq.result as DetailingRecord | undefined;
        if (rec && typeof rec.ref === 'string' && rec.heavy && typeof rec.heavy === 'object') out.set(id, { ref: rec.ref, heavy: rec.heavy });
        resolve();
      };
      rq.onerror = () => resolve();
    }));
    await Promise.all(reads);
  } catch {
    return out;
  }
  return out;
}

/** Test seam: close and forget the database connection. */
export async function resetWorkspaceDetailingDb(): Promise<void> {
  const d = await dbPromise?.catch(() => null);
  d?.close();
  dbPromise = undefined;
  held.clear();
  writing.clear();
}
