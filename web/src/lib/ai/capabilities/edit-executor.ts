import { isPlainObject, type BuildAction } from './actions';
import { addBay, addStory } from './edit-grow';
import { AiActionError } from './limits';
import { supportTypesFor } from './registry';
import {
  EPS, type Json, addDistributedLoadToSnap, arrayMut, asArray, asF64, asU64, at, columnLines,
  elements, ensureSection, findNodeAt, floorLevels, getNodeCoords, isSnapshot3d,
  nextId, nodes,
} from './snapshot-json';

const COLLECTIONS = ['nodes', 'elements', 'materials', 'sections', 'supports', 'loads'] as const;

export function applyEdit(action: BuildAction, snapshot: unknown): Json {
  if (!isPlainObject(snapshot)) throw new AiActionError('snapshot must be a JSON object');
  for (const key of COLLECTIONS) {
    if (snapshot[key] !== undefined && !Array.isArray(snapshot[key])) {
      throw new AiActionError(`snapshot.${key} must be an array`);
    }
  }
  const snap = JSON.parse(JSON.stringify(snapshot)) as Json;

  switch (action.action) {
    case 'add_bay': {
      const p = action.params;
      addBay(snap, p.width, p.side, p.beam_section, p.column_section);
      break;
    }
    case 'add_story': {
      const p = action.params;
      addStory(snap, p.height, p.beam_section, p.column_section);
      break;
    }
    case 'change_section': {
      const p = action.params;
      changeSection(snap, p.section, p.element_ids, p.element_filter);
      break;
    }
    case 'set_all_supports': setAllSupports(snap, action.params.support_type); break;
    case 'set_all_beam_loads': setAllBeamLoads(snap, action.params.q); break;
    case 'add_lateral_loads': addLateralLoads(snap, action.params.h); break;
    case 'add_distributed_load': addDistributedLoad(snap, action.params.element_id, action.params.q); break;
    case 'add_nodal_load': {
      const p = action.params;
      addNodalLoad(snap, p);
      break;
    }
    case 'delete_element': deleteElement(snap, action.params.element_id); break;
    case 'delete_load': deleteLoad(snap, action.params.load_id); break;
    default:
      throw new AiActionError('Action is not an edit action');
  }
  return snap;
}

function isHorizontalElement(snap: Json, data: unknown): boolean {
  const ci = getNodeCoords(snap, asU64(at(data, 'nodeI')) ?? 0);
  const cj = getNodeCoords(snap, asU64(at(data, 'nodeJ')) ?? 0);
  if (!ci || !cj) return false;
  return isSnapshot3d(snap)
    ? Math.abs((ci.z ?? 0) - (cj.z ?? 0)) < EPS
    : Math.abs(ci.y - cj.y) < EPS;
}

function isVerticalElement(snap: Json, data: unknown): boolean {
  const ci = getNodeCoords(snap, asU64(at(data, 'nodeI')) ?? 0);
  const cj = getNodeCoords(snap, asU64(at(data, 'nodeJ')) ?? 0);
  if (!ci || !cj) return false;
  return Math.abs(ci.x - cj.x) < EPS && (!isSnapshot3d(snap) || Math.abs(ci.y - cj.y) < EPS);
}

const FILTERS = new Set(['beam', 'beams', 'column', 'columns']);

function changeSection(snap: Json, name: string, ids?: number[], filter?: string): void {
  const elems = asArray(snap.elements);
  if (!elems) throw new AiActionError('No elements in model');
  if (ids === undefined && filter !== undefined && !FILTERS.has(filter)) {
    throw new AiActionError(`Unknown element_filter '${filter}': use 'beam' or 'column'`);
  }
  const existing = new Set(elems.map((e) => asU64(at(e, 0))));
  const missing = ids?.filter((id) => !existing.has(id)) ?? [];
  if (missing.length > 0) throw new AiActionError(`Element ${missing.join(', ')} not found`);
  const secId = ensureSection(snap, name);
  const targets = new Set<number>();
  for (const elem of elems) {
    const eid = asU64(at(elem, 0));
    if (eid === undefined) continue;
    let matches = true;
    if (ids !== undefined) matches = ids.includes(eid);
    else if (filter === 'beam' || filter === 'beams') matches = isHorizontalElement(snap, at(elem, 1));
    else if (filter === 'column' || filter === 'columns') matches = isVerticalElement(snap, at(elem, 1));
    if (matches) targets.add(eid);
  }
  if (targets.size === 0) throw new AiActionError('No element matches the section change');
  for (const elem of elems) {
    if (!targets.has(asU64(at(elem, 0)) ?? 0)) continue;
    const data = at(elem, 1);
    if (!isPlainObject(data)) throw new AiActionError('snapshot is malformed: element data is not an object');
    data.sectionId = secId;
  }
}

function setAllSupports(snap: Json, type: string): void {
  const supports = asArray(snap.supports);
  if (!supports) throw new AiActionError('No supports in model');
  const space = isSnapshot3d(snap);
  if (!supportTypesFor(space).includes(type)) throw new AiActionError(`Unknown ${space ? '3D' : '2D'} support type '${type}'`);
  for (const s of supports) {
    const data = at(s, 1);
    if (!isPlainObject(data)) throw new AiActionError('snapshot is malformed: support data is not an object');
    data.type = type;
  }
}

