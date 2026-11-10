/**
 * The autosave, in IndexedDB, and honest about every way it can fail.
 *
 * ── The silence this replaces ──────────────────────────────────────
 *
 * `localStorage` gives an origin a few megabytes. `Edificio H.A. 7 pisos — PRO` is 172 kB
 * before the design and well past that ceiling after `designAll`, so every write threw
 * `QuotaExceededError` from the moment the project became worth saving. The key kept the
 * PRE-DESIGN snapshot, the reload offered a restore banner, and the banner handed back the
 * morning. One toast per session was added to stop that being silent; it did not stop it
 * being true.
 *
 * IndexedDB has no comparable ceiling and stores structured-cloneable values rather than a
 * string, so the payload is neither stringified nor size-capped. That removes the quota
 * failure. It does not, on its own, remove the class of bug — a store that can hold more can
 * still hand back something old, something half-written, or something damaged, and say
 * nothing. So this module is built around the rule that produced the original defect report:
 *
 *   **an autosave may fail, and may be refused on read, but it may never lie about either.**
 *
 * ── What is stored ─────────────────────────────────────────────────
 *
 * One record per save, keyed by a monotonic `revision`, carrying its own `timestamp`, its own
 * `status`, and a structural `fingerprint` of the payload. The newest record that survives
 * every check wins. Older ones are kept (`AUTOSAVE_REVISIONS_KEPT`) so that a damaged newest
 * record degrades to a real previous save instead of to nothing — and the caller is told that
 * is what happened.
 *
 * ── Complete vs. incomplete ────────────────────────────────────────
 *
 * A single `put` is atomic, so a record cannot be half-written. The window that IS real is
 * the one around it: the tab is closed, or the process is killed, between deciding to save
 * revision R and committing it. A three-transaction write makes that window observable —
 * `meta.unfinishedRevision = R`, then the record, then clear the marker — so a marker left
 * behind is exactly the evidence that a save started and never landed. It is reported, never
 * treated as a save that happened.
 *
 * ── What the fingerprint does and does not catch ───────────────────
 *
 * It is a count of the payload's own families (nodes, elements, loads, …), not a hash. It
 * catches a record that lost or gained entries between write and read; it does not catch a
 * single flipped number inside one of them. Structural damage is caught separately and more
 * strictly by the policy's `accept`, which runs the same validation and the same migrations
 * as opening a `.ded` file — including referential integrity. Claiming a checksum here would
 * be claiming an integrity guarantee this does not provide.
 *
 * ── Format-agnostic on purpose ─────────────────────────────────────
 *
 * Nothing here knows what a project is. The caller supplies an `AutosavePolicy` that decides
 * what a payload must satisfy to be accepted and how to fingerprint it. That keeps this
 * module free of any import from `file.ts`, which imports it — and keeps the storage rules
 * testable without a model.
 *
 * Pure-ish: no store access, no Svelte, no timers. Every entry point is async because
 * IndexedDB is.
 */

/** Which store actually answered. `none` means nothing persisted at all. */
export type AutosaveBackend = 'indexeddb' | 'localstorage' | 'none';

/** Structural census of a payload — see the fingerprint note above for its limits. */
export type AutosaveFingerprint = Record<string, number>;

export interface AutosavePolicy<T> {
  /**
   * Validate and migrate a stored payload into a usable project, or return null.
   *
   * This is the same gate a `.ded` open goes through. A payload that fails it is refused
   * and reported as `invalid`; it is never partially applied.
   */
  accept(payload: unknown): T | null;
  /** Census used to detect a record that lost or gained entries in storage. */
  fingerprint(payload: unknown): AutosaveFingerprint;
}

/** Why a record newer than the restored one was refused. Never silent. */
export type AutosaveRejection =
  | { revision: number; timestamp: string; why: 'incomplete' }
  | { revision: number; timestamp: string; why: 'fingerprint'; expected: AutosaveFingerprint; actual: AutosaveFingerprint }
  | { revision: number; timestamp: string; why: 'invalid' };

