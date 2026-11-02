import { isSpaceProtocol } from './registry';
import { isPlainObject } from './actions';
import { AiActionError } from './limits';
import { lookupSection } from './sections';
import { sectionToJson } from './builder';

export type Json = Record<string, unknown>;

export const EPS = 1e-6;

export function at(v: unknown, key: string | number): unknown {
  if (typeof key === 'number') return Array.isArray(v) ? v[key] : undefined;
  return isPlainObject(v) ? v[key] : undefined;
}

export function asF64(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function asU64(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined;
}

export function asArray(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? v : undefined;
}

export function malformed(what: string): AiActionError {
  return new AiActionError(`snapshot is malformed: ${what}`);
}

export function entryData(entry: unknown): Json {
  const data = at(entry, 1);
  if (!isPlainObject(data)) throw malformed('entry is not an [id, object] pair');
  return data;
}

export interface NodeCoord {
  x: number;
  y: number;
  z?: number;
}

export function isSnapshot3d(snap: Json): boolean {
  return isSpaceProtocol(snap.analysisMode);
}

const ID_COLLECTION: Record<string, string> = {
  node: 'nodes', element: 'elements', material: 'materials', section: 'sections', support: 'supports', load: 'loads',
};

function entryId(entry: unknown): number | undefined {
  if (Array.isArray(entry)) return asU64(entry[0]);
  return asU64(at(at(entry, 'data'), 'id')) ?? asU64(at(entry, 'id'));
}

function maxUsedId(snap: Json, key: string): number {
  let max = 0;
  for (const entry of asArray(snap[ID_COLLECTION[key]]) ?? []) max = Math.max(max, entryId(entry) ?? 0);
  return max;
}

export function nextId(snap: Json, key: string): number {
  if (!isPlainObject(snap.nextId)) snap.nextId = {};
  const counters = snap.nextId as Json;
  const next = Math.max(asU64(counters[key]) ?? 1, maxUsedId(snap, key) + 1);
  counters[key] = next + 1;
  return next;
}

export function nodes(snap: Json): unknown[] {
  return asArray(snap.nodes) ?? [];
}

export function elements(snap: Json): unknown[] {
  return asArray(snap.elements) ?? [];
}

export function getNodeCoords(snap: Json, nodeId: number): NodeCoord | undefined {
  for (const entry of nodes(snap)) {
    if (asU64(at(entry, 0)) === nodeId) {
      const data = at(entry, 1);
      const x = asF64(at(data, 'x'));
      const y = asF64(at(data, 'y'));
      if (x === undefined || y === undefined) return undefined;
      return { x, y, z: asF64(at(data, 'z')) };
    }
  }
  return undefined;
}

function sortedDistinct(values: number[]): number[] {
  values.sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of values) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) >= EPS) out.push(v);
  }
  return out;
}

export function columnLines(snap: Json): number[] {
  return sortedDistinct(nodes(snap).map((n) => asF64(at(at(n, 1), 'x'))).filter((v): v is number => v !== undefined));
}

export function floorLevels(snap: Json): number[] {
  const key = isSnapshot3d(snap) ? 'z' : 'y';
  return sortedDistinct(nodes(snap).map((n) => asF64(at(at(n, 1), key))).filter((v): v is number => v !== undefined));
}

export function findNodeAt(snap: Json, x: number, y: number): number | undefined {
  for (const n of nodes(snap)) {
    const nx = asF64(at(at(n, 1), 'x'));
    const ny = asF64(at(at(n, 1), 'y'));
    if (nx === undefined || ny === undefined) continue;
    if (Math.abs(nx - x) < EPS && Math.abs(ny - y) < EPS) {
      const id = asU64(at(n, 0));
      if (id !== undefined) return id;
    }
  }
  return undefined;
}