function setAllBeamLoads(snap: Json, q: number): void {
  const beams = new Set(
    elements(snap).filter((e) => isHorizontalElement(snap, at(e, 1))).map((e) => asU64(at(e, 0)) ?? 0),
  );
  if (beams.size === 0) throw new AiActionError('No beams in model');
  const loads = asArray(snap.loads);
  if (loads) {
    snap.loads = loads.filter((l) => {
      const t = at(l, 'type');
      if (t !== 'distributed' && t !== 'distributed3d') return true;
      return !beams.has(asU64(at(at(l, 'data'), 'elementId')) ?? -1);
    });
  }
  for (const eid of beams) addDistributedLoadToSnap(snap, eid, q);
}

function addLateralLoads(snap: Json, h: number): void {
  const cols = columnLines(snap);
  const floors = floorLevels(snap);
  if (cols.length === 0 || floors.length < 2) {
    throw new AiActionError('Cannot add lateral loads: need at least 2 floor levels');
  }
  const leftX = cols[0];
  if (isSnapshot3d(snap)) {
    for (const z of floors.slice(1)) {
      const face = nodes(snap).filter((n) => {
        const x = asF64(at(at(n, 1), 'x'));
        const nz = asF64(at(at(n, 1), 'z'));
        return x !== undefined && nz !== undefined && Math.abs(x - leftX) < EPS && Math.abs(nz - z) < EPS;
      });
      if (face.length === 0) throw new AiActionError(`Cannot add lateral loads: no node at x=${leftX}, z=${z}`);
      for (const n of face) {
        const id = nextId(snap, 'load');
        arrayMut(snap, 'loads').push({ type: 'nodal3d', data: { id, nodeId: asU64(at(n, 0)), fx: h / face.length, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } });
      }
    }
  } else {
    for (const y of floors.slice(1)) {
      const nodeId = findNodeAt(snap, leftX, y);
      if (nodeId === undefined) throw new AiActionError(`Cannot add lateral loads: no node at x=${leftX}, y=${y}`);
      const id = nextId(snap, 'load');
      arrayMut(snap, 'loads').push({ type: 'nodal', data: { id, nodeId, fx: h, fz: 0, my: 0 } });
    }
  }
}

function addDistributedLoad(snap: Json, elementId: number, q: number): void {
  if (!elements(snap).some((e) => asU64(at(e, 0)) === elementId)) {
    throw new AiActionError(`Element ${elementId} not found`);
  }
  addDistributedLoadToSnap(snap, elementId, q);
}

type NodalParams = Extract<BuildAction, { action: 'add_nodal_load' }>['params'];

function planar(p: NodalParams): { fx: number; fz: number; my: number } {
  if (p.mx !== undefined) throw new AiActionError('mx does not exist in a 2D model');
  if (p.fy !== undefined && p.fz !== undefined) throw new AiActionError('give fz or fy, not both, in a 2D model');
  if (p.mz !== undefined && p.my !== undefined) throw new AiActionError('give my or mz, not both, in a 2D model');
  return { fx: p.fx ?? 0, fz: p.fz ?? p.fy ?? 0, my: p.my ?? p.mz ?? 0 };
}

function addNodalLoad(snap: Json, p: NodalParams): void {
  const nodeId = p.node_id;
  if (!nodes(snap).some((n) => asU64(at(n, 0)) === nodeId)) {
    throw new AiActionError(`Node ${nodeId} not found`);
  }
  const data = isSnapshot3d(snap)
    ? { fx: p.fx ?? 0, fy: p.fy ?? 0, fz: p.fz ?? 0, mx: p.mx ?? 0, my: p.my ?? 0, mz: p.mz ?? 0 }
    : planar(p);
  const id = nextId(snap, 'load');
  arrayMut(snap, 'loads').push({ type: isSnapshot3d(snap) ? 'nodal3d' : 'nodal', data: { id, nodeId, ...data } });
}

function deleteElement(snap: Json, elementId: number): void {
  const elems = asArray(snap.elements);
  if (!elems) throw new AiActionError('No elements in model');
  const kept = elems.filter((e) => asU64(at(e, 0)) !== elementId);
  if (kept.length === elems.length) throw new AiActionError(`Element ${elementId} not found`);
  snap.elements = kept;
  const loads = asArray(snap.loads);
  if (loads) snap.loads = loads.filter((l) => asU64(at(at(l, 'data'), 'elementId')) !== elementId);
}

function deleteLoad(snap: Json, loadId: number): void {
  const loads = asArray(snap.loads);
  if (!loads) throw new AiActionError('No loads in model');
  const kept = loads.filter((l) => asU64(at(at(l, 'data'), 'id')) !== loadId);
  if (kept.length === loads.length) throw new AiActionError(`Load ${loadId} not found`);
  snap.loads = kept;
}