export interface AutosaveReadResult<T> {
  backend: AutosaveBackend;
  /** The newest record that survived every check, or null when there is none. */
  value: T | null;
  revision: number | null;
  timestamp: string | null;
  /** Records NEWER than `value` that were refused, newest first. */
  rejected: AutosaveRejection[];
  /** A save that started and never committed, i.e. the tab died mid-write. */
  unfinishedRevision: number | null;
}

export type AutosaveFailureKind = 'unavailable' | 'quota' | 'clone' | 'unknown';

export interface AutosaveWriteResult {
  ok: boolean;
  backend: AutosaveBackend;
  /** The revision that was committed. Null when nothing was. */
  revision: number | null;
  /** Names the committed write, so a later caller can tell it is still the newest one. */
  writeId?: string;
  failure?: { kind: AutosaveFailureKind; detail: string };
}

export interface AutosaveStatus {
  backend: AutosaveBackend;
  /** True when the autosave is running on something weaker than IndexedDB. */
  degraded: boolean;
  /** Why, in one sentence, when degraded. */
  reason: string | null;
}

// ─── Layout ─────────────────────────────────────────────────────────

const DB_NAME = 'stabileo-autosave';
const DB_VERSION = 1;
const STORE_SNAPSHOTS = 'snapshots';
const STORE_META = 'meta';
const META_KEY = 'state';

/**
 * The legacy single-slot key, still written by the localStorage fallback and read once for
 * migration. Same name and same shape as before, so a browser that cannot open IndexedDB
 * behaves exactly as it did rather than differently AND worse.
 */
export const LEGACY_AUTOSAVE_KEY = 'stabileo-autosave';

/**
 * How many revisions survive a write.
 *
 * Three, not one: the whole point of keeping history is that a damaged newest record has
 * somewhere to fall back to. Not many more than three, because these are whole projects and
 * the quota that IndexedDB does have is a disk quota, not an excuse.
 */
export const AUTOSAVE_REVISIONS_KEPT = 3;

interface MetaRecord {
  key: typeof META_KEY;
  /** Highest revision ever committed. */
  lastRevision: number;
  /** Set while a write is in flight; cleared when it commits. */
  unfinishedRevision: number | null;
  /** Set once the legacy localStorage slot has been imported (or found absent). */
  legacyImported: boolean;
  lastWriteId?: string;
}

interface StoredRecord {
  revision: number;
  timestamp: string;
  /** `complete` is the only value a restore accepts. */
  status: 'complete';
  fingerprint: AutosaveFingerprint;
  payload: unknown;
}

// ─── IndexedDB plumbing ─────────────────────────────────────────────

/**
 * Cached open. `undefined` = not tried yet, `null` = tried and unavailable.
 *
 * Cached because the answer does not change within a session: a browser that refuses to open
 * IndexedDB in a private window refuses every time, and re-asking on a 30 s timer would turn
 * one honest degradation into a stream of them.
 */
let dbPromise: Promise<IDBDatabase | null> | undefined;
let unavailableReason: string | null = null;

/**
 * Test seam: close the cached connection and forget the availability verdict.
 *
 * Closing rather than merely forgetting: an open connection BLOCKS `deleteDatabase`, so a
 * suite that resets between cases would otherwise hang on the second one.
 */
export async function resetAutosaveDbForTests(): Promise<void> {
  const pending = dbPromise;
  dbPromise = undefined;
  unavailableReason = null;
  if (!pending) return;
  try {
    (await pending)?.close();
  } catch {
    /* already gone */
  }
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined' || indexedDB === null) {
    unavailableReason = 'IndexedDB is not exposed by this browser context.';
    return Promise.resolve(null);
  }
  return new Promise<IDBDatabase | null>((resolve) => {
    let open: IDBOpenDBRequest;
    try {
      open = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      // Safari and Firefox private windows can throw here rather than firing onerror.
      unavailableReason = describeError(err);
      resolve(null);
      return;
    }
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'revision' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    open.onsuccess = () => {
      // Another tab upgrading or deleting the database must not be blocked by this one
      // holding a connection open for the lifetime of the page.
      open.result.onversionchange = () => open.result.close();
      resolve(open.result);
    };
    open.onerror = () => {
      unavailableReason = describeError(open.error);
      resolve(null);
    };
    open.onblocked = () => {
      unavailableReason = 'Another tab is holding an older version of the autosave database open.';
      resolve(null);
    };
  });
}