export function findNodeAt3d(snap: Json, x: number, y: number, z: number): number | undefined {
  for (const n of nodes(snap)) {
    const d = at(n, 1);
    const nx = asF64(at(d, 'x'));
    const ny = asF64(at(d, 'y'));
    const nz = asF64(at(d, 'z'));
    if (nx === undefined || ny === undefined || nz === undefined) continue;
    if (Math.abs(nx - x) < EPS && Math.abs(ny - y) < EPS && Math.abs(nz - z) < EPS) {
      const id = asU64(at(n, 0));
      if (id !== undefined) return id;
    }
  }
  return undefined;
}

export function arrayMut(snap: Json, key: string): unknown[] {
  if (!(key in snap)) snap[key] = [];
  const arr = snap[key];
  if (!Array.isArray(arr)) throw new AiActionError(`snapshot.${key} must be an array`);
  return arr;
}

function runsLeftward(snap: Json, elementId: number): boolean {
  const entry = elements(snap).find((e) => asU64(at(e, 0)) === elementId);
  const ni = asU64(at(at(entry, 1), 'nodeI'));
  const nj = asU64(at(at(entry, 1), 'nodeJ'));
  const a = ni === undefined ? undefined : getNodeCoords(snap, ni);
  const b = nj === undefined ? undefined : getNodeCoords(snap, nj);
  if (!a || !b) throw malformed(`element ${elementId} has no end coordinates`);
  return b.x < a.x;
}

export function addDistributedLoadToSnap(snap: Json, elementId: number, q: number): void {
  const id = nextId(snap, 'load');
  const space = isSnapshot3d(snap);
  const q2d = !space && runsLeftward(snap, elementId) ? -q : q;
  const load = space
    ? { type: 'distributed3d', data: { id, elementId, qYI: 0, qYJ: 0, qZI: q, qZJ: q, frame: 'global' } }
    : { type: 'distributed', data: { id, elementId, qI: q2d, qJ: q2d } };
  arrayMut(snap, 'loads').push(load);
}

function firstId(snap: Json, key: string): number {
  const first = asArray(snap[key])?.[0];
  return asU64(at(first, 0)) ?? 1;
}

export const firstSectionId = (snap: Json): number => firstId(snap, 'sections');
export const firstMaterialId = (snap: Json): number => firstId(snap, 'materials');

export function addNodeToSnap(snap: Json, x: number, y: number, z?: number): number {
  const id = nextId(snap, 'node');
  arrayMut(snap, 'nodes').push(z !== undefined ? [id, { id, x, y, z }] : [id, { id, x, y }]);
  return id;
}

export function addElementToSnap(snap: Json, nodeI: number, nodeJ: number, materialId: number, sectionId: number): number {
  const id = nextId(snap, 'element');
  arrayMut(snap, 'elements').push([id, {
    id, type: 'frame', nodeI, nodeJ, materialId, sectionId, hingeStart: false, hingeEnd: false,
  }]);
  return id;
}

export function cloneElementToSnap(snap: Json, source: unknown, nodeI: number, nodeJ: number): number {
  if (!isPlainObject(source)) throw malformed('element data is not an object');
  const id = nextId(snap, 'element');
  const data: Json = { ...structuredClone(source), id, nodeI, nodeJ };
  arrayMut(snap, 'elements').push([id, data]);
  return id;
}

export function addSupportToSnap(snap: Json, nodeId: number, type: string): number {
  const id = nextId(snap, 'support');
  arrayMut(snap, 'supports').push([id, { id, nodeId, type }]);
  return id;
}

const close = (v: unknown, want: number): boolean => {
  const x = asF64(v);
  return x !== undefined && Math.abs(x - want) <= 0.01 * want;
};

export function ensureSection(snap: Json, name: string): number {
  const props = lookupSection(name);
  for (const s of asArray(snap.sections) ?? []) {
    const data = at(s, 1);
    if (at(data, 'name') !== name) continue;
    if (!props || (['a', 'iz', 'iy', 'j'] as const).every((k) => at(data, k) === undefined || close(at(data, k), props[k]))) {
      return asU64(at(s, 0)) ?? 1;
    }
  }
  if (!props) throw new AiActionError(`Unknown section '${name}'`);
  const id = nextId(snap, 'section');
  arrayMut(snap, 'sections').push(sectionToJson(id, props));
  return id;
}
