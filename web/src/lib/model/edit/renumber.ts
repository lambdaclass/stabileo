/**
 * Renumber nodes and members by position.
 *
 * A model built by repeating and mirroring numbers its entities in the order they were made,
 * which is no order a reader can use: node 212 sits next to node 7. Renumbering sorts them by
 * position — by default storey by storey, then along Y, then along X — so a table, a report and a
 * drawing read in the order of the building.
 *
 * ── Every reference is rewritten ──────────────────────────────────
 *
 * The model is renumbered as one snapshot: member ends, shell corners, supports and the member a
 * support is framed by, loads, constraints, connectors, footings and groups. It is restored in one
 * undo step.
 *
 * ── Part of the model, from a number ──────────────────────────────
 *
 * With `only`, just the given nodes and members (and, with `shells`, plates and quads) are
 * renumbered; the rest keep their numbers. Without `start` the chosen ones swap their own numbers
 * into positional order, so nothing else can be hit. With `start` they take start, start + 1…,
 * and when one of those numbers belongs to something outside the choice the renumbering is
 * refused, naming the numbers, rather than moving what was not chosen.
 *
 * ── When it is refused ────────────────────────────────────────────
 *
 * Design documents — detailing, exports, manual edits, joint designs, revisions — are keyed by
 * the numbers they were produced against. Renumbering under them would silently attach every one
 * to a different member. A model that carries any is not renumbered; the answer is to renumber
 * before designing.
 */

import { modelStore } from '../../store/model.svelte';

export type AxisOrder = 'zyx' | 'zxy' | 'xyz' | 'yxz';
export interface RenumberOptions {
  nodes: boolean; members: boolean; order: AxisOrder; tol?: number;
  /** Plates and quads too, by their centroids. */
  shells?: boolean;
  /** Only these; absent, everything of each kind asked for. Shells keyed `p3` / `q7`. */
  only?: { nodes?: ReadonlySet<number>; elements?: ReadonlySet<number>; shells?: ReadonlySet<string> };
  /** The first number to give. Absent: 1 for all, or the chosen ones' own numbers. */
  start?: number;
}
export type RenumberResult =
  | { nodes: number; members: number; shells: number; changedNodes: number; changedMembers: number; changedShells: number }
  | { refused: 'hasDesignDocuments'; fields: string[] }
  | { refused: 'collision'; kind: 'nodes' | 'members' | 'plates' | 'quads'; ids: number[] };

const DERIVED = ['detailing', 'exports', 'manualEdits', 'jointDesigns', 'revisions'] as const;

/**
 * Whether a derived field carries any document. Scalars are metadata — a fresh project's
 * detailing is `{ version: 2, assemblies: [] }` — so only a non-empty list, at any depth, counts.
 */
function nonEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v as object).some(nonEmpty);
  return false;
}

export function designDocumentFields(): string[] {
  const snap = modelStore.snapshot() as unknown as Record<string, unknown>;
  return DERIVED.filter((k) => nonEmpty(snap[k]));
}

type P = { x: number; y: number; z?: number };
function keyOf(p: P, order: AxisOrder, tol: number): number[] {
  const c = { x: Math.round(p.x / tol), y: Math.round(p.y / tol), z: Math.round((p.z ?? 0) / tol) };
  return order.split('').map((a) => c[a as 'x' | 'y' | 'z']);
}
const cmp = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!; return 0; };

/**
 * The new number of each id: the chosen ones (all, or `only`) sorted by position and numbered from
 * `start`, or into their own numbers; the rest unchanged. A collision with an unchosen id is
 * returned as the ids that would collide.
 */
