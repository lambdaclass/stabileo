import { scenarioSurfaceIntentOf } from '../engine/accounting-source';
import { unifiedPlates } from '../features';
import { arcEdgeBetween as modelArcEdgeBetween, physicalPlateProblems, plateMeshGeometry, type PlateStatus } from '../model/physical/plate-analysis';
import { plateRemeshMessage, wallSlabRefusal } from '../engine/plate-analysis-refusal';
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
import { applyPlacement } from './placement';
import { uiStore } from './ui.svelte';
import { physicalDataOf, type PhysicalData } from '../model/physical';
import { levelAt } from '../model/physical/recognize';
import {
  DEFAULT_PLATE_MESH, externalFeatures, gridOfSpec, memberChains, meshQuality, onOutline, plateGeometry, plateKindOf, plateLoops, plateMeshInput, plateProblem,
  PLATE_FOOTPRINTS, plateSignature, plateSurfaceOf, type MeshQuality, type PlateMeshSpec, type PlateProblem, type PlateSurface,
} from '../model/physical/plate';
import { cross, type Vec3 } from '../model/edit/affine';
import { generateMesh, MAX_MESH_CELLS, MAX_MESH_POINTS, type MeshOutput } from '../model/edit/mesher';
import { frameAlong, gridMesh } from '../model/edit/grid-mesh';
import { rectGrid } from '../model/edit/rect-grid';
import { axisStations, linesAlong, type AxisLines } from '../model/edit/tartan';
import { addedMeshStations, meshStations, sameMeshNode, sharedFrameStations, stationIndex, strictlyOrAt } from '../model/edit/mesh-stations';
import { applyMesh, applyPlacedMesh, placeMesh, regionOccupied, validCells, type MeshPlacement } from '../model/edit/mesh-apply';
import { weldTolerance } from '../model/weld-tolerance';
import { mergeCollinear } from '../model/edit/merge-collinear';
import { addFloorLoadDef, syncDefinedLoads } from './defined-loads';
import { plateNodeReferences, retainedPlateNodes } from './plate-node-references';
import { meshBeforeAnalysis } from './mesh-policy.svelte';
import { endMeshProgress, meshProgress, nextFrame, setMeshProgress } from './mesh-progress.svelte';
import { historyStore } from './history.svelte';
export { meshBeforeAnalysis };
import { expandDefinition, type DefinitionModel, type Expansion, type FloorLoadDef } from '../model/loads/floor-definitions';
import { columnFootprintsAt, footprintGrid, outsideFootprints, tieFootprints, releaseFootprintLinks, type ColumnFootprint, type FootprintCells } from '../model/building/column-footprints';
import { designData } from './design-data';
import { tributaryAreas } from '../engine/foundation-springs';
import type { ModelGroup, SupportType, SurfaceLoad3D } from './model.svelte';

export type { PlateStatus };

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
export const arcEdgeBetween = (a: number, b: number) => modelArcEdgeBetween(modelStore.model, a, b);

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

function featuresOf(
  e: PlateEntry, replaced?: ReadonlyMap<number, number>,
  geo = plateMeshGeometry(modelStore.model, e.group, e.surface.mesh).geo,
) {
  if (!geo) return null;
  const loops = plateLoops(e.group);
  const mine = new Set(loops.owned);
  const { owned, shellNodes, chains } = sharedFeatures();
  const inMine = new Map<number, number>();
  for (const q of e.group.members.quads ?? []) for (const n of modelStore.quads.get(q)?.nodes ?? []) inMine.set(n, (inMine.get(n) ?? 0) + 1);
  for (const p of e.group.members.plates ?? []) for (const n of modelStore.plates.get(p)?.nodes ?? []) inMine.set(n, (inMine.get(n) ?? 0) + 1);
  const neighbours = new Set<number>();
  for (const [n, c] of shellNodes) if (c > (replaced?.get(n) ?? inMine.get(n) ?? 0)) neighbours.add(n);
  const loopNodes = new Set([...loops.outer, ...loops.holes.flat()]);
  const at = (n: number): Vec3 | null => { const p = modelStore.nodes.get(n); return p ? [p.x, p.y, p.z ?? 0] : null; };
  return { geo, features: externalFeatures(plateModel(), geo, owned, loopNodes, { mine, neighbours, chains }), neighbourAt: (n: number) => (neighbours.has(n) ? at(n) : null), neighbours };
}

/** A plate's mesh settings as meshed: a waffle slab no coarser than its rib spacing, so each rib has its row of elements. */
function specOf(e: PlateEntry, override?: Partial<PlateMeshSpec>): PlateMeshSpec {
  const spec = { ...e.surface.mesh, ...(override ?? {}) };
  const rib = unifiedPlates() && e.physical.typology === 'waffle' ? designData().specialFloors?.systems?.[`S${e.id}`]?.ribbed : undefined;
  return rib ? { ...spec, size: Math.min(spec.size, rib.spacingX, rib.spacingY ?? rib.spacingX) } : spec;
}

/**
 * The columns a slab's mesh has to represent: a horizontal rectangle in plan with columns reaching
 * it gets lines on their faces and its nodes inside each section tied to the column. Null for
 * anything else, which meshes as it always did.
 */
function footprintsOf(e: PlateEntry, geo: NonNullable<ReturnType<typeof plateGeometry>>): { corners: Array<{ x: number; y: number; z: number }>; columns: ColumnFootprint[]; z: number } | null {
  if (!unifiedPlates()) return null;
  if (e.physical.kind !== 'slab' || geo.holes.length || geo.outer.length !== 4 || Math.abs(geo.frame.n[2]) < 1 - 1e-6) return null;
  const corners = geo.outer.map((p) => ({ x: p[0], y: p[1], z: p[2] }));
  const z = corners[0]!.z;
  const columns = columnFootprintsAt(z);
  if (!columns.length || !footprintGrid(corners, e.surface.mesh.size, columns)) return null;
  const x0 = Math.min(...corners.map((c) => c.x)), x1 = Math.max(...corners.map((c) => c.x)), y0 = Math.min(...corners.map((c) => c.y)), y1 = Math.max(...corners.map((c) => c.y));
  const near = columns.filter((c) => c.x > x0 - c.hx - 1e-6 && c.x < x1 + c.hx + 1e-6 && c.y > y0 - c.hy - 1e-6 && c.y < y1 + c.hy + 1e-6);
  return near.length ? { corners, columns: near, z } : null;
}

/** The lines of the plates being meshed together, by mesh size (`tartan.ts`); null outside such a run. */
let tartan: Map<number, AxisLines> | null = null;

/** Every coordinate the plates `ids` force along each global axis their planes contain, laid out at each one's mesh size. A slab's column faces are its floor's own, added by the slab: a column narrower above would otherwise put both faces on every floor. */
function tartanOf(ids: Iterable<number>, specs: ReadonlyMap<number, PlateMeshSpec>, replaced?: ReadonlyMap<number, number>): Map<number, AxisLines> {
  const forced = new Map<number, [number[], number[], number[]]>();
  for (const id of ids) {
    const e = plateEntry(id), spec = specs.get(id);
    if (!spec || (!unifiedPlates() && !gridOfSpec(spec))) continue;
    const f = e ? featuresOf(e, replaced) : null;
    if (!e || !spec || !f) continue;
    const n = f.geo.frame.n, size = spec.size;
    const lists = forced.get(size) ?? [[], [], []];
    forced.set(size, lists);
    const pts = [...f.geo.outer, ...f.geo.holes.flat(), ...(f.features?.points ?? []), ...(f.features?.segments.flat() ?? [])];
    for (const k of [0, 1, 2] as const) if (Math.abs(n[k]) < 1e-9) for (const p of pts) lists[k].push(p[k]);
  }
  return new Map([...forced].map(([size, l]) => [size, l.map((v) => axisStations(v, size)) as unknown as AxisLines]));
}

/** The run's lines along a plate frame's directions, where it is in one. */
function tartanLines(spec: PlateMeshSpec, frame: { o: Vec3; u: Vec3; v: Vec3 }, cells?: { a: number; b: number }): { u: number[] | null; v: number[] | null } | undefined {
  const lines = tartan?.get(spec.size);
  const on = (side: number | undefined) => side === undefined || Math.abs(side - spec.size) < 1e-9;
  return lines ? { u: on(cells?.a) ? linesAlong(lines, frame.o, frame.u) : null, v: on(cells?.b) ? linesAlong(lines, frame.o, frame.v) : null } : undefined;
}