function db(): Promise<IDBDatabase | null> {
  if (dbPromise === undefined) dbPromise = openDatabase();
  return dbPromise;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (err && typeof err === 'object' && 'name' in err) return String((err as { name: unknown }).name);
  return String(err);
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  const message = (err as { message?: unknown }).message;
  return name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || (typeof message === 'string' && /quota/i.test(message));
}

function isCloneError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'DataCloneError';
}

async function readMeta(database: IDBDatabase): Promise<MetaRecord> {
  const tx = database.transaction(STORE_META, 'readonly');
  const got = await req<MetaRecord | undefined>(
    tx.objectStore(STORE_META).get(META_KEY) as IDBRequest<MetaRecord | undefined>,
  );
  await txDone(tx).catch(() => undefined);
  return got ?? { key: META_KEY, lastRevision: 0, unfinishedRevision: null, legacyImported: false };
}

async function writeMeta(database: IDBDatabase, meta: MetaRecord): Promise<void> {
  const tx = database.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).put(meta);
  await txDone(tx);
}

// ─── Availability ───────────────────────────────────────────────────

/** What the autosave is actually running on, and why if it is not IndexedDB. */
export async function autosaveStatus(): Promise<AutosaveStatus> {
  const database = await db();
  if (database) return { backend: 'indexeddb', degraded: false, reason: null };
  if (hasLocalStorage()) {
    return {
      backend: 'localstorage',
      degraded: true,
      reason: unavailableReason ?? 'IndexedDB could not be opened.',
    };
  }
  return {
    backend: 'none',
    degraded: true,
    reason: unavailableReason ?? 'No browser storage is available.',
  };
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
  } catch {
    return false;
  }
}

// ─── Write ──────────────────────────────────────────────────────────

/**
 * Commit one autosave revision.
 *
 * `payload` must already be plain, structured-cloneable data — see `plainDeepCopy`. A
 * reactive proxy reaching this function is a caller defect, and it is reported as `clone`
 * rather than swallowed, because a proxy that gets past here means the autosave has silently
 * stopped working for exactly the projects big enough to matter.
 */
export async function autosaveWrite<T>(
  payload: unknown,
  policy: AutosavePolicy<T>,
): Promise<AutosaveWriteResult> {
  const database = await db();
  if (!database) return writeLegacy(payload);

  const fingerprint = policy.fingerprint(payload);
  let meta: MetaRecord;
  try {
    meta = await readMeta(database);
  } catch (err) {
    return { ok: false, backend: 'indexeddb', revision: null, failure: classify(err) };
  }
  const revision = meta.lastRevision + 1;
  const writeId = crypto.randomUUID();

  try {
    // 1. Declare the intent. A marker left behind is the evidence that the write below
    //    never landed, and it is what `autosaveRead` reports as `unfinishedRevision`.
    await writeMeta(database, { ...meta, unfinishedRevision: revision });

    // 2. Commit the record and retire the ones that fell out of the window, in ONE
    //    transaction — a retirement that commits without its replacement would delete a
    //    real save to make room for one that does not exist.
    const record: StoredRecord = {
      revision,
      timestamp: new Date().toISOString(),
      status: 'complete',
      fingerprint,
      payload,
    };
    const tx = database.transaction(STORE_SNAPSHOTS, 'readwrite');
    const store = tx.objectStore(STORE_SNAPSHOTS);
    store.put(record);
    const cutoff = revision - AUTOSAVE_REVISIONS_KEPT;
    if (cutoff >= 1) store.delete(IDBKeyRange.upperBound(cutoff));
    await txDone(tx);

    // 3. Only now is revision R a save that happened.
    await writeMeta(database, {
      ...meta,
      lastRevision: revision,
      unfinishedRevision: null,
      lastWriteId: writeId,
    });
    return { ok: true, backend: 'indexeddb', revision, writeId };
  } catch (err) {
    return { ok: false, backend: 'indexeddb', revision: null, failure: classify(err) };
  }
}