function positionalMap(
  ids: readonly number[], pos: (id: number) => P, order: AxisOrder, tol: number,
  only: ReadonlySet<number> | undefined, start: number | undefined,
): Map<number, number> | number[] {
  const chosen = only ? ids.filter((id) => only.has(id)) : [...ids];
  const sorted = [...chosen].sort((a, b) => cmp(keyOf(pos(a), order, tol), keyOf(pos(b), order, tol)) || a - b);
  const targets = start !== undefined ? sorted.map((_, k) => start + k) : only ? [...chosen].sort((a, b) => a - b) : sorted.map((_, k) => k + 1);
  if (only && start !== undefined) {
    const rest = new Set(ids.filter((id) => !only.has(id)));
    const hit = targets.filter((t) => rest.has(t));
    if (hit.length > 0) return hit;
  }
  const map = new Map<number, number>(ids.map((id) => [id, id]));
  sorted.forEach((id, k) => map.set(id, targets[k]!));
  return map;
}

export function renumber(opts: RenumberOptions): RenumberResult {
  const fields = designDocumentFields();
  if (fields.length > 0) return { refused: 'hasDesignDocuments', fields };
  const tol = opts.tol ?? 1e-3;
  const snap = JSON.parse(JSON.stringify(modelStore.snapshot())) as Record<string, any>;

  const nodes = new Map<number, P>(snap.nodes);
  let nodeMap = new Map<number, number>([...nodes.keys()].map((id) => [id, id]));
  if (opts.nodes) {
    const m = positionalMap([...nodes.keys()], (id) => nodes.get(id)!, opts.order, tol, opts.only?.nodes, opts.start);
    if (Array.isArray(m)) return { refused: 'collision', kind: 'nodes', ids: m };
    nodeMap = m;
  }
  const rn = (id: number) => nodeMap.get(id) ?? id;

  const elements = new Map<number, any>(snap.elements);
  let elemMap = new Map<number, number>([...elements.keys()].map((id) => [id, id]));
  if (opts.members) {
    const mid = (e: any): P => {
      const a = nodes.get(e.nodeI)!, b = nodes.get(e.nodeJ)!;
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
    };
    const m = positionalMap([...elements.keys()], (id) => mid(elements.get(id)), opts.order, tol, opts.only?.elements, opts.start);
    if (Array.isArray(m)) return { refused: 'collision', kind: 'members', ids: m };
    elemMap = m;
  }
  const re = (id: number) => elemMap.get(id) ?? id;

  // Shells by centroid, plates and quads each in their own id space.
  const centroid = (ns: number[]): P => {
    const ps = ns.map((n) => nodes.get(n)!).filter(Boolean);
    return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length, z: ps.reduce((a, p) => a + (p.z ?? 0), 0) / ps.length };
  };
  const shellMap = (list: Array<[number, any]>, prefix: 'p' | 'q', kind: 'plates' | 'quads'): Map<number, number> | RenumberResult => {
    const by = new Map(list);
    if (!opts.shells) return new Map(list.map(([id]) => [id, id]));
    const only = opts.only?.shells ? new Set([...opts.only.shells].filter((k) => k[0] === prefix).map((k) => Number(k.slice(1)))) : undefined;
    const m = positionalMap(list.map(([id]) => id), (id) => centroid(by.get(id).nodes), opts.order, tol, only, opts.start);
    return Array.isArray(m) ? { refused: 'collision', kind, ids: m } : m;
  };
  const plateMapR = shellMap(snap.plates ?? [], 'p', 'plates');
  if (!(plateMapR instanceof Map)) return plateMapR;
  const quadMapR = shellMap(snap.quads ?? [], 'q', 'quads');
  if (!(quadMapR instanceof Map)) return quadMapR;
  const rp = (id: number) => plateMapR.get(id) ?? id, rq = (id: number) => quadMapR.get(id) ?? id;

  snap.nodes = [...nodes.entries()].map(([id, n]) => [rn(id), { ...n, id: rn(id) }]);
  snap.elements = [...elements.entries()].map(([id, e]) => [re(id), { ...e, id: re(id), nodeI: rn(e.nodeI), nodeJ: rn(e.nodeJ) }]);
  snap.supports = (snap.supports ?? []).map(([id, s]: [number, any]) => [id, {
    ...s, nodeId: rn(s.nodeId), ...(s.dofLocalElementId !== undefined ? { dofLocalElementId: re(s.dofLocalElementId) } : {}),
  }]);
  snap.loads = (snap.loads ?? []).map((l: any) => ({
    ...l, data: {
      ...l.data,
      ...(l.data.nodeId !== undefined ? { nodeId: rn(l.data.nodeId) } : {}),
      ...(l.data.elementId !== undefined ? { elementId: re(l.data.elementId) } : {}),
      ...(l.data.quadId !== undefined ? { quadId: rq(l.data.quadId) } : {}),
      ...(l.data.plateId !== undefined ? { plateId: rp(l.data.plateId) } : {}),
    },
  }));
  snap.plates = (snap.plates ?? []).map(([id, p]: [number, any]) => [rp(id), { ...p, id: rp(id), nodes: p.nodes.map(rn) }]);
  snap.quads = (snap.quads ?? []).map(([id, q]: [number, any]) => [rq(id), { ...q, id: rq(id), nodes: q.nodes.map(rn) }]);
  snap.constraints = (snap.constraints ?? []).map((c: any) => ({
    ...c,
    ...(typeof c.masterNode === 'number' ? { masterNode: rn(c.masterNode) } : {}),
    ...(typeof c.slaveNode === 'number' ? { slaveNode: rn(c.slaveNode) } : {}),
    ...(Array.isArray(c.slaveNodes) ? { slaveNodes: c.slaveNodes.map(rn) } : {}),
    ...(Array.isArray(c.terms) ? { terms: c.terms.map((t: any) => ({ ...t, nodeId: rn(t.nodeId) })) } : {}),
  }));
  if (snap.connectors) snap.connectors = snap.connectors.map(([id, c]: [number, any]) => [id, { ...c, nodeI: rn(c.nodeI), nodeJ: rn(c.nodeJ) }]);
  if (snap.footings) snap.footings = snap.footings.map(([id, f]: [number, any]) => [id, {
    ...f, nodeId: rn(f.nodeId), ...(f.columnElementId !== undefined ? { columnElementId: re(f.columnElementId) } : {}),
  }]);
  if (snap.groups) snap.groups = snap.groups.map(([id, g]: [number, any]) => [id, {
    ...g, members: {
      ...g.members,
      ...(g.members.nodes ? { nodes: g.members.nodes.map(rn) } : {}),
      ...(g.members.elements ? { elements: g.members.elements.map(re) } : {}),
      ...(g.members.plates ? { plates: g.members.plates.map(rp) } : {}),
      ...(g.members.quads ? { quads: g.members.quads.map(rq) } : {}),
    },
  }]);
  // Counters stay ahead of every id in use.
  const maxOf = (m: Map<number, number>) => Math.max(0, ...m.values());
  snap.nextId = {
    ...snap.nextId,
    node: Math.max(snap.nextId.node, maxOf(nodeMap) + 1),
    element: Math.max(snap.nextId.element, maxOf(elemMap) + 1),
    ...(snap.nextId.plate !== undefined ? { plate: Math.max(snap.nextId.plate, maxOf(plateMapR) + 1) } : {}),
    ...(snap.nextId.quad !== undefined ? { quad: Math.max(snap.nextId.quad, maxOf(quadMapR) + 1) } : {}),
  };

  modelStore.batch(() => modelStore.restore(snap as never));
  const changed = (m: Map<number, number>) => [...m].filter(([a, b]) => a !== b).length;
  return {
    nodes: nodes.size, members: elements.size, shells: plateMapR.size + quadMapR.size,
    changedNodes: changed(nodeMap), changedMembers: changed(elemMap), changedShells: changed(plateMapR) + changed(quadMapR),
  };
}