/** The run's lines along X and Y for a slab panel's column-section grid, where its cell along that axis is the run's size. */
function tartanXY(spec: PlateMeshSpec, cells: { ax: number; ay: number }): { xs: readonly number[] | null; ys: readonly number[] | null } | null {
  const lines = tartan?.get(spec.size);
  if (!lines) return null;
  const on = (side: number) => Math.abs(side - spec.size) < 1e-9;
  return { xs: on(cells.ax) ? lines[0] : null, ys: on(cells.ay) ? lines[1] : null };
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const FOOTPRINTS = PLATE_FOOTPRINTS;

/** What a mesh is made from (`plateSignature`), with the column sections it represents. */
function signatureOf(e: PlateEntry, f: NonNullable<ReturnType<typeof featuresOf>>, spec: PlateMeshSpec): string {
  const fp = footprintsOf(e, f.geo);
  const shellNeighbours = spec.followMembers ? [] : [...f.neighbours].map(f.neighbourAt)
    .filter((point): point is Vec3 => point !== null && onOutline(f.geo, point));
  return plateSignature(f.geo, spec, f.features, shellNeighbours) + (fp ? `${FOOTPRINTS}${fp.columns.map((c) => `${r6(c.x)},${r6(c.y)},${r6(c.hx)},${r6(c.hy)}`).sort().join(';')}` : '');
}


/** A key from `signatureOf` as stored: the part analysis checks, and the column sections apart. */
function meshedKey(key: string): { signature: string; footprints?: string } {
  const at = key.indexOf(FOOTPRINTS);
  return at < 0 ? { signature: key } : { signature: key.slice(0, at), footprints: key.slice(at + FOOTPRINTS.length) };
}

function withoutFootprints<T extends { footprints?: string }>(m: T | undefined): Omit<T, 'footprints'> | Record<string, never> {
  if (!m) return {};
  const { footprints: _, ...rest } = m;
  return rest;
}

const storedKey = (m: { signature: string; footprints?: string }) => m.signature + (m.footprints ? FOOTPRINTS + m.footprints : '');

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
    return { ...s, meshed: { ...withoutFootprints(s.meshed), ...meshedKey(signatureOf(e, f, specOf(e))), cells: cells.length, quality: meshQuality({ points, cells }), ...(original ? { original: true } : {}) } };
  });
}

/** The type of a node's support when it is a plain one (a type and nothing else). */
function plainSupport(n: number) {
  const sp = [...modelStore.supports.values()].find((x) => x.nodeId === n);
  return sp && Object.entries(sp).every(([k, v]) => k === 'id' || k === 'nodeId' || k === 'type' || v === undefined) ? sp.type : undefined;
}

/** The type the plate's held sides give node `n`, if it lies on one. */
function sideTypeAt(edges: PlateSurface['edgeSupports'], n: number): string | undefined {
  const P = v3(n);
  if (!P) return undefined;
  return (edges ?? []).find((side) => { const A = v3(side.from), B = v3(side.to); return !!A && !!B && strictlyOrAt(P, A, B, true); })?.type;
}

/** The nodes given that are on a held side of the plate and have no support get the side's; returns them. */
function supportSides(edges: PlateSurface['edgeSupports'], nodes: readonly number[]) {
  const supportedNow = new Set([...modelStore.supports.values()].map((x) => x.nodeId));
  const added: Array<{ id: number; nodeId: number }> = [];
  for (const side of edges ?? []) {
    const A = v3(side.from), B = v3(side.to);
    if (!A || !B) continue;
    for (const n of nodes) {
      const P = v3(n);
      if (!P || supportedNow.has(n) || !strictlyOrAt(P, A, B, true)) continue;
      const id = modelStore.addSupport(n, side.type as SupportType);
      added.push({ id, nodeId: n });
      supportedNow.add(n);
    }
  }
  return added;
}

/**
 * Hold sides of the plate all along, each from one outline node to another, with `type`: the nodes
 * on them get it now (its mesh's nodes taken away with the mesh) and with every mesh. Returns how
 * many supports it added.
 */
export function holdPlateSides(id: number, sides: ReadonlyArray<readonly [number, number]>, type: SupportType): number {
  const e = plateEntry(id);
  if (!e) return 0;
  const have = e.surface.edgeSupports ?? [];
  const fresh = sides.map(([from, to]) => ({ from, to, type }))
    .filter((x) => !have.some((h) => (h.from === x.from && h.to === x.to) || (h.from === x.to && h.to === x.from)));
  if (!fresh.length) return 0;
  const outer = plateLoops(e.group).outer;
  let added = 0;
  modelStore.batch(() => {
    const ends = supportSides(fresh, outer);
    const onMesh = supportSides(fresh, [...new Set(plateShellKeys(id).flatMap(shellNodes))]);
    added = ends.length + onMesh.length;
    writeSurface(id, (s) => ({
      ...s, edgeSupports: [...have, ...fresh],
      ...(s.meshed && onMesh.length ? { meshed: {
        ...s.meshed,
        supported: [...(s.meshed.supported ?? []), ...onMesh.map(support => support.nodeId)],
        supportIds: [...(s.meshed.supportIds ?? []), ...onMesh.map(support => support.id)],
      } } : {}),
    }));
  });
  return added;
}

/** `holdPlateSides` for the outline sides whose two ends are at elevation `z`. */
export function holdPlateSidesAt(id: number, z: number, type: SupportType): number {
  const e = plateEntry(id);
  if (!e) return 0;
  const outer = plateLoops(e.group).outer;
  const at = (n: number) => { const p = modelStore.nodes.get(n); return !!p && Math.abs((p.z ?? 0) - z) < 1e-6; };
  return holdPlateSides(id, outer.map((a, i) => [a, outer[(i + 1) % outer.length]!] as const).filter(([a, b]) => at(a) && at(b)), type);
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
    else s = signatureOf(e, f, specOf(e)) === storedKey(e.surface.meshed) && (e.surface.meshed.original || !meshHangsNeighbours(e, f)) ? 'current' : 'stale';
  }
  statusMemo.map.set(id, s);
  return s;
}

/** The plates whose mesh is missing or out of date. `coarse: false` leaves out plates still on the coarse shells they came with, which solve as they are. */
export function platesNeedingMesh(opts: { coarse?: boolean } = {}): number[] {
  const coarse = opts.coarse ?? true;
  return physicalPlates().filter((p) => { const s = plateStatus(p.id); return s === 'unmeshed' || s === 'stale' || (coarse && s === 'current' && coarseAsModelled(p)); }).map((p) => p.id);
}

let coarseMemo: { version: number; groups: unknown; loads: unknown; map: Map<number, boolean> } | null = null;
/**
 * Shells that came with the model and are coarser than the plate's mesh size, such as one shell
 * for a whole bay: no mesher's mesh, and what "mesh before analysis" meshes. A fine mesh that came
 * with the model is kept, and so are shells carrying loads put on them by hand, which a new mesh would drop.
 */
