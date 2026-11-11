/**
 * Physical plates in the model (`model/physical/plate.ts`): made from an outline, meshed on demand
 * one at a time or many together, meshed again without leaving anything behind, and made ready
 * for an analysis.
 *
 * ── Meshing is planned, then applied ──────────────────────────────
 *
 * `planPlateMeshes` runs the mesher for each plate and changes nothing: the reader sees the count,
 * the quality and what cannot be carried over before anything happens, and a long plan can be
 * stopped between plates. `applyPlateMeshes` puts the planned meshes in as one undo step: each
 * plate's old mesh comes out first (`clearPlateMesh`), so meshing twice never stacks two meshes.
 *
 * ── What a mesh leaves when it goes ───────────────────────────────
 *
 * Its shells, the nodes it created that nothing else holds, and the cuts it made in the members
 * (merged back where the cut node held nothing else, `merge-collinear.ts`). A node of the mesh
 * that something else took meanwhile (a support, a nodal load, a member drawn to it) stays, and
 * the next mesh meets it. Area loads defined on the plate (`floorLoad` definitions targeting it)
 * follow every mesh; a load put by hand on one shell of the mesh cannot, and is reported.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { physicalDataOf, type PhysicalData } from '../model/physical';
import { levelAt } from '../model/physical/recognize';
import {
  arcInterior, circleThrough, DEFAULT_PLATE_MESH, externalFeatures, gridOfSpec, memberChains, meshQuality, plateGeometry, plateKindOf, plateLoops, plateMeshInput, plateProblem,
  plateSignature, plateSurfaceOf, type ArcSampler, type MeshQuality, type PlateMeshSpec, type PlateProblem, type PlateSurface,
} from '../model/physical/plate';
import { pieceOf } from '../model/curve-entity';
import type { Vec3 } from '../model/edit/affine';
import { generateMesh, MAX_MESH_CELLS, type MeshOutput } from '../model/edit/mesher';
import { frameAlong, gridMesh } from '../model/edit/grid-mesh';
import { rectGrid } from '../model/edit/rect-grid';
import { applyMesh } from '../model/edit/mesh-apply';
import { mergeCollinear } from '../model/edit/merge-collinear';
import { addFloorLoadDef, syncDefinedLoads } from './defined-loads';
import { constraintNodes } from '../engine/steel/unbraced-length';
import { meshBeforeAnalysis } from './mesh-policy.svelte';
export { meshBeforeAnalysis };
import type { FloorLoadDef } from '../model/loads/floor-definitions';
import { columnFootprintsAt, footprintGrid, outsideFootprints, tieFootprints, untieNodes, type ColumnFootprint, type FootprintCells } from '../model/building/column-footprints';
import { designData } from './design-data';
import { tributaryAreas } from '../engine/foundation-springs';
import type { ModelGroup, SurfaceLoad3D } from './model.svelte';

export type PlateStatus = 'unmeshed' | 'current' | 'stale' | 'invalid';

export interface PlateEntry { id: number; name: string; group: ModelGroup; physical: PhysicalData; surface: PlateSurface }

/** Every physical plate of the model. */
export function physicalPlates(): PlateEntry[] {
  const out: PlateEntry[] = [];
  for (const g of modelStore.model.groups.values()) {
    const physical = physicalDataOf(g);
    const surface = plateSurfaceOf(g);
    if (physical && surface) out.push({ id: g.id, name: g.name, group: g, physical, surface });
  }
  return out;
}

export function plateEntry(id: number): PlateEntry | null {
  const g = modelStore.model.groups.get(id);
  const physical = g ? physicalDataOf(g) : null;
  const surface = g ? plateSurfaceOf(g) : null;
  return g && physical && surface ? { id, name: g.name, group: g, physical, surface } : null;
}

/** The plate a shell belongs to ("q12" or "p4"), or null. */
export function plateOfShell(key: string): number | null {
  const kind = key[0] === 'q' ? 'quads' : key[0] === 'p' ? 'plates' : null;
  const id = Number(key.slice(1));
  if (!kind || !Number.isFinite(id)) return null;
  for (const p of physicalPlates()) if (p.group.members[kind]?.includes(id)) return p.id;
  return null;
}

/** The selection keys of a plate's shells. */
export function plateShellKeys(id: number): string[] {
  const g = modelStore.model.groups.get(id);
  return [...(g?.members.quads ?? []).map((q) => `q${q}`), ...(g?.members.plates ?? []).map((p) => `p${p}`)];
}
uiStore.setPlateShellResolver(plateShellKeys);

const plateModel = () => ({ nodes: modelStore.nodes, elements: modelStore.elements });

/**
 * A curved member running from node a to node b, as its nodes in order from a, or null. What a
 * plate's curved side between the same nodes follows, so the two share their nodes.
 */
export function arcEdgeBetween(a: number, b: number): { arcId: number; nodes: number[] } | null {
  const seen = new Set<number>();
  for (const e of modelStore.elements.values()) {
    if (!e.arc || seen.has(e.arc.id)) continue;
    seen.add(e.arc.id);
    const p = pieceOf(modelStore.model as never, e.id);
    if (!p || p.kind !== 'arc') continue;
    if (!((p.start === a && p.end === b) || (p.start === b && p.end === a))) continue;
    const nodes = [p.start];
    for (const seg of p.segments) { const x = modelStore.elements.get(seg.elementId)!; nodes.push(seg.reversed ? x.nodeI : x.nodeJ); }
    return { arcId: e.arc.id, nodes: p.start === a ? nodes : nodes.reverse() };
  }
  return null;
}

/**
 * How a mesh draws a curved side: through the nodes of the curved member on it, when one runs
 * between its ends along the same circle, so plate and member share them; otherwise in pieces of
 * the element size.
 */
function meshSampler(size: number): ArcSampler {
  return (a, mid, b) => {
    const ci = circleThrough(a.p, mid.p, b.p);
    if (!ci) return [];
    const edge = arcEdgeBetween(a.id, b.id);
    if (edge) {
      const pts = edge.nodes.slice(1, -1).map((id) => { const n = modelStore.nodes.get(id)!; return [n.x, n.y, n.z ?? 0] as Vec3; });
      const onCircle = pts.every((q) => Math.abs(Math.hypot(q[0] - ci.c[0], q[1] - ci.c[1], q[2] - ci.c[2]) - ci.r) < 1e-3);
      if (pts.length && onCircle) return pts;
    }
    return arcInterior(a.p, mid.p, b.p, Math.max(2, Math.ceil((ci.r * ci.sweep) / size)));
  };
}

/**
 * What a plate's mesh has to meet. Members are read whole through the nodes every plate's mesh
 * created, so meshing one plate never puts its neighbours out of date; the nodes of the other
 * shells on its outline are points the mesh passes through, so neighbouring meshes meet node to
 * node.
 */
let sharedMemo: { key: unknown[]; owned: Set<number>; shellNodes: Map<number, number>; chains: Array<[number, number]> } | null = null;

