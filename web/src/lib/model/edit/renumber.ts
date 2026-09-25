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
 * ── When it is refused ────────────────────────────────────────────
 *
 * Design documents — detailing, exports, manual edits, joint designs, revisions — are keyed by
 * the numbers they were produced against. Renumbering under them would silently attach every one
 * to a different member. A model that carries any is not renumbered; the answer is to renumber
 * before designing.
 */

import { modelStore } from '../../store/model.svelte';

export type AxisOrder = 'zyx' | 'zxy' | 'xyz' | 'yxz';
export interface RenumberOptions { nodes: boolean; members: boolean; order: AxisOrder; tol?: number }
export type RenumberResult =
  | { nodes: number; members: number; changedNodes: number; changedMembers: number }
  | { refused: 'hasDesignDocuments'; fields: string[] };

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

export function renumber(opts: RenumberOptions): RenumberResult {
  const fields = designDocumentFields();
  if (fields.length > 0) return { refused: 'hasDesignDocuments', fields };
  const tol = opts.tol ?? 1e-3;
  const snap = JSON.parse(JSON.stringify(modelStore.snapshot())) as Record<string, any>;

  const nodes = new Map<number, P>(snap.nodes);
  const nodeMap = new Map<number, number>();
  if (opts.nodes) {
    [...nodes.entries()].sort((a, b) => cmp(keyOf(a[1], opts.order, tol), keyOf(b[1], opts.order, tol)) || a[0] - b[0])
      .forEach(([id], k) => nodeMap.set(id, k + 1));
  } else for (const id of nodes.keys()) nodeMap.set(id, id);
  const rn = (id: number) => nodeMap.get(id) ?? id;

  const elements = new Map<number, any>(snap.elements);
  const elemMap = new Map<number, number>();
  if (opts.members) {
    const mid = (e: any): P => {
      const a = nodes.get(e.nodeI)!, b = nodes.get(e.nodeJ)!;
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
    };
    [...elements.entries()].sort((a, b) => cmp(keyOf(mid(a[1]), opts.order, tol), keyOf(mid(b[1]), opts.order, tol)) || a[0] - b[0])
      .forEach(([id], k) => elemMap.set(id, k + 1));
  } else for (const id of elements.keys()) elemMap.set(id, id);
  const re = (id: number) => elemMap.get(id) ?? id;

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
    },
  }));
  snap.plates = (snap.plates ?? []).map(([id, p]: [number, any]) => [id, { ...p, nodes: p.nodes.map(rn) }]);
  snap.quads = (snap.quads ?? []).map(([id, q]: [number, any]) => [id, { ...q, nodes: q.nodes.map(rn) }]);
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
    },
  }]);
  // Counters stay ahead of every id in use.
  snap.nextId = { ...snap.nextId, node: Math.max(snap.nextId.node, nodes.size + 1), element: Math.max(snap.nextId.element, elements.size + 1) };

  modelStore.batch(() => modelStore.restore(snap as never));
  return {
    nodes: nodes.size, members: elements.size,
    changedNodes: [...nodeMap].filter(([a, b]) => a !== b).length,
    changedMembers: [...elemMap].filter(([a, b]) => a !== b).length,
  };
}
