import { isPlainObject } from './actions';
import { AiActionError } from './limits';
import { asF64, asU64 } from './snapshot-json';

type Entry = [id: number, data: Record<string, unknown>];

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

export function validateSnapshot(snapshot: unknown): string[] {
  const warnings: string[] = [];
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

  const nodeIds = collectIds(nodes, 'node');
  const elemIds = collectIds(elements, 'element');
  const matIds = collectIds(materials, 'material');
  const secIds = collectIds(sections, 'section');
  collectIds(supports, 'support');

  for (const entry of elements) {
    const [id, data] = parseEntry(entry);
    const refs: Array<[string, Set<number>]> = [['nodeI', nodeIds], ['nodeJ', nodeIds], ['sectionId', secIds], ['materialId', matIds]];
    for (const [key, set] of refs) {
      const ref = asU64(data[key]);
      if (ref !== undefined && !set.has(ref)) {
        throw new AiActionError(`element ${id} references non-existent ${key}=${ref}`);
      }
    }
  }

  for (const entry of supports) {
    const [id, data] = parseEntry(entry);
    const nid = asU64(data.nodeId);
    if (nid !== undefined && !nodeIds.has(nid)) {
      throw new AiActionError(`support ${id} references non-existent nodeId=${nid}`);
    }
  }

  for (const entry of sections) {
    const [id, data] = parseEntry(entry);
    const a = asF64(data.a);
    if (a !== undefined && a <= 0) warnings.push(`section ${id}: area (a) should be positive`);
    const iz = asF64(data.iz);
    if (iz !== undefined && iz <= 0) warnings.push(`section ${id}: moment of inertia (iz) should be positive`);
  }

  for (const entry of materials) {
    const [id, data] = parseEntry(entry);
    const e = asF64(data.e);
    if (e !== undefined && e <= 0) {
      throw new AiActionError(`material ${id}: elastic modulus (e) must be positive`);
    }
  }

  const loads = snapshot.loads;
  if (Array.isArray(loads)) {
    for (const load of loads) {
      const outer = Array.isArray(load) ? load[1] : load;
      if (!isPlainObject(outer) || !isPlainObject(outer.data)) continue;
      const eid = asU64(outer.data.elementId);
      if (eid !== undefined && !elemIds.has(eid)) warnings.push(`load references non-existent elementId=${eid}`);
      const nid = asU64(outer.data.nodeId);
      if (nid !== undefined && !nodeIds.has(nid)) warnings.push(`load references non-existent nodeId=${nid}`);
    }
  }

  return warnings;
}
