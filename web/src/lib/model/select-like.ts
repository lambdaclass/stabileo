/**
 * "Like what is selected", for every kind the selection panel arms.
 *
 * The panel's buttons (parallel, connected, same section, same level…) used to read the selected
 * members and answer with members whatever kind was armed above them: with plates armed, "same
 * material" handed back beams. Each kind now has the operations that mean something for it, seeded
 * by its own selection and answering in its own kind:
 *
 * - members: the groupings design already has (`member-grouping.ts`);
 * - nodes: those at the same level, and those joined to the selected ones by a member or a plate;
 * - plates: parallel, coplanar, touching, same thickness, same material, same level;
 * - supports: same type, same level;
 * - loads: same type, same case.
 *
 * Pure over the model, so it is tested without the panel.
 */
import {
  groupByParallel, groupByConnectivity, groupBySection, groupByMaterial, groupByElevation, groupByPlane,
  groupByFrameLine, groupByKind, memberKindOf,
} from '../engine/design/member-grouping';

export type SelKind = 'nodes' | 'elements' | 'shells' | 'supports' | 'loads';
export type LikeOp = 'parallel' | 'connected' | 'section' | 'material' | 'kind' | 'level' | 'plane' | 'frame' | 'case';

/** The operations each kind answers, in the order the panel shows them. */
export const LIKE_OPS: Record<SelKind, readonly LikeOp[]> = {
  elements: ['parallel', 'connected', 'section', 'material', 'kind', 'level', 'plane', 'frame'],
  nodes: ['connected', 'level'],
  shells: ['parallel', 'plane', 'connected', 'section', 'material', 'level'],
  supports: ['kind', 'level'],
  loads: ['kind', 'case'],
};
export const ALL_LIKE_OPS: readonly LikeOp[] = ['parallel', 'connected', 'section', 'material', 'kind', 'level', 'plane', 'frame', 'case'];

type P3 = { x: number; y: number; z?: number };
export interface LikeModel {
  nodes: ReadonlyMap<number, P3>;
  elements: ReadonlyMap<number, { nodeI: number; nodeJ: number; sectionId: number; materialId: number }>;
  plates?: ReadonlyMap<number, { nodes: readonly number[]; materialId: number; thickness: number }>;
  quads?: ReadonlyMap<number, { nodes: readonly number[]; materialId: number; thickness: number }>;
  supports?: ReadonlyMap<number, { nodeId: number; type: string }>;
  loads?: ReadonlyArray<{ type: string; data: { id: number; caseId?: number } }>;
}

export interface LikeSeeds {
  nodes: Iterable<number>;
  elements: Iterable<number>;
  shells: Iterable<string>;
  supports: Iterable<number>;
  loads: Iterable<number>;
}

/** What one kind answered: the ids, or the reason the model cannot answer it. */
export type LikeAnswer =
  | { kind: 'nodes' | 'elements' | 'supports' | 'loads'; ids: Set<number>; refusedKey?: string }
  | { kind: 'shells'; ids: Set<string>; refusedKey?: string };

const COS_TOL = Math.cos((5 * Math.PI) / 180);
const LEN_TOL = 1e-3;

/** The vertical coordinate: z in space, y in the plane. */
export function verticalOf(spatial: boolean): (p: P3) => number {
  return spatial ? (p) => p.z ?? 0 : (p) => p.y;
}

// ── Plates: their corners, their plane ────────────────────────────────

export function shellNodes(model: LikeModel, key: string): readonly number[] | null {
  const id = Number(key.slice(1));
  const s = key[0] === 'p' ? model.plates?.get(id) : model.quads?.get(id);
  return s ? s.nodes : null;
}
function shellOf(model: LikeModel, key: string) {
  const id = Number(key.slice(1));
  return key[0] === 'p' ? model.plates?.get(id) : model.quads?.get(id);
}