/** What every plate's features read from the whole model, computed once per state of it. */
function sharedFeatures() {
  const m = modelStore.model;
  // Keyed on the maps' identities and sizes: a change made in place, without a new map, must bump modelVersion.
  const key = [modelStore.modelVersion, m.groups, m.groups.size, modelStore.quads, modelStore.quads.size, modelStore.plates, modelStore.plates.size, modelStore.nodes, modelStore.nodes.size, modelStore.elements, modelStore.elements.size];
  if (sharedMemo && sharedMemo.key.every((k, i) => k === key[i])) return sharedMemo;
  const owned = new Set<number>();
  for (const g of m.groups.values()) if (plateSurfaceOf(g)) for (const n of plateLoops(g).owned) owned.add(n);
  const shellNodes = new Map<number, number>();
  for (const sh of [...modelStore.quads.values(), ...modelStore.plates.values()]) for (const n of sh.nodes) shellNodes.set(n, (shellNodes.get(n) ?? 0) + 1);
  sharedMemo = { key, owned, shellNodes, chains: memberChains(plateModel(), owned) };
  return sharedMemo;
}

function featuresOf(e: PlateEntry, spec: PlateMeshSpec = e.surface.mesh) {
  const geo = plateGeometry(plateModel(), e.group, meshSampler(spec.size));
  if (!geo) return null;
  const loops = plateLoops(e.group);
  const mine = new Set(loops.owned);
  const { owned, shellNodes, chains } = sharedFeatures();
  const inMine = new Map<number, number>();
  for (const q of e.group.members.quads ?? []) for (const n of modelStore.quads.get(q)?.nodes ?? []) inMine.set(n, (inMine.get(n) ?? 0) + 1);
  for (const p of e.group.members.plates ?? []) for (const n of modelStore.plates.get(p)?.nodes ?? []) inMine.set(n, (inMine.get(n) ?? 0) + 1);
  const neighbours = new Set<number>();
  for (const [n, c] of shellNodes) if (c > (inMine.get(n) ?? 0)) neighbours.add(n);
  const loopNodes = new Set([...loops.outer, ...loops.holes.flat()]);
  return { geo, features: externalFeatures(plateModel(), geo, owned, loopNodes, { mine, neighbours, chains }) };
}

/** A plate's mesh settings as meshed: a waffle slab no coarser than its rib spacing, so each rib has its row of elements. */
function specOf(e: PlateEntry, override?: Partial<PlateMeshSpec>): PlateMeshSpec {
  const spec = { ...e.surface.mesh, ...(override ?? {}) };
  const rib = e.physical.typology === 'waffle' ? designData().specialFloors?.systems?.[`S${e.id}`]?.ribbed : undefined;
  return rib ? { ...spec, size: Math.min(spec.size, rib.spacingX, rib.spacingY ?? rib.spacingX) } : spec;
}

/**
 * The columns a slab's mesh has to represent: a horizontal rectangle in plan with columns reaching
 * it gets lines on their faces and its nodes inside each section tied to the column. Null for
 * anything else, which meshes as it always did.
 */
