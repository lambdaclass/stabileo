import { isPlainObject } from './actions';
import { AiActionError } from './limits';
import { asF64, asU64, isSnapshot3d } from './snapshot-json';
import { supportTypesFor } from './registry';

type Entry = [id: number, data: Record<string, unknown>];

const LOAD_TARGET: Record<string, 'node' | 'element'> = {
  nodal: 'node', nodal3d: 'node', displacement3d: 'node',
  distributed: 'element', distributed3d: 'element', pointOnElement: 'element', pointOnElement3d: 'element',
  thermal: 'element', prestress3d: 'element',
};

const LOAD_SPACE: Record<string, boolean> = {
  nodal: false, distributed: false, pointOnElement: false, thermal: false,
  nodal3d: true, distributed3d: true, pointOnElement3d: true, displacement3d: true, prestress3d: true,
};

const LOAD_REQUIRED: Record<string, readonly string[]> = {
  nodal: ['fx', 'fz', 'my'],
  distributed: ['qI', 'qJ'],
  nodal3d: ['fx', 'fy', 'fz', 'mx', 'my', 'mz'],
  distributed3d: ['qYI', 'qYJ', 'qZI', 'qZJ'],
};

function getArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  if (!Array.isArray(v)) throw new AiActionError(`missing or invalid '${key}' array`);
  return v;
}

function parseEntry(entry: unknown): Entry {
  if (Array.isArray(entry) && entry.length >= 2 && isPlainObject(entry[1])) {
    return [asU64(entry[0]) ?? 0, entry[1]];
  }
  if (isPlainObject(entry)) return [asU64(entry.id) ?? 0, entry];
  throw new AiActionError(`invalid entry format: ${JSON.stringify(entry)}`);
}

function collectIds(entries: unknown[], entity: string): Set<number> {
  const ids = new Set<number>();
  for (const entry of entries) {
    const [id] = parseEntry(entry);
    if (ids.has(id)) throw new AiActionError(`duplicate ${entity} id: ${id}`);
    ids.add(id);
  }
  return ids;
}