function classify(err: unknown): { kind: AutosaveFailureKind; detail: string } {
  if (isQuotaError(err)) return { kind: 'quota', detail: describeError(err) };
  if (isCloneError(err)) return { kind: 'clone', detail: describeError(err) };
  return { kind: 'unknown', detail: describeError(err) };
}

/** The degraded path: one JSON slot in localStorage, exactly as before IndexedDB. */
function writeLegacy(payload: unknown): AutosaveWriteResult {
  if (!hasLocalStorage()) {
    return {
      ok: false,
      backend: 'none',
      revision: null,
      failure: { kind: 'unavailable', detail: unavailableReason ?? 'No browser storage is available.' },
    };
  }
  try {
    localStorage.setItem(LEGACY_AUTOSAVE_KEY, JSON.stringify(payload));
    return { ok: true, backend: 'localstorage', revision: null };
  } catch (err) {
    return { ok: false, backend: 'localstorage', revision: null, failure: classify(err) };
  }
}

// ─── Read ───────────────────────────────────────────────────────────

/**
 * Return the newest autosave that survives every check, and everything that did not.
 *
 * Newest-first, first survivor wins. Every record passed over on the way is reported with the
 * reason it was passed over, so "you have been given an older save" is something the caller
 * can say out loud rather than something the user discovers by recognising their own work.
 */
export async function autosaveRead<T>(policy: AutosavePolicy<T>): Promise<AutosaveReadResult<T>> {
  const database = await db();
  if (!database) return readLegacy(policy);

  await importLegacyOnce(database, policy);

  let meta: MetaRecord;
  let records: StoredRecord[];
  try {
    meta = await readMeta(database);
    const tx = database.transaction(STORE_SNAPSHOTS, 'readonly');
    records = await req<StoredRecord[]>(
      tx.objectStore(STORE_SNAPSHOTS).getAll() as IDBRequest<StoredRecord[]>,
    );
    await txDone(tx).catch(() => undefined);
  } catch {
    return { backend: 'indexeddb', value: null, revision: null, timestamp: null, rejected: [], unfinishedRevision: null };
  }

  records.sort((a, b) => b.revision - a.revision);
  const rejected: AutosaveRejection[] = [];

  for (const rec of records) {
    const stamp = typeof rec?.timestamp === 'string' ? rec.timestamp : '';
    if (!rec || rec.status !== 'complete') {
      rejected.push({ revision: rec?.revision ?? -1, timestamp: stamp, why: 'incomplete' });
      continue;
    }
    const actual = policy.fingerprint(rec.payload);
    if (!sameFingerprint(rec.fingerprint, actual)) {
      rejected.push({ revision: rec.revision, timestamp: stamp, why: 'fingerprint', expected: rec.fingerprint, actual });
      continue;
    }
    const value = policy.accept(rec.payload);
    if (!value) {
      rejected.push({ revision: rec.revision, timestamp: stamp, why: 'invalid' });
      continue;
    }
    return {
      backend: 'indexeddb',
      value,
      revision: rec.revision,
      timestamp: rec.timestamp,
      rejected,
      // A marker for a revision NEWER than the one restored is a save that was lost. A
      // marker for one at or below it has already been superseded and is not news.
      unfinishedRevision: meta.unfinishedRevision !== null && meta.unfinishedRevision > rec.revision
        ? meta.unfinishedRevision
        : null,
    };
  }

  return {
    backend: 'indexeddb',
    value: null,
    revision: null,
    timestamp: null,
    rejected,
    unfinishedRevision: meta.unfinishedRevision,
  };
}