/** The unit normal of a plate and its offset along it, from its first three corners (Newell for four). */
export function shellPlane(model: LikeModel, key: string): { n: [number, number, number]; d: number } | null {
  const ids = shellNodes(model, key);
  if (!ids) return null;
  const ps = ids.map((id) => model.nodes.get(id)).filter((p): p is P3 => !!p);
  if (ps.length < 3) return null;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i]!, b = ps[(i + 1) % ps.length]!;
    const az = a.z ?? 0, bz = b.z ?? 0;
    nx += (a.y - b.y) * (az + bz);
    ny += (az - bz) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const L = Math.hypot(nx, ny, nz);
  if (L < 1e-12) return null;
  const n: [number, number, number] = [nx / L, ny / L, nz / L];
  // One orientation for every plane, so two coplanar plates drawn in opposite senses agree.
  const flip = n[2] < -1e-9 || (Math.abs(n[2]) <= 1e-9 && (n[1] < -1e-9 || (Math.abs(n[1]) <= 1e-9 && n[0] < 0)));
  if (flip) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
  const p = ps[0]!;
  return { n, d: n[0] * p.x + n[1] * p.y + n[2] * (p.z ?? 0) };
}

function allShellKeys(model: LikeModel): string[] {
  return [...[...(model.plates?.keys() ?? [])].map((id) => `p${id}`), ...[...(model.quads?.keys() ?? [])].map((id) => `q${id}`)];
}

// ── Per kind ──────────────────────────────────────────────────────────

/** Members like `seeds` by one of the members' operations (`member-grouping.ts`), or why the model cannot say. */
export function likeMembers(model: LikeModel, seeds: number[], op: LikeOp): { ids: number[]; refusedKey?: string } {
  const m = model as never;
  const seedSet = new Set(seeds);
  if (op === 'parallel') return { ids: groupByParallel(m, seeds) };
  if (op === 'connected') return { ids: groupByConnectivity(m, seeds, 1, false) };
  if (op === 'level') {
    // The storey the selected members sit on: its beams, and the columns rising from it.
    const g = groupByElevation(m);
    if (!g.available) return { ids: [], refusedKey: g.refusedKey };
    const bands = g.bands.filter((b) => [...b.beamIds, ...b.columnsRisingIds].some((id) => seedSet.has(id)));
    return { ids: [...new Set(bands.flatMap((b) => [...b.beamIds, ...b.columnsRisingIds, ...b.slopedBeamIds]))] };
  }
  if (op === 'plane') {
    const g = groupByPlane(m);
    if (!g.available) return { ids: [], refusedKey: g.refusedKey };
    return { ids: [...new Set(g.planes.filter((p) => p.elementIds.some((id) => seedSet.has(id))).flatMap((p) => p.elementIds))] };
  }
  if (op === 'frame') {
    const g = groupByFrameLine(m);
    if (!g.available) return { ids: [], refusedKey: g.refusedKey };
    return { ids: [...new Set(g.lines.filter((l) => l.elementIds.some((id) => seedSet.has(id))).flatMap((l) => l.elementIds))] };
  }
  if (op === 'kind') {
    const kinds = new Set(seeds.map((id) => memberKindOf(m, id)).filter((k) => k !== null));
    return { ids: [...new Set([...kinds].flatMap((k) => groupByKind(m, k!)))] };
  }
  const set = new Set<number>();
  for (const id of seeds) {
    const e = model.elements.get(id);
    if (!e) continue;
    for (const x of op === 'section' ? groupBySection(m, e.sectionId) : groupByMaterial(m, e.materialId)) set.add(x);
  }
  return { ids: [...set] };
}

/** Nodes joined to a node by a member or by a plate edge. */
function neighbours(model: LikeModel): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (a === b) return;
    (out.get(a) ?? out.set(a, new Set()).get(a)!).add(b);
    (out.get(b) ?? out.set(b, new Set()).get(b)!).add(a);
  };
  for (const e of model.elements.values()) link(e.nodeI, e.nodeJ);
  for (const key of allShellKeys(model)) {
    const ns = shellNodes(model, key)!;
    for (let i = 0; i < ns.length; i++) link(ns[i]!, ns[(i + 1) % ns.length]!);
  }
  return out;
}

function sameLevel(zs: number[], z: number): boolean {
  return zs.some((s) => Math.abs(s - z) < LEN_TOL);
}