function footprintsOf(e: PlateEntry, geo: NonNullable<ReturnType<typeof plateGeometry>>): { corners: Array<{ x: number; y: number; z: number }>; columns: ColumnFootprint[]; z: number } | null {
  if (e.physical.kind !== 'slab' || geo.holes.length || geo.outer.length !== 4 || Math.abs(geo.frame.n[2]) < 1 - 1e-6) return null;
  const corners = geo.outer.map((p) => ({ x: p[0], y: p[1], z: p[2] }));
  const z = corners[0]!.z;
  const columns = columnFootprintsAt(z);
  if (!columns.length || !footprintGrid(corners, e.surface.mesh.size, columns)) return null;
  const x0 = Math.min(...corners.map((c) => c.x)), x1 = Math.max(...corners.map((c) => c.x)), y0 = Math.min(...corners.map((c) => c.y)), y1 = Math.max(...corners.map((c) => c.y));
  const near = columns.filter((c) => c.x > x0 - c.hx - 1e-6 && c.x < x1 + c.hx + 1e-6 && c.y > y0 - c.hy - 1e-6 && c.y < y1 + c.hy + 1e-6);
  return near.length ? { corners, columns: near, z } : null;
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** What a mesh is made from (`plateSignature`), with the column sections it represents. */
function signatureOf(e: PlateEntry, f: NonNullable<ReturnType<typeof featuresOf>>, spec: PlateMeshSpec): string {
  const fp = footprintsOf(e, f.geo);
  return plateSignature(f.geo, spec, f.features) + (fp ? `#fp:${fp.columns.map((c) => `${r6(c.x)},${r6(c.y)},${r6(c.hx)},${r6(c.hy)}`).sort().join(';')}` : '');
}

/**
 * The plate's shells as they are, taken as its current mesh: what a plate made from shells already in
 * the model keeps, so its answer does not change until its definition does.
 */
/** Take a plate's shells as its current mesh. `original`: they came with the model, no mesher made them (kept when the plate already had a mesh). */
export function adoptCurrentMesh(id: number, opts: { original?: boolean } = {}): void {
  const e = plateEntry(id);
  const f = e ? featuresOf(e) : null;
  if (!e || !f) return;
  const cells: number[][] = [], index = new Map<number, number>(), points: Vec3[] = [];
  const at = (n: number) => { let k = index.get(n); if (k === undefined) { const p = modelStore.nodes.get(n)!; k = points.push([p.x, p.y, p.z ?? 0]) - 1; index.set(n, k); } return k; };
  for (const q of e.group.members.quads ?? []) { const sh = modelStore.quads.get(q); if (sh) cells.push(sh.nodes.map(at)); }
  for (const q of e.group.members.plates ?? []) { const sh = modelStore.plates.get(q); if (sh) cells.push(sh.nodes.map(at)); }
  if (!cells.length) return;
  writeSurface(id, (s) => {
    const original = s.meshed ? s.meshed.original : opts.original;
    return { ...s, meshed: { ...(s.meshed ?? {}), signature: signatureOf(e, f, specOf(e)), cells: cells.length, quality: meshQuality({ points, cells }), ...(original ? { original: true } : {}) } };
  });
}

/** A plain support (a type and nothing else) at both ends of an outline side holds the whole side: the mesh's nodes on it get it too. */
function supportSides(outer: readonly number[], created: readonly number[]): number[] {
  const plain = (n: number) => {
    const sp = [...modelStore.supports.values()].find((x) => x.nodeId === n);
    return sp && Object.keys(sp).every((k) => k === 'id' || k === 'nodeId' || k === 'type') ? sp.type : undefined;
  };
  const added: number[] = [];
  outer.forEach((a, i) => {
    const b = outer[(i + 1) % outer.length]!;
    const type = plain(a);
    if (!type || plain(b) !== type) return;
    const A = modelStore.nodes.get(a), B = modelStore.nodes.get(b);
    if (!A || !B) return;
    const d = [B.x - A.x, B.y - A.y, (B.z ?? 0) - (A.z ?? 0)], L2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2;
    if (L2 < 1e-18) return;
    for (const n of created) {
      const P = modelStore.nodes.get(n);
      if (!P || plain(n) !== undefined) continue;
      const w = [P.x - A.x, P.y - A.y, (P.z ?? 0) - (A.z ?? 0)];
      const t = (w[0]! * d[0]! + w[1]! * d[1]! + w[2]! * d[2]!) / L2;
      const off = Math.hypot(w[0]! - t * d[0]!, w[1]! - t * d[1]!, w[2]! - t * d[2]!);
      if (t > 1e-6 && t < 1 - 1e-6 && off < 1e-6) { modelStore.addSupport(n, type); added.push(n); }
    }
  });
  return added;
}

let statusMemo: { version: number; groups: unknown; map: Map<number, PlateStatus> } | null = null;

/** Whether a plate has a mesh, and whether it is the one its definition asks for now. */
export function plateStatus(id: number): PlateStatus {
  const version = modelStore.modelVersion;
  if (!statusMemo || statusMemo.version !== version || statusMemo.groups !== modelStore.model.groups) statusMemo = { version, groups: modelStore.model.groups, map: new Map() };
  const hit = statusMemo.map.get(id);
  if (hit) return hit;
  const e = plateEntry(id);
  let s: PlateStatus;
  if (!e) s = 'invalid';
  else {
    const f = featuresOf(e);
    const shells = (e.group.members.quads?.length ?? 0) + (e.group.members.plates?.length ?? 0);
    if (!f) s = 'invalid';
    else if (!e.surface.meshed || shells === 0) s = 'unmeshed';
    else s = signatureOf(e, f, specOf(e)) === e.surface.meshed.signature ? 'current' : 'stale';
  }
  statusMemo.map.set(id, s);
  return s;
}

/** The plates whose mesh is missing or out of date. */
export function platesNeedingMesh(): number[] {
  return physicalPlates().filter((p) => { const s = plateStatus(p.id); return s === 'unmeshed' || s === 'stale'; }).map((p) => p.id);
}

// ─── Making a plate ──────────────────────────────────────────────

export interface NewPlate {
  outline: number[]; holes?: number[][]; materialId: number; thickness: number; name?: string; mesh?: PlateMeshSpec;
  /** Indices of `outline` that are points of curved sides (`PlateSurface.arcMids`). */
  arcMids?: number[];
  /** A side between two nodes a curved member joins follows the member (default true). */
  followArcs?: boolean;
  /** Indices of the holes' nodes, counted through them all in order, that are points of curved sides. */
  holeArcMids?: number[];
}

/** An outline with the sides a curved member joins made curved, through the member's middle node. */
function withMemberArcs(outline: number[], arcMids: number[]): { outline: number[]; arcMids: number[] } {
  const out: number[] = [];
  const mids: number[] = [];
  const given = new Set(arcMids);
  for (let k = 0; k < outline.length; k++) {
    if (given.has(k)) mids.push(out.length);
    out.push(outline[k]!);
    const a = outline[k]!, b = outline[(k + 1) % outline.length]!;
    if (given.has(k) || given.has((k + 1) % outline.length)) continue;
    const edge = arcEdgeBetween(a, b);
    if (edge && edge.nodes.length >= 3) { mids.push(out.length); out.push(edge.nodes[Math.floor(edge.nodes.length / 2)]!); }
  }
  return { outline: out, arcMids: mids };
}

/** Names for new plates, L for a slab and M for a wall, each the next number no group of the model has. */
export function plateNamer(): (kind: string) => string {
  const used = new Set([...modelStore.model.groups.values()].map((g) => g.name));
  return (kind) => {
    const prefix = kind === 'wall' ? 'M' : 'L';
    let n = 1;
    while (used.has(`${prefix}${n}`)) n++;
    used.add(`${prefix}${n}`);
    return `${prefix}${n}`;
  };
}

/** The levels a plate's nodes span, as the physical elements read them. */
export function plateLevels(nodes: readonly number[]): { levelFrom?: string; levelTo?: string } {
  const zs = nodes.map((n) => modelStore.nodes.get(n)?.z ?? 0);
  if (!zs.length) return {};
  const levels = modelStore.grid?.levels ?? [];
  return { levelFrom: levelAt(Math.min(...zs), levels), levelTo: levelAt(Math.max(...zs), levels) };
}

/** A plate from an outline of nodes; one undo step. The problem when the nodes make none. */
export function createPlate(p: NewPlate): { id: number } | { problem: PlateProblem } {
  const holes = p.holes ?? [];
  const arcs = p.followArcs === false ? { outline: p.outline, arcMids: p.arcMids ?? [] } : withMemberArcs(p.outline, p.arcMids ?? []);
  const problem = plateProblem(plateModel(), arcs.outline, holes, arcs.arcMids);
  if (problem) return { problem };
  p = { ...p, outline: arcs.outline };
  const mids = [...arcs.arcMids, ...(p.holeArcMids ?? []).map((i) => p.outline.length + i)];
  const surface: PlateSurface = { loops: [p.outline.length, ...holes.map((h) => h.length)], materialId: p.materialId, thickness: p.thickness, mesh: { ...(p.mesh ?? DEFAULT_PLATE_MESH) }, ...(mids.length ? { arcMids: mids } : {}) };
  const temp = { id: 0, members: { nodes: [...p.outline, ...holes.flat()] }, data: { surface } };
  const geo = plateGeometry(plateModel(), temp)!;
  const kind = plateKindOf(geo);
  const physical: PhysicalData & { surface: PlateSurface } = { kind, provenance: 'declared', ...plateLevels(p.outline), surface };
  const id = modelStore.addGroup(p.name ?? plateNamer()(kind), 'physicalMember', temp.members, { data: physical as unknown as Record<string, unknown> });
  return { id };
}

function writeSurface(id: number, surface: PlateSurface | ((s: PlateSurface) => PlateSurface)): void {
  const g = modelStore.model.groups.get(id);
  const d = g ? physicalDataOf(g) : null;
  const s = g ? plateSurfaceOf(g) : null;
  if (!g || !d || !s) return;
  const next = typeof surface === 'function' ? surface(s) : surface;
  modelStore.setGroupData(id, { ...d, surface: next } as unknown as Record<string, unknown>);
}

/** A circular plate in plan, its outline and an optional circular hole each four arcs through eight new nodes; one undo step. */
export function createCircularPlate(o: { center: Vec3; radius: number; hole?: { center: Vec3; radius: number }; materialId: number; thickness: number }): { id: number } | { problem: PlateProblem } {
  const ring = (c: Vec3, r: number) => Array.from({ length: 8 }, (_, k) => modelStore.addNode(c[0] + r * Math.cos((k * Math.PI) / 4), c[1] + r * Math.sin((k * Math.PI) / 4), c[2]));
  let out: { id: number } | { problem: PlateProblem } = { problem: 'needNodes' };
  if (!(o.radius > 0) || (o.hole && !(o.hole.radius > 0))) return out;
  modelStore.batch(() => {
    const outline = ring(o.center, o.radius);
    const holes = o.hole ? [ring(o.hole.center, o.hole.radius)] : [];
    out = createPlate({ outline, holes, materialId: o.materialId, thickness: o.thickness, arcMids: [1, 3, 5, 7], followArcs: false, ...(o.hole ? { holeArcMids: [1, 3, 5, 7] } : {}) });
    if ('problem' in out) for (const n of [...outline, ...holes.flat()]) modelStore.removeNode(n);
  });
  return out;
}

/** Change a plate's material or thickness, on its definition and its shells; one undo step. */
export function setPlateProperties(id: number, props: { materialId?: number; thickness?: number }): void {
  const e = plateEntry(id);
  if (!e) return;
  if (props.thickness !== undefined && !(props.thickness > 0)) return;
  if (props.materialId !== undefined && !modelStore.materials.has(props.materialId)) return;
  modelStore.batch(() => {
    writeSurface(id, (s) => ({ ...s, ...props }));
    for (const q of e.group.members.quads ?? []) modelStore.updateQuad(q, props);
    for (const q of e.group.members.plates ?? []) modelStore.updatePlate(q, props);
  });
}

/**
 * A shell's material or thickness, as every table and panel edits it. A shell of a physical
 * plate's mesh is the plate's: the edit goes to the plate (its definition and its whole mesh),
 * so a remesh does not undo it and the plate never says one thing while its elements say another.
 * Returns the plates edited that way, for the caller to say so.
 */
export function setShellProperties(keys: readonly string[], patch: { materialId?: number; thickness?: number }): number[] {
  const plates = new Set<number>();
  modelStore.batch(() => {
    for (const k of keys) {
      const plate = plateOfShell(k);
      if (plate !== null) { plates.add(plate); continue; }
      const id = Number(k.slice(1));
      if (k[0] === 'p') modelStore.updatePlate(id, patch); else modelStore.updateQuad(id, patch);
    }
    for (const id of plates) setPlateProperties(id, patch);
  });
  return [...plates];
}

/** Change how a plate is to be meshed. Its mesh, if any, is then out of date. */
export function setPlateMeshSpec(ids: readonly number[], spec: Partial<PlateMeshSpec>): void {
  modelStore.batch(() => { for (const id of ids) writeSurface(id, (s) => ({ ...s, mesh: { ...s.mesh, ...spec } })); });
}

/** Replace a plate's holes (node loops); one undo step. The problem when they do not fit. */
export function setPlateHoles(id: number, holes: number[][]): PlateProblem | null {
  const e = plateEntry(id);
  if (!e) return 'needNodes';
  const loops = plateLoops(e.group);
  // The outline's curved sides stay; a hole is straight-sided when replaced this way.
  const outerArcs = (e.surface.arcMids ?? []).filter((k) => k < loops.outer.length);
  return setPlateLoops(id, loops.outer, holes, outerArcs);
}

/**
 * Replace a plate's outline and holes (node loops, `arcMids` the outline's curved-side points);
 * one undo step. The plate's own holes are then its openings: a wall's openings as placed are dropped.
 */
export function setPlateLoops(id: number, outer: number[], holes: number[][], arcMids: number[] = []): PlateProblem | null {
  const e = plateEntry(id);
  if (!e) return 'needNodes';
  const problem = plateProblem(plateModel(), outer, holes, arcMids);
  if (problem) return problem;
  const loops = plateLoops(e.group);
  const inLoops = new Set([...outer, ...holes.flat()]);
  modelStore.batch(() => {
    modelStore.setGroupMembers(id, { ...e.group.members, nodes: [...outer, ...holes.flat(), ...loops.owned.filter((n) => !inLoops.has(n))] });
    const g = modelStore.model.groups.get(id)!;
    const d = physicalDataOf(g);
    if (d && 'openings' in d) { const { openings: _gone, ...rest } = d as PhysicalData & { openings?: unknown }; modelStore.setGroupData(id, rest as unknown as Record<string, unknown>); }
    writeSurface(id, (s) => ({ ...s, loops: [outer.length, ...holes.map((h) => h.length)], ...(arcMids.length ? { arcMids: [...arcMids].sort((x, y) => x - y) } : { arcMids: undefined }) }));
  });
  return null;
}

/**
 * Make an outline side curved through a node, or straight again (`mid` null). `side` k is the
 * side from the k-th corner of the outline (curved sides' points not counted) to the next.
 */
export function setPlateSideArc(id: number, side: number, mid: number | null): PlateProblem | null {
  const e = plateEntry(id);
  if (!e) return 'needNodes';
  const loops = plateLoops(e.group);
  const mids = new Set((e.surface.arcMids ?? []).filter((k) => k < loops.outer.length));
  // Corners: the outline's nodes that are not arc points; the side from corner `side`.
  const corners = loops.outer.map((_, k) => k).filter((k) => !mids.has(k));
  const at = corners[side];
  if (at === undefined) return 'needNodes';
  const next = (at + 1) % loops.outer.length;
  const outer = [...loops.outer];
  let arcList = [...mids];
  let corner = at;
  if (mids.has(next)) {
    outer.splice(next, 1);
    arcList = arcList.filter((k) => k !== next).map((k) => (k > next ? k - 1 : k));
    if (next < corner) corner--;
  }
  if (mid !== null) { const pos = corner + 1; outer.splice(pos, 0, mid); arcList = arcList.map((k) => (k >= pos ? k + 1 : k)); arcList.push(pos); }
  const problem = plateProblem(plateModel(), outer, loops.holes, arcList);
  if (problem) return problem;
  modelStore.batch(() => {
    modelStore.setGroupMembers(id, { ...e.group.members, nodes: [...outer, ...loops.holes.flat(), ...loops.owned] });
    writeSurface(id, (s) => ({ ...s, loops: [outer.length, ...loops.holes.map((h) => h.length)], ...(arcList.length ? { arcMids: arcList.sort((x, y) => x - y) } : { arcMids: undefined }) }));
  });
  return null;
}

/** The outline's sides: each one's corners, and the node it passes through when curved. */
export function plateSides(id: number): Array<{ from: number; to: number; mid: number | null }> {
  const e = plateEntry(id);
  if (!e) return [];
  const { outer } = plateLoops(e.group);
  const mids = new Set(e.surface.arcMids ?? []);
  const out: Array<{ from: number; to: number; mid: number | null }> = [];
  for (let k = 0; k < outer.length; k++) {
    if (mids.has(k)) continue;
    const n1 = (k + 1) % outer.length;
    if (mids.has(n1)) out.push({ from: outer[k]!, to: outer[(n1 + 1) % outer.length]!, mid: outer[n1]! });
    else out.push({ from: outer[k]!, to: outer[n1]!, mid: null });
  }
  return out;
}

/** An area load on the whole plate, kept as a definition so that it follows every mesh. */
export function plateLoadDef(id: number, caseId: number, q: number): FloorLoadDef {
  return { caseId, q, target: { by: 'group', groupId: id }, distribution: 'slab' };
}

export function addPlateLoad(id: number, caseId: number, q: number, name?: string): number | null {
  const e = plateEntry(id);
  if (!e || !Number.isFinite(q)) return null;
  return addFloorLoadDef(name ?? `${e.name} · q`, plateLoadDef(id, caseId, q));
}

/** The area-load definitions that target a plate. */
export function plateLoadDefs(id: number): ModelGroup[] {
  return [...modelStore.model.groups.values()].filter((g) => {
    if (g.kind !== 'floorLoad') return false;
    const t = (g.data as unknown as FloorLoadDef | undefined)?.target;
    return t?.by === 'group' && t.groupId === id;
  });
}

// ─── Meshing ─────────────────────────────────────────────────────

export interface PlateMeshPlan {
  id: number;
  name: string;
  spec: PlateMeshSpec;
  /** Null when refused, with the reason. */
  mesh: MeshOutput | null;
  refused?: 'invalid' | 'tooManyCells' | 'cannotMesh';
  cells: number;
  quality: MeshQuality | null;
  signature: string;
  input: ReturnType<typeof plateMeshInput> | null;
  /** Loads put by hand on shells of the current mesh, which a new mesh cannot carry. */
  localLoads: number;
  /** Nodes of the current mesh that something else holds, which stay and are met by the new one. */
  keptNodes: number;
  /** The element asked for and what the mesher gives: quadrilaterals from triangles, outside the structured paths. */
  mixed: boolean;
  /** A grid's mesh: its rectangles, the strip along the boundary, and the rectangles' sides as they came out. */
  grid?: { gridCells: number; bandCells: number; cellA: number; cellB: number };
  /** The directions sides a (u) and b (v) of a grid's cells run along. */
  aDir?: Vec3;
  bDir?: Vec3;
  /** The column sections a slab's mesh represents (`footprintsOf`). */
  footprints?: { columns: ColumnFootprint[]; z: number };
}

/** Every node something holds; `except` a plate whose own outline and mesh do not count. */
const held = (except?: number): Set<number> => {
  const s = new Set<number>();
  for (const e of modelStore.elements.values()) { s.add(e.nodeI); s.add(e.nodeJ); }
  for (const q of modelStore.quads.values()) q.nodes.forEach((n) => s.add(n));
  for (const p of modelStore.plates.values()) p.nodes.forEach((n) => s.add(n));
  for (const sp of modelStore.supports.values()) s.add(sp.nodeId);
  for (const l of modelStore.loads) if ('nodeId' in l.data) s.add((l.data as { nodeId: number }).nodeId);
  for (const n of constraintNodes(modelStore.model.constraints)) s.add(n);
  for (const g of modelStore.model.groups.values()) if (g.id !== except) g.members.nodes?.forEach((n) => s.add(n));
  return s;
};

/** Plain uniform area loads on every shell given, case by case, that a plate's own load can take the place of: those loads, and the cases and values it is given. */
export function uniformLoads(keys: readonly string[], byShell: ReadonlyMap<string, Array<{ id: number; caseId: number; q: number }>>): { gone: number[]; cases: Array<{ caseId: number; q: number; ids: number[] }> } {
  const byCase = new Map<number, Array<{ id: number; key: string; q: number }>>();
  for (const key of keys) for (const l of byShell.get(key) ?? []) (byCase.get(l.caseId) ?? byCase.set(l.caseId, []).get(l.caseId)!).push({ ...l, key });
  const gone: number[] = [], cases: Array<{ caseId: number; q: number; ids: number[] }> = [];
  for (const [caseId, list] of byCase) {
    if (caseId < 0 || list.length !== keys.length || new Set(list.map((x) => x.key)).size !== keys.length) continue;
    const q = list[0]!.q;
    if (!Number.isFinite(q) || list.some((x) => Math.abs(x.q - q) > 1e-12)) continue;
    gone.push(...list.map((x) => x.id));
    cases.push({ caseId, q, ids: list.map((x) => x.id) });
  }
  return { gone, cases };
}

export function shellAreaLoads(): Map<string, Array<{ id: number; caseId: number; q: number }>> {
  const plain = (d: SurfaceLoad3D) => Object.keys(d).every((k) => ['id', 'quadId', 'on', 'q', 'caseId'].includes(k));
  const out = new Map<string, Array<{ id: number; caseId: number; q: number }>>();
  for (const l of modelStore.loads) {
    if (l.type !== 'surface3d') continue;
    const d = l.data as SurfaceLoad3D;
    const key = `${d.on === 'plate' ? 'p' : 'q'}${d.quadId}`;
    (out.get(key) ?? out.set(key, []).get(key)!).push({ id: d.id, caseId: d.caseId ?? -1, q: plain(d) ? d.q : NaN });
  }
  return out;
}

/** The uniform area loads on every shell of a slab plate's mesh, which become the plate's own when it is meshed again. */
export function liftableLoads(e: PlateEntry, byShell = shellAreaLoads()): ReturnType<typeof uniformLoads> {
  return e.physical.kind === 'slab' ? uniformLoads(plateShellKeys(e.id), byShell) : { gone: [], cases: [] };
}

function localLoadsOn(e: PlateEntry): number {
  const liftable = new Set(liftableLoads(e).gone);
  const quads = new Set(e.group.members.quads ?? []), plates = new Set(e.group.members.plates ?? []);
  return modelStore.loads.filter((l) => {
    if (l.type !== 'surface3d' && l.type !== 'thermalQuad3d') return false;
    const d = l.data as { id: number; quadId: number; on?: string; fromDef?: number };
    if (d.fromDef !== undefined || liftable.has(d.id)) return false;
    return d.on === 'plate' ? plates.has(d.quadId) : quads.has(d.quadId);
  }).length;
}

/** Nodes of a plate's mesh that something other than its own shells holds. */
function keptMeshNodes(e: PlateEntry): number {
  const owned = plateLoops(e.group).owned;
  if (!owned.length) return 0;
  const mine = new Set([...(e.group.members.quads ?? []).map((q) => `q${q}`), ...(e.group.members.plates ?? []).map((p) => `p${p}`)]);
  const busy = new Set<number>();
  for (const sp of modelStore.supports.values()) busy.add(sp.nodeId);
  for (const l of modelStore.loads) if ('nodeId' in l.data) busy.add((l.data as { nodeId: number }).nodeId);
  for (const q of modelStore.quads.values()) if (!mine.has(`q${q.id}`)) q.nodes.forEach((n) => busy.add(n));
  for (const p of modelStore.plates.values()) if (!mine.has(`p${p.id}`)) p.nodes.forEach((n) => busy.add(n));
  return owned.filter((n) => busy.has(n)).length;
}

/**
 * The mesh each plate would get, without changing the model. `spec` overrides each plate's own
 * settings (the batch's common settings). Yields between plates and stops when `signal` aborts.
 */
export async function planPlateMeshes(ids: readonly number[], spec?: Partial<PlateMeshSpec>, opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<PlateMeshPlan[] | null> {
  const out: PlateMeshPlan[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (opts.signal?.aborted) return null;
    const plan = planPlateMesh(ids[i]!, spec);
    if (plan) out.push(plan);
    opts.onProgress?.(i + 1, ids.length);
    // Give the page a frame between plates, so a long batch can be watched and stopped.
    if (ids.length > 1) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

/** One plate's plan, synchronously. */
export function planPlateMesh(id: number, specOverride?: Partial<PlateMeshSpec>): PlateMeshPlan | null {
  const e = plateEntry(id);
  if (!e) return null;
  const spec = specOf(e, specOverride);
  const base = { id, name: e.name, spec, localLoads: localLoadsOn(e), keptNodes: keptMeshNodes(e) };
  const f = featuresOf(e, spec);
  if (!f) return { ...base, mesh: null, refused: 'invalid', cells: 0, quality: null, signature: '', input: null, mixed: false };
  const input = plateMeshInput(f.geo, spec, f.features);
  const signature = signatureOf(e, f, spec);
  const fp = footprintsOf(e, f.geo);
  const grid = gridOfSpec(spec);
  const fpCells = fp ? footprintCells(spec, grid, f.geo.frame) : null;
  const fpMesh = fp && fpCells ? footprintGrid(fp.corners, fpCells.cells, fp.columns) : null;
  if (fp && fpCells && fpMesh) {
    if (fpMesh.cells.length > MAX_MESH_CELLS) return { ...base, mesh: null, refused: 'tooManyCells', cells: fpMesh.cells.length, quality: null, signature, input, mixed: false };
    return {
      ...base, mesh: fpMesh, cells: fpMesh.cells.length, quality: meshQuality(fpMesh), signature, input, mixed: false, footprints: { columns: fp.columns, z: fp.z }, aDir: fpCells.aDir, bDir: fpCells.bDir,
      ...(grid ? { grid: { gridCells: fpMesh.cells.length, bandCells: 0, cellA: grid.a, cellB: grid.b } } : {}),
    };
  }
  // A plate far past the cap would be a long wait for a refusal: estimate from the area first.
  const estimate = plateAreaEstimate(f.geo, spec);
  if (estimate > MAX_MESH_CELLS * 1.5) return { ...base, mesh: null, refused: 'tooManyCells', cells: Math.round(estimate), quality: null, signature, input, mixed: false };
  if (grid) {
    const frame = grid.orient === 'globalX' ? frameAlong(f.geo.frame, [1, 0, 0]) : f.geo.frame;
    const g = gridMesh({
      outer: f.geo.outer, holes: f.geo.holes, frame, a: grid.a, b: grid.b, element: 'quad',
      ...(input.sides ? { sides: input.sides } : {}), fixedPoints: input.fixedPoints ?? [], fixedSegments: input.fixedSegments ?? [],
    });
    if (!g) return { ...base, mesh: null, refused: 'cannotMesh', cells: 0, quality: null, signature, input, mixed: false };
    if (g.cells.length > MAX_MESH_CELLS) return { ...base, mesh: null, refused: 'tooManyCells', cells: g.cells.length, quality: null, signature, input, mixed: false };
    const { gridCells, bandCells, cellA, cellB, ...mesh } = g;
    return { ...base, mesh, cells: mesh.cells.length, quality: meshQuality(mesh), signature, input, mixed: bandCells > 0, grid: { gridCells, bandCells, cellA, cellB }, aDir: frame.u, bDir: frame.v };
  }
  const general = generateMesh(input);
  const mesh = general?.structured ? general : rectGridOf(f.geo, spec, f.features) ?? general;
  if (!mesh) return { ...base, mesh: null, refused: 'cannotMesh', cells: 0, quality: null, signature, input, mixed: false };
  if (mesh.cells.length > MAX_MESH_CELLS) return { ...base, mesh: null, refused: 'tooManyCells', cells: mesh.cells.length, quality: null, signature, input, mixed: false };
  return { ...base, mesh, cells: mesh.cells.length, quality: meshQuality(mesh), signature, input, mixed: spec.element === 'quad' && !mesh.structured };
}

/**
 * Rectangles for a plate whose sides run along its frame (an L, a notch, rectangular holes such as
 * a wall's openings), where the general mesher would give distorted quadrilaterals around them.
 * Null where a neighbour's mesh meets a side at points the grid does not have: its nodes would hang.
 */
function rectGridOf(geo: NonNullable<ReturnType<typeof plateGeometry>>, spec: PlateMeshSpec, features: { points: Vec3[]; segments: Array<[Vec3, Vec3]> } | null): MeshOutput | null {
  const g = rectGrid({
    frame: geo.frame, outer: geo.outer, holes: geo.holes, a: spec.size, b: spec.size, element: spec.element, maxCells: MAX_MESH_CELLS,
    fixedPoints: features?.points ?? [], fixedSegments: spec.followMembers && features ? features.segments : [],
  });
  if (!g) return null;
  const key = (p: readonly number[]) => `${Math.round(p[0]! * 1e4)},${Math.round(p[1]! * 1e4)},${Math.round(p[2]! * 1e4)}`;
  const loops = [geo.outer, ...geo.holes];
  const sideOf = (p: Vec3) => {
    for (const l of loops) for (let i = 0; i < l.length; i++) {
      const a = l[i]!, b = l[(i + 1) % l.length]!, ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
      const t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2;
      if (t <= 1e-9 || t >= 1 - 1e-9) continue;
      if (Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t) < 1e-4) return `${loops.indexOf(l)}:${i}`;
    }
    return null;
  };
  const met = new Map<string, Set<string>>();
  for (const p of features?.points ?? []) { const s = sideOf(p); if (s) (met.get(s) ?? met.set(s, new Set()).get(s)!).add(key(p)); }
  for (const i of g.boundary) {
    const p = g.points[i]!, s = sideOf(p);
    if (s && met.has(s) && !met.get(s)!.has(key(p))) return null;
  }
  return g;
}

/**
 * A slab panel with column footprints meshes on an axis-aligned grid: side a goes along X or Y,
 * whichever the plate's first side (or global X) is closer to.
 */
function footprintCells(spec: PlateMeshSpec, grid: ReturnType<typeof gridOfSpec>, frame: { u: Vec3 }): { cells: FootprintCells; aDir: Vec3; bDir: Vec3 } {
  const alongX = (grid?.orient ?? 'plate') === 'globalX' || Math.abs(frame.u[0]) >= Math.abs(frame.u[1]);
  const a = grid?.a ?? spec.size, b = grid?.b ?? spec.size;
  return { cells: { ax: alongX ? a : b, ay: alongX ? b : a, element: spec.element }, aDir: alongX ? [1, 0, 0] : [0, 1, 0], bDir: alongX ? [0, 1, 0] : [1, 0, 0] };
}

function plateAreaEstimate(geo: NonNullable<ReturnType<typeof plateGeometry>>, spec: PlateMeshSpec): number {
  const proj = (l: typeof geo.outer) => { let s = 0; const f = geo.frame; for (let i = 0; i < l.length; i++) { const a = l[i]!, b = l[(i + 1) % l.length]!; const ua = (a[0] - f.o[0]) * f.u[0] + (a[1] - f.o[1]) * f.u[1] + (a[2] - f.o[2]) * f.u[2], va = (a[0] - f.o[0]) * f.v[0] + (a[1] - f.o[1]) * f.v[1] + (a[2] - f.o[2]) * f.v[2]; const ub = (b[0] - f.o[0]) * f.u[0] + (b[1] - f.o[1]) * f.u[1] + (b[2] - f.o[2]) * f.u[2], vb = (b[0] - f.o[0]) * f.v[0] + (b[1] - f.o[1]) * f.v[1] + (b[2] - f.o[2]) * f.v[2]; s += ua * vb - ub * va; } return Math.abs(s / 2); };
  const area = proj(geo.outer) - geo.holes.reduce((s, h) => s + proj(h), 0);
  const grid = gridOfSpec(spec);
  return area / (grid ? grid.a * grid.b : spec.size * spec.size);
}

/**
 * Take a plate's mesh out: its shells, the cuts it made in the members where nothing else holds
 * the cut, and the nodes it created that nothing holds. The plate keeps its definition and its
 * area loads. One undo step with the caller's.
 */
export function clearPlateMesh(id: number): { removedNodes: number; keptNodes: number } {
  const e = plateEntry(id);
  if (!e) return { removedNodes: 0, keptNodes: 0 };
  const loops = plateLoops(e.group);
  const owned = new Set(loops.owned);
  let removedNodes = 0, keptNodes = 0;
  const current = physicalPlates().filter((x) => x.id !== id && plateStatus(x.id) === 'current').map((x) => x.id);
  modelStore.batch(() => {
    untieNodes(owned);
    const spread = new Set(e.surface.meshed?.supported ?? []);
    for (const sp of [...modelStore.supports.values()]) if (spread.has(sp.nodeId) && owned.has(sp.nodeId)) modelStore.removeSupport(sp.id);
    for (const q of e.group.members.quads ?? []) if (modelStore.quads.has(q)) modelStore.removeQuad(q);
    for (const p of e.group.members.plates ?? []) if (modelStore.plates.has(p)) modelStore.removePlate(p);
    // The members the mesh cut, whole again where the cut node is the mesh's and holds nothing else.
    const cut = [...modelStore.elements.values()].filter((el) => owned.has(el.nodeI) || owned.has(el.nodeJ)).map((el) => el.id);
    if (cut.length) removedNodes += mergeCollinear(cut).removedNodes;
    const h = held(id);
    for (const n of owned) {
      if (!modelStore.nodes.has(n)) continue;
      if (h.has(n)) { keptNodes++; continue; }
      modelStore.removeNode(n); removedNodes++;
    }
    const g = modelStore.model.groups.get(id)!;
    modelStore.setGroupMembers(id, { ...g.members, nodes: [...loops.outer, ...loops.holes.flat()], quads: [], plates: [] });
    writeSurface(id, (s) => { const { meshed: _m, ...rest } = s; return rest; });
    // A neighbour reads its mesh's nodes against this one's, so taking this one out would put it out of date.
    for (const x of current) if (plateStatus(x) === 'stale') adoptCurrentMesh(x);
  });
  return { removedNodes, keptNodes };
}

export interface PlateMeshReport { plates: number; cells: number; refused: Array<{ id: number; reason: string }>; droppedLocalLoads: number; keptNodes: number }

/** Put the planned meshes in, replacing each plate's old one, as one undo step. */
export function applyPlateMeshes(plans: readonly PlateMeshPlan[]): PlateMeshReport {
  const report: PlateMeshReport = { plates: 0, cells: 0, refused: [], droppedLocalLoads: 0, keptNodes: 0 };
  const ok = plans.filter((p) => p.mesh && p.input);
  for (const p of plans) if (!p.mesh) report.refused.push({ id: p.id, reason: p.refused ?? 'cannotMesh' });
  if (!ok.length) return report;
  const current = physicalPlates().filter((e) => plateStatus(e.id) === 'current').map((e) => e.id);
  const meshed: number[] = [];
  modelStore.batch(() => {
    const byShell = shellAreaLoads();
    let lifted = 0;
    for (const p of ok) {
      const e = plateEntry(p.id);
      const u = e ? liftableLoads(e, byShell) : null;
      if (!e || !u?.gone.length) continue;
      modelStore.removeLoads(u.gone);
      for (const c of u.cases) modelStore.addGroup(`${e.name} · q`, 'floorLoad', {}, { data: plateLoadDef(e.id, c.caseId, c.q) as unknown as Record<string, unknown> });
      lifted++;
    }
    for (const [k, planned] of ok.entries()) {
      // After the first, each plate is planned again on the model as it now is, so it meets the
      // meshes just put in beside it.
      const p = k === 0 ? planned : (planPlateMesh(planned.id, planned.spec) ?? planned);
      if (!p.mesh || !p.input) { report.refused.push({ id: p.id, reason: p.refused ?? 'cannotMesh' }); continue; }
      const e = plateEntry(p.id);
      if (!e) continue;
      report.droppedLocalLoads += p.localLoads;
      if (e.surface.springs) {
        const owned = new Set(plateLoops(e.group).owned);
        for (const sp of [...modelStore.supports.values()]) if (owned.has(sp.nodeId) && isSpring(sp as never)) modelStore.removeSupport(sp.id);
      }
      report.keptNodes += clearPlateMesh(p.id).keptNodes;
      const before = new Set(modelStore.nodes.keys());
      const fp = p.footprints;
      const r = applyMesh(p.input!, { materialId: e.surface.materialId, thickness: e.surface.thickness, splitBeams: p.spec.followMembers, ...(fp ? { splitAt: outsideFootprints(fp.columns, fp.z) } : {}) }, p.mesh!);
      if (!r || r.occupied) { report.refused.push({ id: p.id, reason: 'occupied' }); continue; }
      const created = [...new Set(r.nodeIds)].filter((n) => !before.has(n));
      if (fp) tieFootprints(new Set(r.nodeIds), fp.columns);
      const g = modelStore.model.groups.get(p.id)!;
      const loops = plateLoops(g);
      const supported = supportSides(loops.outer, created);
      modelStore.setGroupMembers(p.id, { ...g.members, nodes: [...loops.outer, ...loops.holes.flat(), ...created], quads: r.quads, plates: r.plates });
      if (e.surface.curved) for (const q of r.quads) modelStore.setQuadCurved(q, true);
      if (e.surface.offset) {
        for (const q of r.quads) modelStore.setShellOffset('quad', q, e.surface.offset);
        for (const t of r.plates) modelStore.setShellOffset('plate', t, e.surface.offset);
      }
      writeSurface(p.id, (s) => ({ ...s, mesh: p.spec, meshed: { signature: p.signature, cells: r.quads.length + r.plates.length, quality: p.quality!, ...(supported.length ? { supported } : {}) } }));
      report.plates++;
      report.cells += r.quads.length + r.plates.length;
      meshed.push(p.id);
    }
    // Each mesh after the first met the ones put in before it, which reads them out of date by their neighbours' nodes alone.
    for (const id of new Set([...meshed, ...current])) if (plateStatus(id) === 'stale') adoptCurrentMesh(id);
    if (lifted) syncDefinedLoads();
    const springy = meshed.filter((id) => plateEntry(id)?.surface.springs);
    if (springy.length) respring(springy);
  });
  return report;
}

/** The plates every shell of which is among `keys`. */
export function platesWholeIn(keys: ReadonlySet<string>): number[] {
  return physicalPlates().filter((p) => { const k = plateShellKeys(p.id); return k.length > 0 && k.every((x) => keys.has(x)); }).map((p) => p.id);
}

/** What the plates' meshes are given beyond material and thickness, kept on the plates so every mesh gets it; `null` takes it away. */
export function setPlateShellSpec(ids: readonly number[], patch: { curved?: boolean | null; offset?: PlateSurface['offset'] | null; springs?: PlateSurface['springs'] | null }): void {
  for (const id of ids) writeSurface(id, (s) => {
    const next = { ...s };
    for (const k of ['curved', 'offset', 'springs'] as const) {
      if (!(k in patch)) continue;
      const v = patch[k];
      if (v === null || v === undefined || v === false) delete next[k]; else (next as Record<string, unknown>)[k] = v;
    }
    return next;
  });
}

const isSpring = (sp: { type?: string; kz?: number }) => sp.type === 'custom3d' && (sp.kz ?? 0) > 0;

/** The foundation springs of the plates given, from their meshes as they are now: one per node, k summed over every spring plate that node belongs to. */
function respring(ids: readonly number[]): void {
  const springy = physicalPlates().filter((p) => p.surface.springs);
  const affected = new Set<number>();
  for (const id of ids) for (const k of plateShellKeys(id)) shellNodes(k).forEach((n) => affected.add(n));
  if (!affected.size) return;
  const kz = new Map<number, number>();
  const spec = new Map<number, NonNullable<PlateSurface['springs']>>();
  for (const p of springy) {
    const shells = plateShellKeys(p.id).map((k) => ({ nodes: shellNodes(k) })).filter((s) => s.nodes.some((n) => affected.has(n)));
    if (!shells.length) continue;
    for (const [n, a] of tributaryAreas(modelStore.nodes, shells)) {
      if (!affected.has(n) || !(a > 0)) continue;
      kz.set(n, (kz.get(n) ?? 0) + p.surface.springs!.ks * a);
      if (!spec.has(n)) spec.set(n, p.surface.springs!);
    }
  }
  for (const [n, k] of kz) {
    const old = [...modelStore.supports.values()].find((sp) => sp.nodeId === n);
    if (old && !isSpring(old as never)) continue;
    if (old) modelStore.removeSupport(old.id);
    const sp = spec.get(n)!;
    modelStore.addSupportEntry({
      nodeId: n, type: 'custom3d',
      dofRestraints: { tx: sp.holdHorizontal, ty: sp.holdHorizontal, tz: false, rx: false, ry: false, rz: false },
      dofFrame: 'global', kz: k, ...(sp.uplift ? { uplift: true } : {}),
    } as never);
  }
}

function shellNodes(key: string): number[] {
  const id = Number(key.slice(1));
  return [...((key[0] === 'q' ? modelStore.quads.get(id) : modelStore.plates.get(id))?.nodes ?? [])];
}

/** Remove a plate with its mesh and its area loads; one undo step. */
export function deletePlate(id: number): void {
  if (!plateEntry(id)) return;
  modelStore.batch(() => {
    clearPlateMesh(id);
    for (const d of plateLoadDefs(id)) modelStore.removeGroup(d.id);
    const g = modelStore.model.groups.get(id);
    const corner = new Set(g?.members.nodes ?? []);
    modelStore.removeGroup(id);
    // Outline nodes that held only the plate go with it.
    const h = held();
    for (const n of corner) if (modelStore.nodes.has(n) && !h.has(n)) modelStore.removeNode(n);
  });
}

// ─── Before an analysis ──────────────────────────────────────────

export type PlatePreparation =
  | { ok: true; meshed: number; cells: number }
  | { ok: false; reason: 'needsMesh'; plates: string[] }
  | { ok: false; reason: 'refused'; plates: string[] }
  | { ok: false; reason: 'localLoads'; plates: string[] };

/**
 * Mesh what an analysis needs and nothing else: the plates with no mesh or an out-of-date one,
 * each at its own settings, as one undo step. With meshing before the analysis turned off, says
 * which plates stop it instead. Runs once per solve, before its inputs are taken.
 */
export function preparePlatesForAnalysis(): PlatePreparation {
  const need = platesNeedingMesh();
  if (!need.length) return { ok: true, meshed: 0, cells: 0 };
  const names = (ids: number[]) => ids.map((id) => plateEntry(id)?.name ?? `#${id}`);
  if (!meshBeforeAnalysis.value) return { ok: false, reason: 'needsMesh', plates: names(need) };
  const plans = need.map((id) => planPlateMesh(id)).filter((p): p is PlateMeshPlan => !!p);
  // Loads put by hand on the old mesh's elements cannot follow a new mesh: the plate is meshed
  // from its panel, whose plan lists them, never here where they would vanish unseen.
  const loaded = plans.filter((p) => p.localLoads > 0);
  if (loaded.length) return { ok: false, reason: 'localLoads', plates: names(loaded.map((p) => p.id)) };
  const r = applyPlateMeshes(plans);
  if (r.refused.length) return { ok: false, reason: 'refused', plates: names(r.refused.map((x) => x.id)) };
  return { ok: true, meshed: r.plates, cells: r.cells };
}

/**
 * The plates a marquee takes: by their shells when meshed (all of them in a window, any of them
 * across), by their outline's nodes when not.
 */
export function platesInMarquee(shells: ReadonlySet<string>, nodeIn: (id: number) => boolean, isWindow: boolean): number[] {
  const out: number[] = [];
  for (const p of physicalPlates()) {
    const keys = plateShellKeys(p.id);
    const hit = keys.length
      ? (isWindow ? keys.every((k) => shells.has(k)) : keys.some((k) => shells.has(k)))
      : (() => { const n = plateLoops(p.group).outer; return isWindow ? n.every(nodeIn) : n.some(nodeIn); })();
    if (hit) out.push(p.id);
  }
  return out;
}