export function validateSnapshot(snapshot: unknown): void {
  if (!isPlainObject(snapshot)) throw new AiActionError('snapshot must be a JSON object');

  const nodes = getArray(snapshot, 'nodes');
  const elements = getArray(snapshot, 'elements');
  const materials = getArray(snapshot, 'materials');
  const sections = getArray(snapshot, 'sections');
  const supports = getArray(snapshot, 'supports');

  if (nodes.length === 0) throw new AiActionError('nodes must not be empty');
  if (elements.length === 0) throw new AiActionError('elements must not be empty');
  if (supports.length === 0) throw new AiActionError('at least one support is required for stability');
  if (materials.length === 0) throw new AiActionError('materials must not be empty');
  if (sections.length === 0) throw new AiActionError('sections must not be empty');

  if (snapshot.analysisMode !== '2d' && snapshot.analysisMode !== '3d') {
    throw new AiActionError(`analysisMode must be '2d' or '3d', not ${JSON.stringify(snapshot.analysisMode)}`);
  }
  const space = isSnapshot3d(snapshot);
  const nodeIds = collectIds(nodes, 'node');
  const elemIds = collectIds(elements, 'element');
  const matIds = collectIds(materials, 'material');
  const secIds = collectIds(sections, 'section');
  collectIds(supports, 'support');

  for (const entry of elements) {
    const [id, data] = parseEntry(entry);
    if (data.type !== 'frame' && data.type !== 'truss') throw new AiActionError(`element ${id}: type must be 'frame' or 'truss', not ${JSON.stringify(data.type)}`);
    if (data.nodeI === data.nodeJ) throw new AiActionError(`element ${id} starts and ends at the same node`);
    const refs: Array<[string, Set<number>]> = [['nodeI', nodeIds], ['nodeJ', nodeIds], ['sectionId', secIds], ['materialId', matIds]];
    for (const [key, set] of refs) {
      const ref = asU64(data[key]);
      if (ref === undefined) throw new AiActionError(`element ${id} has no valid ${key}`);
      if (!set.has(ref)) throw new AiActionError(`element ${id} references non-existent ${key}=${ref}`);
    }
  }

  for (const entry of supports) {
    const [id, data] = parseEntry(entry);
    const nid = asU64(data.nodeId);
    if (nid === undefined) throw new AiActionError(`support ${id} has no valid nodeId`);
    if (!nodeIds.has(nid)) throw new AiActionError(`support ${id} references non-existent nodeId=${nid}`);
    if (typeof data.type !== 'string' || !supportTypesFor(space).includes(data.type)) {
      throw new AiActionError(`support ${id}: unknown ${space ? '3D' : '2D'} support type ${JSON.stringify(data.type)}`);
    }
  }

  for (const entry of nodes) {
    const [id, data] = parseEntry(entry);
    for (const key of ['x', 'y', 'z'] as const) {
      if (key === 'z' && !space && data.z === undefined) continue;
      if (asF64(data[key]) === undefined) throw new AiActionError(`node ${id} has no finite ${key}`);
    }
  }

  for (const entry of sections) {
    const [id, data] = parseEntry(entry);
    for (const key of ['a', 'iz'] as const) {
      const v = asF64(data[key]);
      if (v === undefined || v <= 0) throw new AiActionError(`section ${id}: ${key} must be a positive number`);
    }
    for (const key of ['iy', 'j'] as const) {
      if (!space && data[key] === undefined) continue;
      const v = asF64(data[key]);
      if (v === undefined || v <= 0) throw new AiActionError(`section ${id}: ${key} must be a positive number`);
    }
  }

  for (const entry of materials) {
    const [id, data] = parseEntry(entry);
    const e = asF64(data.e);
    if (e === undefined || e <= 0) {
      throw new AiActionError(`material ${id}: elastic modulus (e) must be positive`);
    }
    if (data.nu !== undefined) {
      const nu = asF64(data.nu);
      if (nu === undefined || nu < 0 || nu >= 0.5) throw new AiActionError(`material ${id}: Poisson's ratio (nu) must be at least 0 and below 0.5`);
    }
  }

  const loads = snapshot.loads ?? [];
  if (!Array.isArray(loads)) throw new AiActionError("invalid 'loads': must be an array");
  const loadIds = new Set<number>();
  for (const load of loads) {
    const outer = Array.isArray(load) ? load[1] : load;
    if (!isPlainObject(outer) || !isPlainObject(outer.data)) throw new AiActionError(`invalid load: ${JSON.stringify(load)}`);
    const loadId = asU64(outer.data.id);
    if (loadId === undefined) throw new AiActionError(`load has no valid id: ${JSON.stringify(outer.data.id)}`);
    if (loadIds.has(loadId)) throw new AiActionError(`duplicate load id: ${loadId}`);
    loadIds.add(loadId);
    const type = outer.type;
    if (typeof type !== 'string' || !Object.hasOwn(LOAD_TARGET, type)) throw new AiActionError(`unsupported load type: ${JSON.stringify(type)}`);
    if (LOAD_SPACE[type] !== space) throw new AiActionError(`${type} load does not belong in a ${space ? '3D' : '2D'} model`);
    const onNode = LOAD_TARGET[type] === 'node';
    const key = onNode ? 'nodeId' : 'elementId';
    const ids = onNode ? nodeIds : elemIds;
    const ref = asU64(outer.data[key]);
    if (ref === undefined) throw new AiActionError(`${type} load has no valid ${key}`);
    if (!ids.has(ref)) throw new AiActionError(`load references non-existent ${key}=${ref}`);
    for (const key of LOAD_REQUIRED[type] ?? []) {
      if (asF64(outer.data[key]) === undefined) throw new AiActionError(`${type} load has no finite ${key}`);
    }
    for (const [key, v] of Object.entries(outer.data)) {
      if (typeof v === 'number' && !Number.isFinite(v)) throw new AiActionError(`${type} load: ${key} is not finite`);
    }
  }
}
