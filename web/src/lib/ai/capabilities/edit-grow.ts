import {
  EPS, type Json, type NodeCoord, addElementToSnap, addNodeToSnap, addSupportToSnap, asU64, at,
  cloneElementToSnap, columnLines, elements, ensureSection, entryData, findNodeAt, findNodeAt3d,
  firstMaterialId, firstSectionId, floorLevels, getNodeCoords, isSnapshot3d, malformed, nodes,
} from './snapshot-json';
import { AiActionError } from './limits';

const near = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

function nodeRefs(data: Json): [number, number] {
  const ni = asU64(data.nodeI);
  const nj = asU64(data.nodeJ);
  if (ni === undefined || nj === undefined) throw malformed('element without numeric nodeI/nodeJ');
  return [ni, nj];
}

function coordsOf(snap: Json, id: number): NodeCoord {
  const c = getNodeCoords(snap, id);
  if (!c) throw malformed(`element references node ${id}, which has no coordinates`);
  return c;
}

function mapped(map: Map<number, number>, id: number): number {
  const v = map.get(id);
  if (v === undefined) throw malformed(`node ${id} could not be mapped`);
  return v;
}

function nodesWhere(snap: Json, pred: (c: NodeCoord) => boolean): Array<[number, NodeCoord]> {
  const out: Array<[number, NodeCoord]> = [];
  for (const n of nodes(snap)) {
    const id = asU64(at(n, 0));
    if (id === undefined) continue;
    const c = getNodeCoords(snap, id);
    if (c && pred(c)) out.push([id, c]);
  }
  return out;
}

export function addBay(snap: Json, width: number, side?: string, beamSection?: string, columnSection?: string): void {
  if (isSnapshot3d(snap)) return addBay3d(snap, width, side, beamSection, columnSection);
  const cols = columnLines(snap);
  const floors = floorLevels(snap);
  if (cols.length === 0 || floors.length < 2) {
    throw new AiActionError('Cannot add bay: model needs at least 2 floor levels');
  }
  const s = side ?? 'right';
  const newX = s === 'left' ? cols[0] - width : cols[cols.length - 1] + width;
  const matId = firstMaterialId(snap);
  const beamSecId = beamSection !== undefined ? ensureSection(snap, beamSection) : firstSectionId(snap);
  const colSecId = columnSection !== undefined ? ensureSection(snap, columnSection) : firstSectionId(snap);
  const adjX = s === 'left' ? cols[0] : cols[cols.length - 1];

  let prev: number | undefined;
  floors.forEach((y, i) => {
    const nodeId = addNodeToSnap(snap, newX, y);
    if (prev !== undefined) addElementToSnap(snap, prev, nodeId, matId, colSecId);
    if (i > 0) {
      const adj = findNodeAt(snap, adjX, y);
      if (adj !== undefined) addElementToSnap(snap, adj, nodeId, matId, beamSecId);
    }
    if (i === 0) addSupportToSnap(snap, nodeId, 'fixed');
    prev = nodeId;
  });
}

function addBay3d(snap: Json, width: number, side?: string, beamSection?: string, columnSection?: string): void {
  const xs = columnLines(snap);
  if (xs.length < 2) throw new AiActionError('Cannot add bay: 3D model needs at least 2 x-grid lines');
  const left = (side ?? 'right') === 'left';
  const last = xs.length - 1;
  const [outerX, innerX, newX] = left ? [xs[0], xs[1], xs[0] - width] : [xs[last], xs[last - 1], xs[last] + width];
  const baseZ = floorLevels(snap)[0] ?? 0;
  const beamOverride = beamSection !== undefined ? ensureSection(snap, beamSection) : undefined;
  const colOverride = columnSection !== undefined ? ensureSection(snap, columnSection) : undefined;

  const outerFace = nodesWhere(snap, (c) => near(c.x, outerX));
  const nodeMap = new Map<number, number>();
  for (const [oldId, c] of outerFace) {
    const newId = addNodeToSnap(snap, newX, c.y, c.z);
    if (c.z !== undefined && near(c.z, baseZ)) addSupportToSnap(snap, newId, 'fixed3d');
    nodeMap.set(oldId, newId);
  }

  for (const entry of [...elements(snap)]) {
    const elem = entryData(entry);
    const [ni, nj] = nodeRefs(elem);
    const ci = coordsOf(snap, ni);
    const cj = coordsOf(snap, nj);
    let pair: [number, number] | undefined;
    if (near(ci.x, outerX) && near(cj.x, outerX)) {
      pair = [mapped(nodeMap, ni), mapped(nodeMap, nj)];
    } else if ((near(ci.x, innerX) && near(cj.x, outerX)) || (near(ci.x, outerX) && near(cj.x, innerX))) {
      const oldOuter = near(ci.x, outerX) ? ni : nj;
      const oldInner = oldOuter === ni ? nj : ni;
      const inner = coordsOf(snap, oldInner);
      if (inner.z === undefined) throw malformed(`node ${oldInner} has no z in a 3D model`);
      const shiftedOuter = findNodeAt3d(snap, outerX, inner.y, inner.z);
      if (shiftedOuter === undefined) throw malformed(`no node on the outer face at y=${inner.y}, z=${inner.z}`);
      pair = [shiftedOuter, mapped(nodeMap, oldOuter)];
    }
    if (pair) {
      const cloned: Json = { ...elem };
      const secId = near(ci.z ?? 0, cj.z ?? 0) ? beamOverride : colOverride;
      if (secId !== undefined) cloned.sectionId = secId;
      cloneElementToSnap(snap, cloned, pair[0], pair[1]);
    }
  }
}