function likeNodes(model: LikeModel, seeds: number[], op: LikeOp, vertical: (p: P3) => number): Set<number> {
  const out = new Set<number>();
  if (op === 'connected') {
    const nb = neighbours(model);
    for (const id of seeds) { out.add(id); for (const n of nb.get(id) ?? []) out.add(n); }
    return out;
  }
  const zs = seeds.map((id) => model.nodes.get(id)).filter((p): p is P3 => !!p).map(vertical);
  for (const [id, p] of model.nodes) if (sameLevel(zs, vertical(p))) out.add(id);
  return out;
}

function likeShells(model: LikeModel, seeds: string[], op: LikeOp, vertical: (p: P3) => number): Set<string> {
  const out = new Set<string>();
  const keys = allShellKeys(model);
  if (op === 'connected') {
    const touched = new Set(seeds.flatMap((k) => [...(shellNodes(model, k) ?? [])]));
    for (const k of keys) if ((shellNodes(model, k) ?? []).some((n) => touched.has(n))) out.add(k);
    return out;
  }
  if (op === 'section' || op === 'material') {
    const want = new Set(seeds.map((k) => shellOf(model, k)).filter((s) => !!s).map((s) => (op === 'section' ? s!.thickness.toPrecision(9) : String(s!.materialId))));
    for (const k of keys) {
      const s = shellOf(model, k)!;
      if (want.has(op === 'section' ? s.thickness.toPrecision(9) : String(s.materialId))) out.add(k);
    }
    return out;
  }
  if (op === 'level') {
    // Level plates: those lying flat at the height of a selected flat one.
    const flatAt = (k: string): number | null => {
      const ns = (shellNodes(model, k) ?? []).map((id) => model.nodes.get(id)).filter((p): p is P3 => !!p);
      if (ns.length < 3) return null;
      const zs = ns.map(vertical);
      return Math.max(...zs) - Math.min(...zs) < LEN_TOL ? zs[0]! : null;
    };
    const levels = seeds.map(flatAt).filter((z): z is number => z !== null);
    for (const k of keys) { const z = flatAt(k); if (z !== null && sameLevel(levels, z)) out.add(k); }
    return out;
  }
  // parallel / plane
  const planes = seeds.map((k) => shellPlane(model, k)).filter((p) => !!p);
  for (const k of keys) {
    const p = shellPlane(model, k);
    if (!p) continue;
    const hit = planes.some((s) => {
      const dot = Math.abs(s!.n[0] * p.n[0] + s!.n[1] * p.n[1] + s!.n[2] * p.n[2]);
      if (dot < COS_TOL) return false;
      return op === 'parallel' || Math.abs(Math.abs(s!.d) - Math.abs(p.d)) < LEN_TOL * 10;
    });
    if (hit) out.add(k);
  }
  return out;
}

function likeSupports(model: LikeModel, seeds: number[], op: LikeOp, vertical: (p: P3) => number): Set<number> {
  const out = new Set<number>();
  const sup = model.supports ?? new Map();
  if (op === 'kind') {
    const types = new Set(seeds.map((id) => sup.get(id)?.type).filter((x) => x !== undefined));
    for (const [id, s] of sup) if (types.has(s.type)) out.add(id);
    return out;
  }
  const zOf = (id: number) => { const n = model.nodes.get(sup.get(id)?.nodeId ?? -1); return n ? vertical(n) : null; };
  const zs = seeds.map(zOf).filter((z): z is number => z !== null);
  for (const id of sup.keys()) { const z = zOf(id); if (z !== null && sameLevel(zs, z)) out.add(id); }
  return out;
}

function likeLoads(model: LikeModel, seeds: number[], op: LikeOp): Set<number> {
  const out = new Set<number>();
  const loads = model.loads ?? [];
  const byId = new Map(loads.map((l) => [l.data.id, l]));
  const keyOf = (l: { type: string; data: { caseId?: number } }) => (op === 'kind' ? l.type : String(l.data.caseId ?? 1));
  const want = new Set(seeds.map((id) => byId.get(id)).filter((l) => !!l).map((l) => keyOf(l!)));
  for (const l of loads) if (want.has(keyOf(l))) out.add(l.data.id);
  return out;
}

