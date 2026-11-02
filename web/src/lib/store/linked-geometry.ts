/**
 * The 3D shape of each linked IFC, kept in this browser by the file's hash. The project holds the
 * link and its counts; the meshes are too large for the project file, so a project opened on
 * another computer asks for the file again.
 */
import type { IfcReference } from '../ifc/ifc-reference';

const DB = 'stabileo-linked';
const STORE = 'geometry';
const memory = new Map<string, IfcReference>();

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
  });
}

export async function fileHash(data: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Keep a file's shape. Kept in memory for the session even when the browser has no storage. */
export async function keepLinkedGeometry(hash: string, ref: IfcReference): Promise<boolean> {
  memory.set(hash, ref);
  const db = await open();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(ref, hash);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); resolve(false); };
    tx.onabort = () => { db.close(); resolve(false); };
  });
}

export async function linkedGeometry(hash: string): Promise<IfcReference | null> {
  const m = memory.get(hash);
  if (m) return m;
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(hash);
    r.onsuccess = () => { db.close(); const v = (r.result as IfcReference | undefined) ?? null; if (v) memory.set(hash, v); resolve(v); };
    r.onerror = () => { db.close(); resolve(null); };
  });
}

export async function dropLinkedGeometry(hash: string): Promise<void> {
  memory.delete(hash);
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(hash);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

/** Test seam. */
export function forgetLinkedGeometryCache(): void { memory.clear(); }