export function addStory(snap: Json, height: number, beamSection?: string, columnSection?: string): void {
  if (floorLevels(snap).length === 0) throw new AiActionError('Cannot add story: model has no nodes');
  if (isSnapshot3d(snap)) addStory3d(snap, height, beamSection, columnSection);
  else addStory2d(snap, height, beamSection, columnSection);
}

function addStory2d(snap: Json, height: number, beamSection?: string, columnSection?: string): void {
  const cols = columnLines(snap);
  const floors = floorLevels(snap);
  if (cols.length === 0 || floors.length === 0) throw new AiActionError('Cannot add story: model has no nodes');
  const topY = floors[floors.length - 1];
  const newY = topY + height;
  const matId = firstMaterialId(snap);
  const beamSecId = beamSection !== undefined ? ensureSection(snap, beamSection) : firstSectionId(snap);
  const colSecId = columnSection !== undefined ? ensureSection(snap, columnSection) : firstSectionId(snap);

  const newIds: number[] = [];
  for (const x of cols) {
    const newNode = addNodeToSnap(snap, x, newY);
    newIds.push(newNode);
    const topNode = findNodeAt(snap, x, topY);
    if (topNode !== undefined) addElementToSnap(snap, topNode, newNode, matId, colSecId);
  }
  for (let i = 0; i + 1 < newIds.length; i++) {
    addElementToSnap(snap, newIds[i], newIds[i + 1], matId, beamSecId);
  }
}

function addStory3d(snap: Json, height: number, beamSection?: string, columnSection?: string): void {
  const floors = floorLevels(snap);
  if (floors.length === 0) throw new AiActionError('Cannot add story: model has no floor levels');
  const topZ = floors[floors.length - 1];
  const newZ = topZ + height;
  const beamOverride = beamSection !== undefined ? ensureSection(snap, beamSection) : undefined;
  const colOverride = columnSection !== undefined ? ensureSection(snap, columnSection) : undefined;

  const atTop = (c: NodeCoord): boolean => c.z !== undefined && near(c.z, topZ);
  const topNodes = nodesWhere(snap, atTop);
  if (topNodes.length === 0) throw new AiActionError('Cannot add story: top floor has no nodes');

  const nodeMap = new Map<number, number>();
  for (const [oldId, c] of topNodes) nodeMap.set(oldId, addNodeToSnap(snap, c.x, c.y, newZ));

  const topFloor: Json[] = [];
  const vertical: Json[] = [];
  for (const entry of elements(snap)) {
    const data = at(entry, 1);
    const ni = asU64(at(data, 'nodeI'));
    const nj = asU64(at(data, 'nodeJ'));
    if (ni === undefined || nj === undefined) continue;
    const ci = getNodeCoords(snap, ni);
    const cj = getNodeCoords(snap, nj);
    if (!ci || !cj) continue;
    if (atTop(ci) && atTop(cj)) topFloor.push(data as Json);
    if (ci.z !== undefined && cj.z !== undefined) {
      const reachesTop = near(ci.z, topZ) || near(cj.z, topZ);
      if (reachesTop && near(ci.x, cj.x) && near(ci.y, cj.y)) vertical.push(data as Json);
    }
  }

  for (const elem of vertical) {
    const [ni, nj] = nodeRefs(elem);
    const topNode = nodeMap.has(ni) ? ni : nj;
    const newNode = mapped(nodeMap, topNode);
    const matId = asU64(elem.materialId) ?? firstMaterialId(snap);
    const secId = colOverride ?? asU64(elem.sectionId) ?? firstSectionId(snap);
    addElementToSnap(snap, topNode, newNode, matId, secId);
  }

  for (const elem of topFloor) {
    const [ni, nj] = nodeRefs(elem);
    const cloned: Json = beamOverride !== undefined ? { ...elem, sectionId: beamOverride } : elem;
    cloneElementToSnap(snap, cloned, mapped(nodeMap, ni), mapped(nodeMap, nj));
  }
}