/** How many of the selected things can seed this operation, over the armed kinds. */
export function likeSeedCount(kinds: ReadonlySet<SelKind>, seeds: LikeSeeds, op?: LikeOp): number {
  let n = 0;
  for (const k of kinds) {
    if (op && !LIKE_OPS[k].includes(op)) continue;
    n += [...seeds[k]].length;
  }
  return n;
}

/**
 * The operation, answered by each armed kind that has it and has something selected. A kind
 * without the operation, or with nothing selected, gives no answer and keeps its selection.
 */
export function likeSelection(
  model: LikeModel, kinds: ReadonlySet<SelKind>, seeds: LikeSeeds, op: LikeOp, spatial = true,
): LikeAnswer[] {
  const vertical = verticalOf(spatial);
  const out: LikeAnswer[] = [];
  for (const k of kinds) {
    if (!LIKE_OPS[k].includes(op)) continue;
    if (k === 'shells') {
      const s = [...seeds.shells].filter((key) => !!shellOf(model, key));
      if (s.length) out.push({ kind: 'shells', ids: likeShells(model, s, op, vertical) });
      continue;
    }
    const s = [...seeds[k]];
    if (!s.length) continue;
    if (k === 'elements') {
      const r = likeMembers(model, s.filter((id) => model.elements.has(id)), op);
      out.push({ kind: 'elements', ids: new Set(r.ids), ...(r.refusedKey ? { refusedKey: r.refusedKey } : {}) });
    } else if (k === 'nodes') out.push({ kind: 'nodes', ids: likeNodes(model, s, op, vertical) });
    else if (k === 'supports') out.push({ kind: 'supports', ids: likeSupports(model, s, op, vertical) });
    else out.push({ kind: 'loads', ids: likeLoads(model, s, op) });
  }
  return out;
}

/**
 * Plates parallel to a global axis (their plane contains it: walls for Z) or to a global plane
 * (slabs for XY), within 5°.
 */
export function shellsParallelToGlobal(model: LikeModel, dir: 'X' | 'Y' | 'Z' | 'XY' | 'XZ' | 'YZ'): Set<string> {
  const axis = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] } as const;
  const normal = { XY: [0, 0, 1], XZ: [0, 1, 0], YZ: [1, 0, 0] } as const;
  const sin = Math.sin((5 * Math.PI) / 180);
  const out = new Set<string>();
  for (const k of allShellKeys(model)) {
    const p = shellPlane(model, k);
    if (!p) continue;
    const v = dir.length === 1 ? axis[dir as 'X'] : normal[dir as 'XY'];
    const dot = Math.abs(p.n[0] * v[0] + p.n[1] * v[1] + p.n[2] * v[2]);
    if (dir.length === 1 ? dot <= sin : dot >= COS_TOL) out.add(k);
  }
  return out;
}

/**
 * The nodes that frame a selection of any kind: the nodes, the members' ends, the plates'
 * corners, the supported nodes and the nodes, members and plates the loads sit on. What "zoom to
 * the selection" fits the view to.
 */
export function focusNodeIds(
  model: LikeModel & { loads?: ReadonlyArray<{ type: string; data: Record<string, unknown> & { id: number } }> },
  sel: Partial<LikeSeeds>,
): Set<number> {
  const out = new Set<number>(sel.nodes ?? []);
  const addMember = (id: number) => { const e = model.elements.get(id); if (e) { out.add(e.nodeI); out.add(e.nodeJ); } };
  const addShell = (key: string) => { for (const n of shellNodes(model, key) ?? []) out.add(n); };
  for (const id of sel.elements ?? []) addMember(id);
  for (const key of sel.shells ?? []) addShell(key);
  for (const id of sel.supports ?? []) { const s = model.supports?.get(id); if (s) out.add(s.nodeId); }
  const loadIds = new Set(sel.loads ?? []);
  if (loadIds.size) {
    for (const l of model.loads ?? []) {
      if (!loadIds.has(l.data.id)) continue;
      const d = l.data;
      if (typeof d.nodeId === 'number') out.add(d.nodeId);
      if (typeof d.elementId === 'number') addMember(d.elementId);
      if (typeof d.quadId === 'number') addShell(`q${d.quadId}`);
      if (typeof d.plateId === 'number') addShell(`p${d.plateId}`);
    }
  }
  return out;
}
