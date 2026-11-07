import type { DetailingStore } from '../engine/detailing/assembly';

const DB_NAME = 'stabileo-workspace-detailing';
const STORE = 'detailing';
const PRUNE_GRACE_MS = 10 * 60 * 1000;

export const HEAVY_DETAILING_KEYS = ['assemblies', 'designRefusals', 'floorReadings'] as const;
type HeavyKey = (typeof HEAVY_DETAILING_KEYS)[number];
export type HeavyDetailing = Partial<Pick<DetailingStore, HeavyKey>>;

interface DetailingRecord { ref: string; savedAt: number; heavy: HeavyDetailing }

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

const known = new Map<string, { ref: string; parts: unknown[] }>();

/** Test seam: forget what this page has written. */
export function resetWorkspaceDetailingMemory(): void {
  known.clear();
}

export interface StagedDetailing { tabId: string; ref: string; heavy: HeavyDetailing }

/** The ref names one version of the bars: a tab whose bars did not change since its last save keeps its ref. */
export function stageDetailing(tabId: string, heavy: HeavyDetailing): StagedDetailing {
  const parts = partsOf(heavy);
  const prev = known.get(tabId);
  if (prev && prev.parts.every((p, i) => p === parts[i])) return { tabId, ref: prev.ref, heavy };
  const ref = `${tabId}:${crypto.randomUUID()}`;
  known.set(tabId, { ref, parts });
  return { tabId, ref, heavy };
}

export function noteDetailingKnown(tabId: string, ref: string, heavy: HeavyDetailing): void {
  known.set(tabId, { ref, parts: partsOf(heavy) });
}

let dbPromise: Promise<IDBDatabase | null> | undefined;

function db(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined' || indexedDB === null) { resolve(null); return; }
    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: 'ref' });
    };
    open.onsuccess = () => {
      open.result.onversionchange = () => { open.result.close(); if (dbPromise === p) dbPromise = undefined; };
      resolve(open.result);
    };
    open.onerror = () => resolve(null);
    open.onblocked = () => resolve(null);
  });
  dbPromise = p;
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

/**
 * Every staged version is in the store when this resolves true, all of them or none: a version
 * this page wrote before is written again if another window pruned it.
 */
export async function storeDetailing(staged: StagedDetailing[]): Promise<boolean> {
  const database = await db().catch(() => null);
  if (!database) return false;
  try {
    const tx = database.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const s of staged) {
      const rq = store.getKey(s.ref);
      rq.onsuccess = () => {
        if (rq.result === undefined) store.put({ ref: s.ref, savedAt: Date.now(), heavy: s.heavy } satisfies DetailingRecord);
      };
    }
    await done(tx);
    return true;
  } catch {
    return false;
  }
}

/** `keep` is read inside the transaction; versions written in the last ten minutes are kept too, as another window may be about to name one. */
export async function pruneDetailing(keepNow: () => ReadonlySet<string>): Promise<void> {
  const database = await db().catch(() => null);
  if (!database) return;
  try {
    const tx = database.transaction(STORE, 'readwrite');
    const keep = keepNow();
    const cutoff = Date.now() - PRUNE_GRACE_MS;
    const cursor = tx.objectStore(STORE).openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      const rec = c.value as DetailingRecord;
      if (!keep.has(rec.ref) && !(rec.savedAt >= cutoff)) c.delete();
      c.continue();
    };
    await done(tx);
  } catch {
    /* left for the next save */
  }
}

function isHeavy(h: unknown): h is HeavyDetailing {
  if (!h || typeof h !== 'object') return false;
  const { assemblies, designRefusals, floorReadings } = h as Record<string, unknown>;
  return Array.isArray(assemblies)
    && assemblies.every((a) => !!a && typeof a === 'object' && Array.isArray((a as { bars?: unknown }).bars))
    && (designRefusals === undefined || (!!designRefusals && typeof designRefusals === 'object'))
    && (floorReadings === undefined || (!!floorReadings && typeof floorReadings === 'object'));
}

export async function readDetailing(refs: readonly string[]): Promise<Map<string, HeavyDetailing>> {
  const out = new Map<string, HeavyDetailing>();
  const database = await db().catch(() => null);
  if (!database) return out;
  try {
    const tx = database.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    for (const ref of refs) {
      const rq = store.get(ref);
      rq.onsuccess = () => {
        const rec = rq.result as DetailingRecord | undefined;
        if (isHeavy(rec?.heavy)) out.set(ref, rec.heavy);
      };
    }
    await done(tx);
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
  known.clear();
}
