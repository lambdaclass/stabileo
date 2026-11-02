import { isPlainObject } from './actions';
import { AiActionError } from './limits';
import { asF64, asU64, isSnapshot3d } from './snapshot-json';
import { supportTypesFor } from './registry';
import { lookupSection } from './sections';

type Entry = [id: number, data: Record<string, unknown>];

const MEMBER_FRAMES: readonly string[] = ['local', 'global', 'projected'];

const LOAD_TARGET: Record<string, 'node' | 'element'> = {
  nodal: 'node', nodal3d: 'node', displacement3d: 'node',
  distributed: 'element', distributed3d: 'element', pointOnElement: 'element', pointOnElement3d: 'element',
  thermal: 'element', prestress3d: 'element',
};

const MIN_LENGTH = 1e-6;

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
  const [rawId, data] = Array.isArray(entry) && entry.length >= 2 && isPlainObject(entry[1]) ? [entry[0], entry[1]]
    : isPlainObject(entry) ? [entry.id, entry] : [undefined, undefined];
  if (!data) throw new AiActionError(`invalid entry format: ${JSON.stringify(entry)}`);
  const id = asU64(rawId);
  if (id === undefined) throw new AiActionError(`invalid id ${JSON.stringify(rawId)}`);
  if (data.id !== undefined && asU64(data.id) !== id) throw new AiActionError(`entry ${id} carries a different id ${JSON.stringify(data.id)}`);
  return [id, data];
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

/** `existingModel`: the user's own model after an edit, which may hold entity kinds the AI never creates. */
export function validateSnapshot(snapshot: unknown, { existingModel = false } = {}): void {
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

  if (!existingModel && !(['2d', '3d'] as unknown[]).includes(snapshot.analysisMode)) {
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
    if (!existingModel && data.type !== 'frame' && data.type !== 'truss') throw new AiActionError(`element ${id}: type must be 'frame' or 'truss', not ${JSON.stringify(data.type)}`);
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
    if (!existingModel && (typeof data.type !== 'string' || !supportTypesFor(space).includes(data.type))) {
      throw new AiActionError(`support ${id}: unknown ${space ? '3D' : '2D'} support type ${JSON.stringify(data.type)}`);
    }
  }

  const coords = new Map<number, [number, number, number]>();
  for (const entry of nodes) {
    const [id, data] = parseEntry(entry);
    for (const key of ['x', 'y', 'z'] as const) {
      if (key === 'z' && (!space || existingModel) && data.z === undefined) continue;
      if (asF64(data[key]) === undefined) throw new AiActionError(`node ${id} has no finite ${key}`);
    }
    coords.set(id, [data.x as number, data.y as number, (data.z as number | undefined) ?? 0]);
  }

  for (const entry of elements) {
    const [id, data] = parseEntry(entry);
    const [a, b] = [coords.get(asU64(data.nodeI) ?? -1), coords.get(asU64(data.nodeJ) ?? -1)];
    if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < MIN_LENGTH) throw new AiActionError(`element ${id} has zero length`);
  }

  for (const entry of sections) {
    const [id, data] = parseEntry(entry);
    for (const key of ['a', 'iz'] as const) {
      const v = asF64(data[key]);
      if (v === undefined || v <= 0) throw new AiActionError(`section ${id}: ${key} must be a positive number`);
    }
    for (const key of ['iy', 'j'] as const) {
      if ((!space || existingModel) && data[key] === undefined) continue;
      const v = asF64(data[key]);
      if (v === undefined || v <= 0) throw new AiActionError(`section ${id}: ${key} must be a positive number`);
    }
    const listed = !existingModel && typeof data.name === 'string' ? lookupSection(data.name) : undefined;
    for (const key of ['a', 'iz', 'iy', 'j'] as const) {
      const v = asF64(data[key]);
      if (listed && v !== undefined && Math.abs(v - listed[key]) > 0.01 * listed[key]) {
        throw new AiActionError(`section ${id}: ${key} is not that of ${listed.name}; use the listed values or name the section "Custom (user values)"`);
      }
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
    if (typeof type !== 'string') throw new AiActionError(`unsupported load type: ${JSON.stringify(type)}`);
    if (!Object.hasOwn(LOAD_TARGET, type) || (!existingModel && !Object.hasOwn(LOAD_REQUIRED, type))) {
      if (existingModel) continue;
      throw new AiActionError(`unsupported load type: ${JSON.stringify(type)}`);
    }
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
    const frame = outer.data.frame;
    if (frame !== undefined && !(typeof frame === 'string' && MEMBER_FRAMES.includes(frame))) {
      throw new AiActionError(`${type} load: frame must be one of ${MEMBER_FRAMES.join(', ')}, got ${JSON.stringify(frame)}`);
    }
  }
}