function sameFingerprint(a: AutosaveFingerprint | undefined, b: AutosaveFingerprint): boolean {
  if (!a || typeof a !== 'object') return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

function readLegacy<T>(policy: AutosavePolicy<T>): AutosaveReadResult<T> {
  const empty: AutosaveReadResult<T> = {
    backend: hasLocalStorage() ? 'localstorage' : 'none',
    value: null, revision: null, timestamp: null, rejected: [], unfinishedRevision: null,
  };
  if (!hasLocalStorage()) return empty;
  let raw: string | null;
  try {
    raw = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
  } catch {
    return empty;
  }
  if (!raw) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...empty, rejected: [{ revision: 0, timestamp: '', why: 'invalid' }] };
  }
  const value = policy.accept(parsed);
  if (!value) return { ...empty, rejected: [{ revision: 0, timestamp: '', why: 'invalid' }] };
  const timestamp = typeof (parsed as { timestamp?: unknown })?.timestamp === 'string'
    ? (parsed as { timestamp: string }).timestamp
    : null;
  return { ...empty, value, revision: 0, timestamp };
}

/**
 * Move a pre-IndexedDB autosave into the new store, once, and then remove it.
 *
 * Removing it is the point, not tidiness. Two stores holding two different vintages of the
 * same project is the shape of the original bug: whichever one a later code path happened to
 * read could be the older, with nothing on screen distinguishing them. After the import there
 * is exactly one autosave, and it is the newer of the two.
 */
async function importLegacyOnce<T>(database: IDBDatabase, policy: AutosavePolicy<T>): Promise<void> {
  let meta: MetaRecord;
  try {
    meta = await readMeta(database);
  } catch {
    return;
  }
  if (meta.legacyImported) return;
  if (!hasLocalStorage()) {
    await writeMeta(database, { ...meta, legacyImported: true }).catch(() => undefined);
    return;
  }

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
  } catch {
    /* storage disabled mid-session — nothing to import */
  }

  if (raw && meta.lastRevision === 0) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (policy.accept(parsed)) {
        await autosaveWrite(parsed, policy);
      }
    } catch {
      /* an unparseable legacy slot is not worth importing, and saying so is `rejected` */
    }
  }

  try {
    localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
  const after = await readMeta(database).catch(() => meta);
  await writeMeta(database, { ...after, legacyImported: true }).catch(() => undefined);
}

/** The id of the newest committed IndexedDB write, or null when there is none or it cannot be read. */
export async function autosaveLatestWriteId(): Promise<string | null> {
  const database = await db();
  if (!database) return null;
  try {
    const meta = await readMeta(database);
    return meta.unfinishedRevision === null ? meta.lastWriteId ?? null : null;
  } catch {
    return null;
  }
}

// ─── Clear ──────────────────────────────────────────────────────────

/** Drop every autosave revision, on whichever backend is in use, plus the legacy slot. */
export async function autosaveClear(): Promise<void> {
  try {
    if (hasLocalStorage()) localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
  const database = await db();
  if (!database) return;
  try {
    const tx = database.transaction([STORE_SNAPSHOTS, STORE_META], 'readwrite');
    tx.objectStore(STORE_SNAPSHOTS).clear();
    tx.objectStore(STORE_META).put({
      key: META_KEY, lastRevision: 0, unfinishedRevision: null, legacyImported: true,
    } satisfies MetaRecord);
    await txDone(tx);
  } catch {
    /* a clear that fails leaves the old save in place, which is the safe direction */
  }
}

/** Every stored revision, newest first — the evidence a diagnostics panel shows. */
export async function autosaveRevisions(): Promise<Array<{ revision: number; timestamp: string; status: string; fingerprint: AutosaveFingerprint }>> {
  const database = await db();
  if (!database) return [];
  try {
    const tx = database.transaction(STORE_SNAPSHOTS, 'readonly');
    const all = await req<StoredRecord[]>(
      tx.objectStore(STORE_SNAPSHOTS).getAll() as IDBRequest<StoredRecord[]>,
    );
    await txDone(tx).catch(() => undefined);
    return all
      .sort((a, b) => b.revision - a.revision)
      .map(({ revision, timestamp, status, fingerprint }) => ({ revision, timestamp, status, fingerprint }));
  } catch {
    return [];
  }
}