export function coarseAsModelled(e: PlateEntry): boolean {
  if (!unifiedPlates() || !e.surface.meshed?.original) return false;
  if (!coarseMemo || coarseMemo.version !== modelStore.modelVersion || coarseMemo.groups !== modelStore.model.groups || coarseMemo.loads !== modelStore.loads) {
    coarseMemo = { version: modelStore.modelVersion, groups: modelStore.model.groups, loads: modelStore.loads, map: new Map() };
  }
  const hit = coarseMemo.map.get(e.id);
  if (hit !== undefined) return hit;
  const limit = 1.5 * specOf(e).size;
  let coarse = false;
  if (localLoadsOn(e) > 0) { coarseMemo.map.set(e.id, false); return false; }
  const shells = [...(e.group.members.quads ?? []).map((q) => modelStore.quads.get(q)?.nodes), ...(e.group.members.plates ?? []).map((q) => modelStore.plates.get(q)?.nodes)];
  for (const ns of shells) {
    if (!ns || coarse) break;
    for (let i = 0; i < ns.length && !coarse; i++) {
      const a = modelStore.nodes.get(ns[i]!), b = modelStore.nodes.get(ns[(i + 1) % ns.length]!);
      if (a && b && Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) > limit) coarse = true;
    }
  }
  coarseMemo.map.set(e.id, coarse);
  return coarse;
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
  const unified = unifiedPlates();
  const first = unified ? 1 : physicalPlates().length + 1;
  return (kind) => {
    const prefix = unified ? (kind === 'wall' ? 'M' : 'L') : 'P';
    let n = first;
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
  const surface: PlateSurface = { loops: [p.outline.length, ...holes.map((h) => h.length)], materialId: p.materialId, thickness: p.thickness, mesh: { ...(p.mesh ?? DEFAULT_PLATE_MESH) }, edgeSupports: [], ...(mids.length ? { arcMids: mids } : {}) };
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

/** Set or clear a plate's mid-surface offset, on its definition and every shell of its mesh; one undo step. */
export function setPlateOffset(id: number, offset: import('../model/element-3d-metadata').ShellOffset | undefined): void {
  const e = plateEntry(id);
  if (!e) return;
  modelStore.batch(() => {
    writeSurface(id, (s) => { const { offset: _old, ...rest } = s; return offset ? { ...rest, offset: { ...offset } } : rest; });
    for (const q of e.group.members.quads ?? []) modelStore.setShellOffset('quad', q, offset);
    for (const q of e.group.members.plates ?? []) modelStore.setShellOffset('plate', q, offset);
  });
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

function retainedArcIndices(e: PlateEntry, loops: number[][], newPoint?: number | null): number[] {
  const controls = new Set((e.surface.arcMids ?? []).map(index => e.group.members.nodes?.[index]));
  if (newPoint != null) controls.add(newPoint);
  return loops.flat().flatMap((node, index) => controls.has(node) ? [index] : []);
}

export function editPlateHole(id: number, edit: { append: number[] } | { remove: number }): PlateProblem | null {
  const e = plateEntry(id);
  if (!e) return 'needNodes';
  const { outer, holes } = plateLoops(e.group);
  if ('remove' in edit && !holes[edit.remove]) return 'needNodes';
  const updated = 'append' in edit ? [...holes, edit.append] : holes.filter((_, i) => i !== edit.remove);
  return setPlateLoops(id, outer, updated, retainedArcIndices(e, [outer, ...updated]));
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
  let corner = at;
  if (mids.has(next)) {
    outer.splice(next, 1);
    if (next < corner) corner--;
  }
  if (mid !== null) outer.splice(corner + 1, 0, mid);
  const arcList = retainedArcIndices(e, [outer, ...loops.holes], mid);
  const problem = plateProblem(plateModel(), outer, loops.holes, arcList);
  if (problem) return problem;
  modelStore.batch(() => {
    modelStore.setGroupMembers(id, { ...e.group.members, nodes: [...outer, ...loops.holes.flat(), ...loops.owned] });
    writeSurface(id, (s) => ({ ...s, loops: [outer.length, ...loops.holes.map((h) => h.length)], ...(arcList.length ? { arcMids: arcList } : { arcMids: undefined }) }));
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

/** One definition per plate picked whole, as the floor-load panel adds them: the panel's own, distribution and span included, aimed at each plate. */
export function pickedPlateDefs(ids: readonly number[], def: FloorLoadDef): Array<{ id: number; def: FloorLoadDef }> {
  return ids.map((id) => ({ id, def: { ...def, target: { by: 'group', groupId: id } } }));
}

/** What those definitions write together, previewed before they are added. */
export function previewPlateDefs(defs: ReadonlyArray<{ def: FloorLoadDef }>, opts: { leftHand: boolean }): Expansion {
  const each = defs.map(({ def }) => expandDefinition(modelStore.model as unknown as DefinitionModel, def, {}, -1, opts));
  const loads = each.flatMap((e) => e.loads);
  return { defId: -1, loads, result: null, totalKN: NaN, ...(loads.length ? {} : { problem: each[0]?.problem ?? 'nothingTargeted' }) };
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

export type PlateMeshRefusalReason = 'invalid' | 'tooManyCells' | 'cannotMesh' | 'occupied' | 'ambiguousSweep' | 'shellEdits' | 'interrupted' | 'localLoads';

export interface PlateMeshPlan {
  id: number;
  name: string;
  spec: PlateMeshSpec;
  /** Null when refused, with the reason. */
  mesh: MeshOutput | null;
  refused?: PlateMeshRefusalReason;
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

/** Plain uniform area loads on every shell given, case by case, that a plate's own load can take the place of: those loads, and the cases and values it is given. */
export function uniformLoads(keys: readonly string[], byShell: ReadonlyMap<string, Array<{ id: number; caseId: number; q: number }>>): { gone: number[]; cases: Array<{ caseId: number; q: number; ids: number[] }> } {
  const byCase = new Map<number, Array<{ id: number; key: string; q: number }>>();
  for (const key of keys) for (const l of byShell.get(key) ?? []) (byCase.get(l.caseId) ?? byCase.set(l.caseId, []).get(l.caseId)!).push({ ...l, key });
  const gone: number[] = [], cases: Array<{ caseId: number; q: number; ids: number[] }> = [];
  for (const [caseId, list] of byCase) {
    if (caseId < 0 || list.length !== keys.length || new Set(list.map((x) => x.key)).size !== keys.length) continue;
    const q = list[0]!.q;
    if (!Number.isFinite(q) || list.some((x) => x.q !== q)) continue;
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
    // A load without a case is in case 1, as everywhere loads are read (`load-ops.ts`).
    (out.get(key) ?? out.set(key, []).get(key)!).push({ id: d.id, caseId: d.caseId ?? 1, q: plain(d) && !scenarioSurfaceIntentOf(l) ? d.q : NaN });
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
  const busy = plateNodeReferences();
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
/** The run's lines for a batch planned together, as applying it lays them out (`conformingMeshes`). */
function batchTartan(ids: readonly number[], spec?: Partial<PlateMeshSpec>): Map<number, AxisLines> {
  const specs = new Map(ids.flatMap((id) => { const e = plateEntry(id); return e ? [[id, specOf(e, spec)] as const] : []; }));
  const replaced = new Map<number, number>();
  for (const key of ids.flatMap(plateShellKeys)) for (const n of (key[0] === 'q' ? modelStore.quads.get(+key.slice(1)) : modelStore.plates.get(+key.slice(1)))?.nodes ?? []) replaced.set(n, (replaced.get(n) ?? 0) + 1);
  return tartanOf(specs.keys(), specs, replaced);
}

export async function planPlateMeshes(ids: readonly number[], spec?: Partial<PlateMeshSpec>, opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<PlateMeshPlan[] | null> {
  const out: PlateMeshPlan[] = [];
  const meshedAgain = new Set(ids.flatMap(plateShellKeys)), lines = batchTartan(ids, spec);
  for (let i = 0; i < ids.length; i++) {
    if (opts.signal?.aborted) return null;
    const plan = planPlateMesh(ids[i]!, spec, { meshedAgain, lines });
    if (plan) out.push(plan);
    opts.onProgress?.(i + 1, ids.length);
    if (ids.length > 1) await nextFrame();
  }
  return out;
}

function planPlateMeshesNow(ids: readonly number[]): PlateMeshPlan[] {
  const meshedAgain = new Set(ids.flatMap(plateShellKeys)), lines = batchTartan(ids);
  return ids.map((id) => planPlateMesh(id, undefined, { meshedAgain, lines })).filter((plan): plan is PlateMeshPlan => !!plan);
}

/** One plate's plan, synchronously. */
export function planPlateMesh(id: number, specOverride?: Partial<PlateMeshSpec>, opts: { meshedAgain?: ReadonlySet<string>; replaced?: ReadonlyMap<number, number>; lines?: Map<number, AxisLines> } = {}): PlateMeshPlan | null {
  if (!opts.lines) return planPlateMeshNow(id, specOverride, opts);
  const outside = tartan;
  tartan = opts.lines;
  try { return planPlateMeshNow(id, specOverride, opts); } finally { tartan = outside; }
}

function planPlateMeshNow(id: number, specOverride?: Partial<PlateMeshSpec>, opts: { meshedAgain?: ReadonlySet<string>; replaced?: ReadonlyMap<number, number> } = {}): PlateMeshPlan | null {
  const e = plateEntry(id);
  if (!e) return null;
  const spec = specOf(e, specOverride);
  const base = { id, name: e.name, spec, localLoads: localLoadsOn(e), keptNodes: keptMeshNodes(e) };
  const geometry = plateMeshGeometry(modelStore.model, e.group, spec);
  if (geometry.refused) {
    return { ...base, mesh: null, refused: geometry.refused, cells: 0, quality: null, signature: '', input: null, mixed: false };
  }
  const f = featuresOf(e, opts.replaced, geometry.geo)!;
  const input = plateMeshInput(f.geo, spec, f.features);
  const signature = signatureOf(e, f, spec);
  const preview = (mesh: MeshOutput, mixed: boolean, extra?: Pick<PlateMeshPlan, 'grid' | 'aDir' | 'bDir' | 'footprints'>): PlateMeshPlan => {
    if (!opts.replaced && placePlateEdits(e, mesh) === null) {
      return { ...base, mesh: null, refused: 'shellEdits', cells: 0, quality: null, signature, input, mixed: false };
    }
    return { ...base, mesh, cells: mesh.cells.length, quality: meshQuality(mesh), signature, input, mixed, ...extra };
  };
  const fp = footprintsOf(e, f.geo);
  const grid = gridOfSpec(spec);
  const fpCells = fp ? footprintCells(spec, grid, f.geo.frame) : null;
  const fpMesh = fp && fpCells ? footprintMesh(f, fp, fpCells.cells, spec) : null;
  if (fp && fpCells && fpMesh) {
    if (fpMesh.cells.length > MAX_MESH_CELLS) return { ...base, mesh: null, refused: 'tooManyCells', cells: fpMesh.cells.length, quality: null, signature, input, mixed: false };
    return preview(fpMesh, false, {
      footprints: { columns: fp.columns, z: fp.z }, aDir: fpCells.aDir, bDir: fpCells.bDir,
      ...(grid ? { grid: { gridCells: fpMesh.cells.length, bandCells: 0, cellA: grid.a, cellB: grid.b } } : {}),
    });
  }
  // A plate far past the cap would be a long wait for a refusal: estimate from the area first.
  const estimate = plateAreaEstimate(f.geo, spec);
  if (estimate > MAX_MESH_CELLS * 1.5) return { ...base, mesh: null, refused: 'tooManyCells', cells: Math.round(estimate), quality: null, signature, input, mixed: false };
  if (grid) {
    const frame = grid.orient === 'globalX' ? frameAlong(f.geo.frame, [1, 0, 0]) : f.geo.frame;
    // Lines through the whole plate meet a neighbour's nodes without a transition strip, which put
    // new points on the far side for the next plate to meet in turn (a stack of walls grew storey by storey).
    const rect = rectGridOf(f.geo, spec, f.features, neighbourEdges(e, f, opts.meshedAgain), { frame, a: grid.a, b: grid.b });
    if (rect) {
      if (rect.cells.length > MAX_MESH_CELLS) return { ...base, mesh: null, refused: 'tooManyCells', cells: rect.cells.length, quality: null, signature, input, mixed: false };
      return preview(rect, false, { grid: { gridCells: rect.cells.length, bandCells: 0, cellA: grid.a, cellB: grid.b }, aDir: frame.u, bDir: frame.v });
    }
    const g = gridMesh({
      outer: f.geo.outer, holes: f.geo.holes, frame, a: grid.a, b: grid.b, element: 'quad',
      ...(input.sides ? { sides: input.sides } : {}), fixedPoints: input.fixedPoints ?? [], fixedSegments: input.fixedSegments ?? [],
    });
    if (!g) return { ...base, mesh: null, refused: 'cannotMesh', cells: 0, quality: null, signature, input, mixed: false };
    if (g.cells.length > MAX_MESH_CELLS) return { ...base, mesh: null, refused: 'tooManyCells', cells: g.cells.length, quality: null, signature, input, mixed: false };
    const { gridCells, bandCells, cellA, cellB, ...mesh } = g;
    return preview(mesh, bandCells > 0, { grid: { gridCells, bandCells, cellA, cellB }, aDir: frame.u, bDir: frame.v });
  }
  // In a run sharing grid lines, a rectilinear plate takes them: a mesh of its own divisions met its neighbours' only by slivers.
  const shared = tartan ? rectGridOf(f.geo, spec, f.features, neighbourEdges(e, f, opts.meshedAgain)) : null;
  const general = shared ? null : generateMesh(input);
  const mesh = shared ?? (general?.structured ? general : rectGridOf(f.geo, spec, f.features, neighbourEdges(e, f, opts.meshedAgain)) ?? general);
  if (!mesh) return { ...base, mesh: null, refused: 'cannotMesh', cells: 0, quality: null, signature, input, mixed: false };
  if (mesh.cells.length > MAX_MESH_CELLS) return { ...base, mesh: null, refused: 'tooManyCells', cells: mesh.cells.length, quality: null, signature, input, mixed: false };
  return preview(mesh, spec.element === 'quad' && !mesh.structured);
}

type PlateFrameLike = { o: Vec3; u: Vec3; v: Vec3; n: Vec3 };

const v3 = (n: number): Vec3 | null => { const p = modelStore.nodes.get(n); return p ? [p.x, p.y, p.z ?? 0] : null; };

function onLoops(loops: readonly (readonly Vec3[])[], p: Vec3): boolean {
  return loops.some((l) => l.some((a, i) => strictlyOrAt(p, a, l[(i + 1) % l.length]!, true)));
}

const hangsOn = (points: readonly Vec3[], edges: ReadonlyArray<readonly [Vec3, Vec3]>) =>
  points.some((p) => edges.some(([a, b]) => strictlyOrAt(p, a, b, false)));

/** The edges of other plates' shells that lie along this plate's outline or holes, but those of shells `skip` will mesh again. */
function neighbourEdges(e: PlateEntry, f: { geo: { outer: Vec3[]; holes: Vec3[][] }; neighbours: Set<number> }, skip?: ReadonlySet<string>): Array<[Vec3, Vec3]> {
  const loops = [f.geo.outer, ...f.geo.holes];
  const near = new Map<number, Vec3>();
  for (const n of f.neighbours) { const p = v3(n); if (p && onLoops(loops, p)) near.set(n, p); }
  if (near.size < 2) return [];
  const mine = new Set([...(e.group.members.quads ?? []).map((q) => `q${q}`), ...(e.group.members.plates ?? []).map((q) => `p${q}`)]);
  const out: Array<[Vec3, Vec3]> = [];
  const take = (key: string, ns: readonly number[]) => {
    if (mine.has(key) || skip?.has(key)) return;
    ns.forEach((a, i) => { const pa = near.get(a), pb = near.get(ns[(i + 1) % ns.length]!); if (pa && pb) out.push([pa, pb]); });
  };
  for (const q of modelStore.quads.values()) take(`q${q.id}`, q.nodes);
  for (const q of modelStore.plates.values()) take(`p${q.id}`, q.nodes);
  return out;
}

/** Whether another plate's shells have a node strictly inside one of this plate's shell edges. */
function meshHangsNeighbours(e: PlateEntry, f = featuresOf(e)): boolean {
  if (!f) return false;
  const loops = [f.geo.outer, ...f.geo.holes];
  const points = [...f.neighbours].map(v3).filter((p): p is Vec3 => !!p && onLoops(loops, p));
  if (!points.length) return false;
  const edges: Array<[Vec3, Vec3]> = [];
  const add = (ns: readonly number[] | undefined) => ns?.forEach((a, i) => { const pa = v3(a), pb = v3(ns[(i + 1) % ns.length]!); if (pa && pb) edges.push([pa, pb]); });
  for (const q of e.group.members.quads ?? []) add(modelStore.quads.get(q)?.nodes);
  for (const q of e.group.members.plates ?? []) add(modelStore.plates.get(q)?.nodes);
  return hangsOn(points, edges);
}

/**
 * Rectangles for a plate whose sides run along its frame (an L, a notch, rectangular holes such as
 * a wall's openings), where the general mesher would give distorted quadrilaterals around them.
 * Null where a neighbour's shell edge along a side would have a grid point strictly inside it: that
 * node would hang. A neighbour's edge from corner to corner is one shell spanning the side, which no
 * mesher meets better: the grid stands, and that neighbour waits for a mesh of its own.
 */
function rectGridOf(geo: NonNullable<ReturnType<typeof plateGeometry>>, spec: PlateMeshSpec, features: { points: Vec3[]; segments: Array<[Vec3, Vec3]> } | null, shellNeighbours: ReadonlyArray<readonly [Vec3, Vec3]>, along?: { frame: PlateFrameLike; a: number; b: number }): MeshOutput | null {
  if (!unifiedPlates() && !along) return null;
  const frame = along?.frame ?? geo.frame, lines = tartanLines(spec, frame, along ? { a: along.a, b: along.b } : undefined);
  const g = rectGrid({
    frame, outer: geo.outer, holes: geo.holes, a: along?.a ?? spec.size, b: along?.b ?? spec.size, element: spec.element, maxCells: MAX_MESH_CELLS,
    fixedPoints: features?.points ?? [], fixedSegments: spec.followMembers && features ? features.segments : [],
    ...(lines ? { lines } : {}),
  });
  if (!g) return null;
  const corner = (p: Vec3) => [geo.outer, ...geo.holes].some((l) => l.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6));
  const meshedAlong = shellNeighbours.filter(([a, b]) => !corner(a) || !corner(b));
  if (meshedAlong.length && hangsOn([...g.boundary].map((i) => g.points[i]!), meshedAlong)) return null;
  return g;
}

/**
 * The column-section grid of a slab panel through the members it follows and its neighbours' nodes
 * on its sides; null when a member crosses it at a slant. A neighbour whose edge it then puts a
 * node inside waits for its own mesh again (`meshHangsNeighbours`).
 */
function footprintMesh(f: NonNullable<ReturnType<typeof featuresOf>>, fp: NonNullable<ReturnType<typeof footprintsOf>>, cells: FootprintCells, spec: PlateMeshSpec): MeshOutput | null {
  const loops = [f.geo.outer, ...f.geo.holes];
  const follow = spec.followMembers && f.features ? f.features : null;
  const segments = follow?.segments ?? [];
  if (segments.some(([a, b]) => Math.abs(a[0] - b[0]) > 1e-6 && Math.abs(a[1] - b[1]) > 1e-6)) return null;
  const points = follow ? follow.points : [...f.neighbours].map(v3).filter((p): p is Vec3 => !!p && onLoops(loops, p));
  const ends = segments.flat(), lines = tartanXY(spec, cells);
  const mesh = footprintGrid(fp.corners, { ...cells, ...(lines?.xs ? { ax: Infinity } : {}), ...(lines?.ys ? { ay: Infinity } : {}) }, fp.columns, {
    xs: [...[...points, ...ends].map((p) => p[0]), ...(lines?.xs ?? [])],
    ys: [...[...points, ...ends].map((p) => p[1]), ...(lines?.ys ?? [])],
  });
  if (!mesh) return null;
  const on = new Set(mesh.points.map((p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`));
  if (points.some((p) => !on.has(`${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`))) return null;
  return mesh;
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
  return removePlateMesh(id);
}

function removePlateMesh(id: number, updateNeighbours = true, preserveNodes?: ReadonlySet<number>): { removedNodes: number; keptNodes: number } {
  const e = plateEntry(id);
  if (!e) return { removedNodes: 0, keptNodes: 0 };
  const loops = plateLoops(e.group);
  const owned = new Set(loops.owned);
  let removedNodes = 0, keptNodes = 0;
  const current = updateNeighbours ? physicalPlates().filter((x) => x.id !== id && plateStatus(x.id) === 'current').map((x) => x.id) : [];
  modelStore.batch(() => {
    releaseFootprintLinks(id);
    const spread = new Set(e.surface.meshed?.supportIds ?? []);
    // A spread support was only given to a node without one, so it is taken back from the user's nodes too, unless edited since.
    // The foundation springs on the mesh's own nodes go with it, or they would hold those nodes in the model.
    const springNodes = e.surface.springs ? plateShellKeys(id).flatMap(shellNodes) : [];
    for (const sp of [...modelStore.supports.values()]) {
      const given = spread.has(sp.id) ? sideTypeAt(e.surface.edgeSupports, sp.nodeId) : undefined;
      if (given !== undefined && plainSupport(sp.nodeId) === given) modelStore.removeSupport(sp.id);
    }
    if (e.group.members.quads?.length || e.group.members.plates?.length) modelStore.bulkMutate(() => {
      for (const q of e.group.members.quads ?? []) if (modelStore.quads.has(q)) modelStore.removeQuad(q);
      for (const p of e.group.members.plates ?? []) if (modelStore.plates.has(p)) modelStore.removePlate(p);
    });
    respringAt(springNodes);
    // The members the mesh cut, whole again where the cut node is the mesh's and holds nothing else.
    const cut = [...modelStore.elements.values()].filter((el) => owned.has(el.nodeI) || owned.has(el.nodeJ)).map((el) => el.id);
    if (cut.length) {
      const retained = plateNodeReferences();
      for (const n of preserveNodes ?? []) retained.add(n);
      removedNodes += mergeCollinear(cut, retained).removedNodes;
    }
    const h = retainedPlateNodes(id);
    if (owned.size) modelStore.bulkMutate(() => {
      for (const n of owned) {
        if (!modelStore.nodes.has(n) || preserveNodes?.has(n)) continue;
        if (h.has(n)) { keptNodes++; continue; }
        modelStore.removeNode(n); removedNodes++;
      }
    });
    const g = modelStore.model.groups.get(id)!;
    modelStore.setGroupMembers(id, { ...g.members, nodes: [...loops.outer, ...loops.holes.flat()], quads: [], plates: [] });
    writeSurface(id, (s) => { const { meshed: _m, ...rest } = s; return rest; });
    // A neighbour reads its mesh's nodes against this one's, so taking this one out would put it out of date.
    for (const x of current) {
      const neighbour = plateEntry(x);
      if (neighbour && plateStatus(x) === 'stale' && !meshHangsNeighbours(neighbour)) adoptCurrentMesh(x);
    }
  });
  return { removedNodes, keptNodes };
}

function editedPlateShells(e: PlateEntry) {
  const inheritedOffset = e.surface.offset;
  const isLocalOffset = (offset: PlateSurface['offset']) => {
    if (!offset || !inheritedOffset) return offset !== inheritedOffset;
    return offset.frame !== inheritedOffset.frame || offset.x !== inheritedOffset.x
      || offset.y !== inheritedOffset.y || offset.z !== inheritedOffset.z;
  };
  const quads = (e.group.members.quads ?? []).flatMap(id => {
    const quad = modelStore.quads.get(id);
    return quad && (isLocalOffset(quad.offset) || !!quad.curved !== !!e.surface.curved) ? [quad] : [];
  });
  const plates = (e.group.members.plates ?? []).flatMap(id => {
    const plate = modelStore.plates.get(id);
    return plate && isLocalOffset(plate.offset) ? [plate] : [];
  });
  return [...quads, ...plates];
}

export const hasPlateShellEdits = (e: PlateEntry): boolean => editedPlateShells(e).length > 0;

function cycleKey(nodes: readonly number[]): string {
  const first = nodes.indexOf(Math.min(...nodes));
  return [...nodes.slice(first), ...nodes.slice(0, first)].join(',');
}

function cellFootprint(nodes: readonly number[]): string {
  return [...nodes].sort((a, b) => a - b).join(',');
}

function placePlateEdits(e: PlateEntry, mesh: MeshOutput): MeshPlacement | undefined | null {
  const edits = editedPlateShells(e);
  if (!edits.length) return undefined;
  const placement = placeMesh(mesh);
  const owned = new Set(plateLoops(e.group).owned);
  const shifted = placement.nodeIds.some((id, i) => {
    if (!owned.has(id)) return false;
    const [x, y, z] = mesh.points[i]!;
    const node = modelStore.nodes.get(id)!;
    return node.x !== x || node.y !== y || (node.z ?? 0) !== z;
  });
  if (shifted) return null;

  const byFootprint = new Map<string, MeshPlacement['cells'][number] | null>();
  for (const cell of placement.cells) {
    const key = cellFootprint(cell.nodes);
    byFootprint.set(key, byFootprint.has(key) ? null : cell);
  }
  for (const edit of edits) {
    const key = cellFootprint(edit.nodes);
    const cell = byFootprint.get(key);
    if (!cell || cycleKey(cell.nodes) !== cycleKey(edit.nodes)) return null;
    byFootprint.delete(key);
    cell.nodes = [...edit.nodes];
    cell.offset = edit.offset;
    if (cell.nodes.length === 4) cell.curved = 'curved' in edit && !!edit.curved;
  }
  for (const cell of placement.cells) {
    if (!('offset' in cell)) cell.offset = e.surface.offset;
    if (!('curved' in cell) && cell.nodes.length === 4) cell.curved = e.surface.curved;
  }
  return placement;
}

export interface PlateMeshReport { plates: number; cells: number; refused: Array<{ id: number; reason: PlateMeshRefusalReason }>; droppedLocalLoads: number; keptNodes: number }

type ReadyPlateMesh = PlateMeshPlan & { mesh: MeshOutput; input: NonNullable<PlateMeshPlan['input']> };
const readyPlateMesh = (p: PlateMeshPlan): p is ReadyPlateMesh => !!p.mesh && !!p.input;

type IndexedShell = {
  id: number | undefined;
  cells: Vec3[][];
  stations: ReturnType<typeof stationIndex>;
};

function sharedStationsFor(drafts: readonly ReadyPlateMesh[], existing: readonly IndexedShell[], frame: ReturnType<typeof stationIndex>) {
  const planned = drafts.map(({ id, mesh }) => ({
    id, cells: mesh.cells.map(cell => cell.map(i => mesh.points[i]!)), stations: stationIndex(mesh.points),
  }));
  const shells = [...existing, ...planned];
  const frameStations = sharedFrameStations(frame, shells);
  return planned.map(({ id, stations }) => {
    const neighbours = shells.filter(other => other.id !== id && other.stations.overlaps(stations));
    return (a: Vec3, b: Vec3) => [
      ...neighbours.flatMap(other => other.stations.between(a, b)), ...frameStations(id, a, b),
    ];
  });
}

function withSharedMesh(p: ReadyPlateMesh, mesh: MeshOutput): ReadyPlateMesh {
  if (p.mesh === mesh) return p;
  return { ...p, mesh, cells: mesh.cells.length, quality: meshQuality(mesh), mixed: p.spec.element === 'quad' && !mesh.structured };
}

/** A slab panel's column-section grid again, with a line through each of `fixedPoints` (`footprintGrid`). */
function footprintRefined(p: ReadyPlateMesh, outer: readonly Vec3[], fixedPoints: readonly Vec3[]): MeshOutput | null {
  const grid = gridOfSpec(p.spec), alongX = (p.aDir?.[0] ?? 1) !== 0;
  const a = grid?.a ?? p.spec.size, b = grid?.b ?? p.spec.size, cells = { ax: alongX ? a : b, ay: alongX ? b : a }, lines = tartanXY(p.spec, cells);
  return footprintGrid(outer.map(([x, y, z]) => ({ x, y, z })), { ax: lines?.xs ? Infinity : cells.ax, ay: lines?.ys ? Infinity : cells.ay, element: p.spec.element }, p.footprints!.columns, {
    xs: [...fixedPoints.map((q) => q[0]), ...(lines?.xs ?? [])], ys: [...fixedPoints.map((q) => q[1]), ...(lines?.ys ?? [])],
  });
}

/**
 * A structured grid of quads met by its neighbours' nodes, meshed again with a line through each,
 * so it stays a grid of rectangles where splitting its edge cells would skew them.
 */
function refineGridToStations(p: ReadyPlateMesh, stationsOn: (a: Vec3, b: Vec3) => Vec3[], weld: number): ReadyPlateMesh {
  const { outer, holes } = p.input;
  if (!p.mesh.structured || p.spec.element !== 'quad' || outer.kind !== 'polygon') return p;
  const holePoints = holes.flatMap(hole => hole.kind === 'polygon' ? [hole.points] : []);
  if (holePoints.length !== holes.length) return p;
  const stations = addedMeshStations(p.mesh, stationsOn, weld);
  if (!stations.length) return p;
  const { plane } = p.mesh;
  const fixedPoints = [...p.mesh.points, ...stations];
  const lines = tartanLines(p.spec, plane, { a: p.grid?.cellA ?? p.spec.size, b: p.grid?.cellB ?? p.spec.size });
  const refined = p.footprints ? footprintRefined(p, outer.points, fixedPoints) : rectGrid({
    frame: { ...plane, n: cross(plane.u, plane.v) }, outer: outer.points, holes: holePoints,
    a: p.grid?.cellA ?? p.spec.size, b: p.grid?.cellB ?? p.spec.size, element: 'quad',
    fixedPoints, maxCells: MAX_MESH_CELLS, ...(lines ? { lines } : {}),
  });
  if (!refined || refined.points.length > MAX_MESH_POINTS) return p;
  const indexed = stationIndex(refined.points);
  if (!fixedPoints.every(point => indexed.has(point, weld))) return p;
  const at = (i: number) => {
    const [x, y, z] = refined.points[i]!;
    return { x, y, z };
  };
  if (refined.cells.some(cell => validCells(cell, at).length !== 1 || cell.some((a, i) =>
    sameMeshNode(refined.points[a]!, refined.points[cell[(i + 1) % cell.length]!]!, weld),
  ))) return p;
  return withSharedMesh(p, refined);
}

function planConformingMeshes(plans: readonly PlateMeshPlan[], report: PlateMeshReport, forAnalysis: boolean): ReadyPlateMesh[] {
  const outside = tartan;
  try { return conformingMeshes(plans, report, forAnalysis); } finally { tartan = outside; }
}

function conformingMeshes(plans: readonly PlateMeshPlan[], report: PlateMeshReport, forAnalysis: boolean): ReadyPlateMesh[] {
  const requested = new Map(plans.map(p => [p.id, p]));
  const specs = new Map(plans.map(p => [p.id, p.spec]));
  const entries = physicalPlates();
  const shellOwners = new Map(entries.flatMap(e => plateShellKeys(e.id).map(key => [key, e.id] as const)));
  const shells = [
    ...[...modelStore.quads.values()].map(shell => ({ key: `q${shell.id}`, nodes: shell.nodes })),
    ...[...modelStore.plates.values()].map(shell => ({ key: `p${shell.id}`, nodes: shell.nodes })),
  ];
  const weld = weldTolerance();
  while (specs.size) {
    const replaced = new Map<number, number>();
    const meshedAgain = new Set<string>();
    const untouched = new Map<number | undefined, Vec3[][]>();
    for (const { key, nodes } of shells) {
      const owner = shellOwners.get(key);
      if (owner !== undefined && specs.has(owner)) {
        meshedAgain.add(key);
        for (const id of nodes) replaced.set(id, (replaced.get(id) ?? 0) + 1);
      } else {
        const points = nodes.map(v3);
        if (points.every((p): p is Vec3 => p !== null)) {
          const cells = untouched.get(owner) ?? [];
          cells.push(points);
          untouched.set(owner, cells);
        }
      }
    }
    tartan = tartanOf(specs.keys(), specs, replaced);
    const drafts: ReadyPlateMesh[] = [];
    for (const [id, spec] of specs) {
      const p = planPlateMesh(id, spec, { meshedAgain, replaced });
      if (!p || !readyPlateMesh(p)) report.refused.push({ id, reason: p?.refused ?? 'cannotMesh' });
      else if (p.localLoads && (forAnalysis || !requested.has(id))) report.refused.push({ id, reason: 'localLoads' });
      else if (p.localLoads > (requested.get(id)?.localLoads ?? 0)) report.refused.push({ id, reason: 'interrupted' });
      else if (regionOccupied(p.input, p.mesh.plane, undefined, meshedAgain)) report.refused.push({ id, reason: 'occupied' });
      else drafts.push(p);
    }
    if (report.refused.length) return [];

    const owned = new Set(entries.filter(e => specs.has(e.id)).flatMap(e => plateLoops(e.group).owned));
    const frameNodes = memberChains(plateModel(), owned).flat();
    const frame = stationIndex([...new Set(frameNodes)].map(v3).filter((p): p is Vec3 => p !== null));
    const existing = [...untouched].map(([id, cells]) => ({ id, cells, stations: stationIndex(cells.flat()) }));
    // A grid met again passes the new stations on to its own neighbours, one plate further a pass
    // (down a stack of walls a storey at a time): refined until none changes.
    let grids: ReadyPlateMesh[] = drafts;
    let stationsFor = sharedStationsFor(grids, existing, frame);
    for (let pass = 0; pass <= drafts.length; pass++) {
      const next = grids.map((p, i) => refineGridToStations(p, stationsFor[i]!, weld));
      if (next.every((p, i) => p === grids[i])) break;
      grids = next;
      stationsFor = sharedStationsFor(grids, existing, frame);
    }
    const final: ReadyPlateMesh[] = [];
    for (const [i, p] of grids.entries()) {
      const mesh = meshStations(p.mesh, stationsFor[i]!, weld);
      if (!mesh) report.refused.push({ id: p.id, reason: 'cannotMesh' });
      else final.push(withSharedMesh(p, mesh));
    }
    if (report.refused.length) return [];

    const finalStations = final.map(p => ({ id: p.id, stations: stationIndex(p.mesh.points) }));
    let expanded = false;
    for (const { id, cells, stations } of existing) {
      for (const candidate of finalStations) {
        if (!stations.overlaps(candidate.stations) || !cells.some(cell => cell.some((a, i) => {
          const b = cell[(i + 1) % cell.length]!;
          return candidate.stations.between(a, b).some(p => !sameMeshNode(p, a, weld) && !sameMeshNode(p, b, weld));
        }))) continue;
        const e = id === undefined ? null : plateEntry(id);
        if (!e) report.refused.push({ id: candidate.id, reason: 'cannotMesh' });
        else if (localLoadsOn(e)) report.refused.push({ id: e.id, reason: 'localLoads' });
        else {
          specs.set(e.id, specOf(e));
          expanded = true;
        }
        break;
      }
    }
    if (report.refused.length) return [];
    if (!expanded) {
      for (const p of final) {
        const e = plateEntry(p.id);
        if (e && placePlateEdits(e, p.mesh) === null) report.refused.push({ id: p.id, reason: 'shellEdits' });
      }
      return report.refused.length ? [] : final;
    }
  }
  return [];
}

function meshingRun(plans: readonly PlateMeshPlan[], forAnalysis = false) {
  const report: PlateMeshReport = { plates: 0, cells: 0, refused: [], droppedLocalLoads: 0, keptNodes: 0 };
  const ok = planConformingMeshes(plans, report, forAnalysis);
  const current = ok.length ? physicalPlates().filter((e) => plateStatus(e.id) === 'current').map((e) => e.id) : [];
  const meshed: number[] = [];
  let loadDefsChanged = false;
  const clear = (e: PlateEntry, planned: PlateMeshPlan, byShell: ReturnType<typeof shellAreaLoads>, preserve?: ReadonlySet<number>) => {
    const lifted = liftableLoads(e, byShell);
    if (lifted?.gone.length) {
      modelStore.removeLoads(lifted.gone);
      for (const c of lifted.cases) modelStore.addGroup(`${e.name} · q`, 'floorLoad', {}, { data: plateLoadDef(e.id, c.caseId, c.q) as unknown as Record<string, unknown> });
    }
    loadDefsChanged ||= plateLoadDefs(e.id).length > 0;
    report.droppedLocalLoads += planned.localLoads;
    report.keptNodes += removePlateMesh(planned.id, false, preserve).keptNodes;
  };
  const cellsOf = new Map<number, number>();
  const meshOne = (p: ReadyPlateMesh, byShell: ReturnType<typeof shellAreaLoads>) => {
    const e = plateEntry(p.id);
    if (!e) return;
    const placement = placePlateEdits(e, p.mesh);
    if (placement === null) { report.refused.push({ id: p.id, reason: 'shellEdits' }); return; }
    if (regionOccupied(p.input, p.mesh.plane, undefined, new Set(plateShellKeys(p.id)))) {
      report.refused.push({ id: p.id, reason: 'occupied' });
      return;
    }
    const oldOwned = new Set(plateLoops(e.group).owned);
    const preserve = placement ? new Set(placement.nodeIds.filter(n => !placement.newNodes.has(n))) : undefined;
    clear(e, p, byShell, preserve);
    const before = new Set(modelStore.nodes.keys());
    const fp = p.footprints;
    const options = { materialId: e.surface.materialId, thickness: e.surface.thickness, splitBeams: p.spec.followMembers, ...(fp ? { splitAt: outsideFootprints(fp.columns, fp.z) } : {}) };
    const r = placement ? applyPlacedMesh(p.mesh, options, placement) : applyMesh(p.input, options, p.mesh);
    if (!r || r.occupied) { report.refused.push({ id: p.id, reason: 'occupied' }); return; }
    const created = [...new Set(r.nodeIds)].filter(n => !before.has(n) || (preserve?.has(n) && oldOwned.has(n)));
    if (fp) tieFootprints(new Set(r.nodeIds), fp.columns, e.id);
    const g = modelStore.model.groups.get(p.id)!;
    const loops = plateLoops(g);
    const edges = e.surface.edgeSupports ?? [];
    const supports = supportSides(edges, [...new Set(r.nodeIds)]);
    modelStore.setGroupMembers(p.id, { ...g.members, nodes: [...loops.outer, ...loops.holes.flat(), ...created], quads: r.quads, plates: r.plates });
    if (!placement && e.surface.curved) for (const q of r.quads) modelStore.setQuadCurved(q, true);
    if (!placement && e.surface.offset) {
      for (const q of r.quads) modelStore.setShellOffset('quad', q, e.surface.offset);
      for (const t of r.plates) modelStore.setShellOffset('plate', t, e.surface.offset);
    }
    writeSurface(p.id, (s) => ({ ...s, edgeSupports: edges, mesh: p.spec, meshed: { ...meshedKey(p.signature), cells: r.quads.length + r.plates.length, quality: p.quality!, ...(supports.length ? {
      supported: supports.map(support => support.nodeId),
      supportIds: supports.map(support => support.id),
    } : {}) } }));
    cellsOf.set(p.id, r.quads.length + r.plates.length);
    report.plates = cellsOf.size;
    report.cells = [...cellsOf.values()].reduce((a, b) => a + b, 0);
    if (!meshed.includes(p.id)) meshed.push(p.id);
  };
  let sprung = 0;
  const finish = (finished: boolean) => {
    if (finished) for (const id of new Set([...current, ...meshed])) {
      if (plateStatus(id) !== 'stale') continue;
      const e = plateEntry(id);
      if (e && !meshHangsNeighbours(e)) adoptCurrentMesh(id);
    }
    if (loadDefsChanged) syncDefinedLoads();
    loadDefsChanged = false;
    const springy = meshed.slice(sprung).filter((id) => plateEntry(id)?.surface.springs);
    sprung = meshed.length;
    if (springy.length) respring(springy);
  };
  const applySlice = (from: number, sliceMs: number) => {
    const end = performance.now() + sliceMs;
    const byShell = shellAreaLoads();
    let done = from;
    do {
      const p = ok[done++]!;
      meshOne(p, byShell);
    } while (done < ok.length && performance.now() < end);
    finish(done === ok.length);
    return done;
  };
  const asPlanned = () => ok.every((p) => { const e = plateEntry(p.id); return !e || localLoadsOn(e) <= p.localLoads; });
  const refuseAll = () => { for (const p of ok) report.refused.push({ id: p.id, reason: 'interrupted' }); return report; };
  return { report, ok, applySlice, asPlanned, refuseAll };
}

/** Put the planned meshes in, replacing each plate's old one, as one undo step. */
export function applyPlateMeshes(plans: readonly PlateMeshPlan[]): PlateMeshReport {
  return applyMeshingRun(meshingRun(plans));
}

function applyMeshingRun(run: ReturnType<typeof meshingRun>): PlateMeshReport {
  if (!run.ok.length) return run.report;
  if (!run.asPlanned()) return run.refuseAll();
  modelStore.batch(() => run.applySlice(0, Infinity));
  return run.report;
}

/**
 * The same as one undo step, in slices of about `sliceMs`, with a frame between them for the page
 * to draw `onProgress` (plates done of the total).
 */
export async function applyPlateMeshesAsync(plans: readonly PlateMeshPlan[], onProgress?: (done: number, total: number) => void, sliceMs = 120): Promise<PlateMeshReport> {
  return applyMeshingRunAsync(meshingRun(plans), onProgress, sliceMs);
}

async function applyMeshingRunAsync(run: ReturnType<typeof meshingRun>, onProgress?: (done: number, total: number) => void, sliceMs = 120): Promise<PlateMeshReport> {
  if (!run.ok.length) return run.report;
  let done = 0;
  const revision = () => [
    historyStore.lastStep, modelStore.modelVersion, modelStore.model.groups, modelStore.nodes,
    modelStore.elements, modelStore.quads, modelStore.plates, modelStore.loads, modelStore.supports,
    modelStore.model.constraints,
  ];
  let before = revision();
  onProgress?.(0, run.ok.length);
  while (done < run.ok.length) {
    await nextFrame();
    if (revision().some((value, index) => value !== before[index])) {
      for (const p of run.ok.slice(done)) run.report.refused.push({ id: p.id, reason: 'interrupted' });
      return run.report;
    }
    if (done === 0 && !run.asPlanned()) return run.refuseAll();
    const apply = () => { done = run.applySlice(done, sliceMs); };
    if (done === 0) modelStore.batch(apply);
    else modelStore.amendLastStep(apply);
    before = revision();
    onProgress?.(done, run.ok.length);
  }
  return run.report;
}
/** The plates every shell of which is among `keys`. */
export function platesWholeIn(keys: ReadonlySet<string>): number[] {
  return physicalPlates().filter((p) => { const k = plateShellKeys(p.id); return k.length > 0 && k.every((x) => keys.has(x)); }).map((p) => p.id);
}

/**
 * What the plates' meshes are given beyond material and thickness, kept on the plates so every mesh
 * gets it; `null` takes it away. Springs changed or taken away on a plate that had them are put right
 * on its mesh as it is too, a node shared with another spring plate keeping that plate's share.
 */
export function setPlateShellSpec(ids: readonly number[], patch: { curved?: boolean | null; offset?: PlateSurface['offset'] | null; springs?: PlateSurface['springs'] | null }): void {
  const springNodes = 'springs' in patch ? ids.flatMap(id => plateShellKeys(id).flatMap(shellNodes)) : [];
  modelStore.batch(() => {
    for (const id of ids) writeSurface(id, (s) => {
      const next = { ...s };
      for (const k of ['curved', 'offset', 'springs'] as const) {
        if (!(k in patch)) continue;
        const v = patch[k];
        if (v === null || v === undefined || v === false) delete next[k]; else (next as Record<string, unknown>)[k] = v;
      }
      return next;
    });
    respringAt(springNodes);
  });
}

/** The foundation springs of the plates given, from their meshes as they are now: one per node, k summed over every spring plate that node belongs to. */
function respring(ids: readonly number[]): void {
  respringAt(ids.flatMap((id) => plateShellKeys(id).flatMap(shellNodes)));
}

/** The foundation springs at the nodes given, from every spring plate's mesh that holds them. */
function respringAt(nodes: readonly number[]): void {
  const springy = physicalPlates().filter((p) => p.surface.springs);
  const affected = new Set(nodes);
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
  const supports = new Map([...modelStore.supports.values()].map(support => [support.nodeId, support]));
  for (const n of affected) {
    const old = supports.get(n);
    if (old && !old.plateSpring) continue;
    const k = kz.get(n);
    const sp = spec.get(n);
    if (k === undefined || !sp) {
      if (old) modelStore.removeSupport(old.id);
      continue;
    }
    if (old && old.kz === k && !!old.uplift === sp.uplift && old.dofRestraints?.tx === sp.holdHorizontal) continue;
    modelStore.addSupportEntry({
      nodeId: n, type: 'custom3d', plateSpring: true,
      dofRestraints: { tx: sp.holdHorizontal, ty: sp.holdHorizontal, tz: false, rx: false, ry: false, rz: false },
      dofFrame: 'global', kz: k, ...(sp.uplift ? { uplift: true } : {}),
    });
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
    const h = retainedPlateNodes();
    for (const n of corner) if (modelStore.nodes.has(n) && !h.has(n)) modelStore.removeNode(n);
  });
}

// ─── Before an analysis ──────────────────────────────────────────

export type PlatePreparation =
  | { ok: true; meshed: number; cells: number; stale?: string[] }
  | { ok: false; reason: 'needsMesh' | 'invalid'; plates: string[] }
  | { ok: false; reason: 'wallSlab' | 'remeshBlocked'; error: string }
  | { ok: false; reason: 'refused'; plates: string[] }
  | { ok: false; reason: 'localLoads'; plates: string[] };

function invalidPreparation(): PlatePreparation | null {
  const { invalid, ambiguousSweep } = physicalPlateProblems(modelStore.model);
  if (ambiguousSweep.length) {
    return { ok: false, reason: 'remeshBlocked', error: ambiguousSweep.map(name => plateRemeshMessage(name, 'ambiguousSweep')).join(' ') };
  }
  return invalid.length ? { ok: false, reason: 'invalid', plates: invalid } : null;
}

function prepared(meshed: number, cells: number, stale?: string[]): PlatePreparation {
  const error = wallSlabRefusal(modelStore.model);
  if (error) return { ok: false, reason: 'wallSlab', error };
  return stale ? { ok: true, meshed, cells, stale } : { ok: true, meshed, cells };
}

/** Without meshing: a plate with no mesh, or whose mesh leaves nodes hanging on a neighbour, stops the solve; one whose mesh is only out of date solves on it and is named. */
function unmeshedOrStale(need: number[], names: (ids: number[]) => string[]): PlatePreparation {
  if (!unifiedPlates()) return { ok: false, reason: 'needsMesh', plates: names(need) };
  const missing = need.filter((id) => { const e = plateStatus(id) === 'stale' ? plateEntry(id) : undefined; return !e || meshHangsNeighbours(e); });
  if (missing.length) return { ok: false, reason: 'needsMesh', plates: names(missing) };
  return prepared(0, 0, names(need));
}

function checkPreparedPlates(report: PlateMeshReport): PlatePreparation {
  const invalid = invalidPreparation();
  if (invalid) return invalid;
  const messages = report.refused.map(({ id, reason }) => plateRemeshMessage(plateEntry(id)?.name ?? `#${id}`, reason)).filter(Boolean);
  if (messages.length) return { ok: false, reason: 'remeshBlocked', error: messages.join(' ') };
  const loaded = report.refused.filter(({ reason }) => reason === 'localLoads');
  if (loaded.length) return { ok: false, reason: 'localLoads', plates: loaded.map(({ id }) => plateEntry(id)?.name ?? `#${id}`) };
  const incomplete = new Set([...report.refused.map(({ id }) => id), ...platesNeedingMesh({ coarse: false })]);
  if (incomplete.size) return { ok: false, reason: 'refused', plates: [...incomplete].map(id => plateEntry(id)?.name ?? `#${id}`) };
  return prepared(report.plates, report.cells);
}

/**
 * Mesh what an analysis needs and nothing else: the plates with no mesh or an out-of-date one,
 * each at its own settings, as one undo step. With meshing before the analysis turned off, says
 * which plates stop it instead. Runs once per solve, before its inputs are taken.
 */
export function preparePlatesForAnalysis(): PlatePreparation {
  applyPlacement();
  // Plates still on the coarse shells they came with are meshed when asked to; otherwise they solve as they came.
  const invalid = invalidPreparation();
  if (invalid) return invalid;
  const need = platesNeedingMesh({ coarse: meshBeforeAnalysis.value });
  if (!need.length) return prepared(0, 0);
  const names = (ids: number[]) => ids.map((id) => plateEntry(id)?.name ?? `#${id}`);
  if (!meshBeforeAnalysis.value) return unmeshedOrStale(need, names);
  const r = applyMeshingRun(meshingRun(planPlateMeshesNow(need), true));
  return checkPreparedPlates(r);
}

/** The same, with a frame between plates so the page can show `meshProgress`: what an analysis the user asked for runs. */
export async function preparePlatesForAnalysisAsync(recognizePhysicalModel?: () => number): Promise<PlatePreparation> {
  // A mesh the plates' dialog started is let finish: two runs would write the model at once.
  while (meshProgress.now) await nextFrame();
  applyPlacement();
  // Plates still on the coarse shells they came with are meshed when asked to; otherwise they solve as they came.
  const invalid = invalidPreparation();
  if (invalid) return invalid;
  if (recognizePhysicalModel?.()) {
    const invalidRecognized = invalidPreparation();
    if (invalidRecognized) return invalidRecognized;
  }
  const need = platesNeedingMesh({ coarse: meshBeforeAnalysis.value });
  if (!need.length) return prepared(0, 0);
  const names = (ids: number[]) => ids.map((id) => plateEntry(id)?.name ?? `#${id}`);
  if (!meshBeforeAnalysis.value) return unmeshedOrStale(need, names);
  try {
    const plans = await planPlateMeshes(need, undefined, { onProgress: (done, total) => setMeshProgress('planning', done, total) });
    if (!plans) return { ok: false, reason: 'refused', plates: names(need) };
    const r = await applyMeshingRunAsync(meshingRun(plans, true), (done, total) => setMeshProgress('meshing', done, total));
    return checkPreparedPlates(r);
  } finally {
    endMeshProgress();
  }
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
