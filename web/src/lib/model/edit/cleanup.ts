/**
 * Clearing the integrity findings in one step each: coincident nodes, duplicate members,
 * zero-length members and orphan nodes.
 *
 * The diagnostics find these; until now the only remedy was to hunt them one by one. Each
 * function here is one undo step and reports what it did, including anything it had to give up.
 *
 * ── Merging coincident nodes ──────────────────────────────────────
 *
 * The manual merge previews all candidates and refuses the operation when it would
 * discard supports, collapse a connection or move a cluster beyond the tolerance.
 * Low-level mergeNodesInto remains available to topology commands with their own checks.
 */

import { weldTolerance } from '../weld-tolerance';
import { modelStore } from '../../store/model.svelte';
import type { Load, Node } from '../../store/model.svelte';
import { WELD_TOL } from '../../engine/mesh-weld';
import { plateLoops, plateSurfaceOf } from '../physical/plate';
import { constraintNodes } from '../../engine/steel/unbraced-length';
import { generatedMetadata } from './generated-metadata';

/**
 * The default weld tolerance (`WELD_TOL`, from engine/mesh-weld); the one in force is
 * `weldTolerance()`, which the diagnostics that flag coincident nodes and the commands that
 * repair them both read, so they cannot disagree.
 */
export const MERGE_TOL = WELD_TOL;

export interface CleanupReport {
  mergedNodes: number;
  blockedMerges: number;
  droppedSupports: number;
  removedDuplicates: number;
  removedLoadsOnDuplicates: number;
  removedZeroLength: number;
  removedOrphans: number;
}

const empty = (): CleanupReport => ({
  mergedNodes: 0, blockedMerges: 0, droppedSupports: 0, removedDuplicates: 0, removedLoadsOnDuplicates: 0, removedZeroLength: 0, removedOrphans: 0,
});

/** Groups of coincident nodes, each sorted, lowest id first. Spatial hash on the tolerance. */
export function coincidentNodeGroups(tol = weldTolerance(), nodes: ReadonlyMap<number, Node> = modelStore.nodes): number[][] {
  const cells = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.round(x / tol)},${Math.round(y / tol)},${Math.round(z / tol)}`;
  const parent = new Map<number, number>();
  const find = (a: number): number => { while (parent.get(a) !== a) a = parent.get(a)!; return a; };
  for (const n of nodes.values()) parent.set(n.id, n.id);
  for (const n of nodes.values()) {
    const [cx, cy, cz] = [Math.round(n.x / tol), Math.round(n.y / tol), Math.round((n.z ?? 0) / tol)];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const m of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        const o = nodes.get(m)!;
        if (Math.hypot(o.x - n.x, o.y - n.y, (o.z ?? 0) - (n.z ?? 0)) <= tol) {
          const a = find(n.id), b = find(m);
          if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
        }
      }
    }
    const k = key(n.x, n.y, n.z ?? 0);
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(n.id);
  }
  const groups = new Map<number, number[]>();
  for (const id of parent.keys()) { const r = find(id); (groups.get(r) ?? groups.set(r, []).get(r)!).push(id); }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => a - b));
}

export type MergeConflictReason = 'invalid' | 'tolerance' | 'supports' | 'connection';
export interface NodeMergePlan {
  groups: number[][];
  to: Map<number, number>;
  conflicts: Array<{ reason: MergeConflictReason; nodes: number[] }>;
}

/** Read-only preview. Execution always recomputes this against the current model. */
export function planCoincidentNodeMerge(tol = weldTolerance()): NodeMergePlan {
  const plan: NodeMergePlan = { groups: [], to: new Map(), conflicts: [] };
  if (!Number.isFinite(tol) || tol <= 0 || tol >= 1
    || [...modelStore.nodes.values()].some(n => [n.x, n.y, n.z ?? 0].some(v => !Number.isFinite(v) || !Number.isSafeInteger(Math.round(v / tol))))) {
    plan.conflicts.push({ reason: 'invalid', nodes: [] });
    return plan;
  }
  plan.groups = coincidentNodeGroups(tol);
  for (const g of plan.groups) {
    const target = modelStore.nodes.get(g[0]!)!;
    for (const id of g.slice(1)) plan.to.set(id, g[0]!);
    // A transitive cluster may be longer than the tolerance: never snap its far end.
    if (g.some(id => { const n = modelStore.nodes.get(id)!; return Math.hypot(n.x - target.x, n.y - target.y, (n.z ?? 0) - (target.z ?? 0)) > tol; })) {
      plan.conflicts.push({ reason: 'tolerance', nodes: g });
    }
  }
  const r = (id: number) => plan.to.get(id) ?? id;
  const affected = new Set(plan.groups.flat());
  const supported = new Map<number, number[]>();
  for (const s of modelStore.supports.values()) {
    if (!affected.has(s.nodeId)) continue;
    const list = supported.get(r(s.nodeId)) ?? [];
    list.push(s.nodeId); supported.set(r(s.nodeId), list);
  }
  // Even identical springs add stiffness; silently dropping either is not equivalent.
  for (const nodes of supported.values()) if (nodes.length > 1) plan.conflicts.push({ reason: 'supports', nodes });
  const check = (nodes: number[]) => {
    if (!nodes.some(n => plan.to.has(n))) return;
    if (new Set(nodes.map(r)).size < new Set(nodes).size) plan.conflicts.push({ reason: 'connection', nodes });
  };
  for (const e of modelStore.elements.values()) check([e.nodeI, e.nodeJ]);
  for (const e of modelStore.model.connectors.values()) check([e.nodeI, e.nodeJ]);
  for (const c of modelStore.model.constraints) check([...constraintNodes([c])]);
  for (const q of modelStore.quads.values()) check(q.nodes);
  for (const p of modelStore.plates.values()) check(p.nodes);
  for (const g of modelStore.model.groups.values()) if (plateSurfaceOf(g)) {
    const loops = plateLoops(g);
    check([...loops.outer, ...loops.holes.flat()]);
  }
  return plan;
}

export function mergeCoincidentNodes(tol = weldTolerance()): CleanupReport {
  const report = empty(), plan = planCoincidentNodeMerge(tol);
  if (plan.conflicts.length) { report.blockedMerges = plan.conflicts.length; return report; }
  mergeNodesInto(plan.to, report);
  return report;
}

/**
 * Rename every reference to a node in `to`'s keys to its value, and remove the renamed nodes:
 * member ends, shell corners, supports, nodal loads, constraints, connectors, footings and
 * groups. Two supports landing on one node cannot both stay; the first is kept. One undo step.
 */
export function mergeNodesInto(to: ReadonlyMap<number, number>, report: CleanupReport = empty()): CleanupReport {
  if (to.size === 0) return report;
  const r = (id: number) => to.get(id) ?? id;

  modelStore.batch(() => {
    for (const e of [...modelStore.elements.values()]) {
      if (to.has(e.nodeI) || to.has(e.nodeJ)) modelStore.updateElement(e.id, { nodeI: r(e.nodeI), nodeJ: r(e.nodeJ) });
    }
    for (const q of [...modelStore.quads.values()]) if (q.nodes.some((n) => to.has(n))) modelStore.updateQuadNodes(q.id, q.nodes.map(r) as typeof q.nodes);
    for (const p of [...modelStore.plates.values()]) if (p.nodes.some((n) => to.has(n))) modelStore.updatePlateNodes(p.id, p.nodes.map(r) as typeof p.nodes);
    const supported = new Set<number>();
    const targets = new Set(to.values());
    for (const s of [...modelStore.supports.values()].sort((a, b) => a.id - b.id)) {
      const target = r(s.nodeId);
      if (!targets.has(target)) continue;
      if (supported.has(target)) { modelStore.removeSupport(s.id); report.droppedSupports++; continue; }
      supported.add(target);
      if (target !== s.nodeId) modelStore.updateSupport(s.id, { nodeId: target });
    }
    modelStore.replaceLoads(modelStore.loads.map((l) => {
      const d = l.data as { nodeId?: number };
      return d.nodeId !== undefined && to.has(d.nodeId) ? ({ ...l, data: { ...l.data, nodeId: r(d.nodeId) } } as Load) : l;
    }));
    modelStore.remapNodeReferences(new Map(to));
    for (const g of modelStore.model.groups.values()) {
      const data = generatedMetadata(g);
      if (data && data.nodes.some((n) => to.has(n.id))) {
        const owned = new Set(data.nodes.filter((n) => n.owned).map((n) => n.id));
        const nodes = data.nodes.map((n) => ({ id: r(n.id), owned: n.owned && owned.has(r(n.id)) }));
        modelStore.setGroupData(g.id, { ...data, nodes });
        modelStore.setGroupMembers(g.id, { ...g.members, nodes: [...new Set(nodes.filter((n) => n.owned).map((n) => n.id))] });
        continue;
      }
      if (g.members.nodes?.some((n) => to.has(n))) {
        modelStore.setGroupMembers(g.id, { ...g.members, nodes: [...new Set(g.members.nodes.map(r))] });
      }
    }
    for (const id of to.keys()) { modelStore.removeNode(id); report.mergedNodes++; }
  });
  return report;
}

/** Members joining the same two nodes: the lowest id stays. With candidates, preserve all other members first. */
export function removeDuplicateMembers(candidates?: ReadonlySet<number>): CleanupReport {
  const report = empty();
  const seen = new Map<string, number>();
  const dup: number[] = [];
  const members = [...modelStore.elements.values()].sort((a, b) =>
    (candidates ? Number(candidates.has(a.id)) - Number(candidates.has(b.id)) : 0) || a.id - b.id);
  for (const e of members) {
    const k = e.nodeI < e.nodeJ ? `${e.nodeI}-${e.nodeJ}` : `${e.nodeJ}-${e.nodeI}`;
    if (seen.has(k) && (!candidates || candidates.has(e.id))) dup.push(e.id); else seen.set(k, e.id);
  }
  if (dup.length === 0) return report;
  const onDup = new Set(dup);
  report.removedLoadsOnDuplicates = modelStore.loads.filter((l) => onDup.has((l.data as { elementId?: number }).elementId ?? -1)).length;
  modelStore.batch(() => { for (const id of dup) { modelStore.removeElement(id); report.removedDuplicates++; } });
  return report;
}

/**
 * Members shorter than the weld tolerance, among `candidates` when given: what the edit panel
 * counts and the clean-up removes.
 */
export function zeroLengthMembers(tol = weldTolerance(), candidates?: ReadonlySet<number>): number[] {
  return [...modelStore.elements.values()].filter((e) => {
    if (candidates && !candidates.has(e.id)) return false;
    if (e.nodeI === e.nodeJ) return true;
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    return !!a && !!b && Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) <= tol;
  }).map((e) => e.id);
}

export function removeZeroLengthMembers(tol = weldTolerance(), candidates?: ReadonlySet<number>): CleanupReport {
  const report = empty();
  const zero = zeroLengthMembers(tol, candidates);
  if (zero.length === 0) return report;
  modelStore.batch(() => { for (const id of zero) { modelStore.removeElement(id); report.removedZeroLength++; } });
  return report;
}

/** Nodes nothing refers to. */
export function removeOrphanNodes(): CleanupReport {
  const report = empty();
  const used = new Set<number>();
  for (const e of modelStore.elements.values()) { used.add(e.nodeI); used.add(e.nodeJ); }
  for (const q of modelStore.quads.values()) q.nodes.forEach((n) => used.add(n));
  for (const p of modelStore.plates.values()) p.nodes.forEach((n) => used.add(n));
  for (const s of modelStore.supports.values()) used.add(s.nodeId);
  for (const l of modelStore.loads) { const n = (l.data as { nodeId?: number }).nodeId; if (n !== undefined) used.add(n); }
  for (const n of modelStore.referencedNodeIds()) used.add(n);
  const orphans = [...modelStore.nodes.keys()].filter((id) => !used.has(id));
  if (orphans.length === 0) return report;
  modelStore.batch(() => { for (const id of orphans) { modelStore.removeNode(id); report.removedOrphans++; } });
  return report;
}

/** All four, in the order that lets each clear what the previous one uncovers. One undo step. */
export function cleanUpModel(tol = weldTolerance()): CleanupReport {
  const total = empty();
  const plan = planCoincidentNodeMerge(tol);
  if (plan.conflicts.length) { total.blockedMerges = plan.conflicts.length; return total; }
  modelStore.batch(() => {
    for (const r of [mergeNodesInto(plan.to), removeZeroLengthMembers(tol), removeDuplicateMembers(), removeOrphanNodes()]) {
      for (const k of Object.keys(total) as (keyof CleanupReport)[]) total[k] += r[k];
    }
  });
  return total;
}

/**
 * Unify repeated materials or sections: every member (and shell, for materials) using one of a
 * set is moved to its first id, and the others are removed. One undo step.
 */
export function unifyProperties(kind: 'materials' | 'sections', sets: readonly number[][]): number {
  let removed = 0;
  modelStore.batch(() => {
    for (const ids of sets) {
      const [keep, ...drop] = ids;
      if (keep === undefined || drop.length === 0) continue;
      const gone = new Set(drop);
      for (const e of modelStore.elements.values()) {
        if (kind === 'materials' && gone.has(e.materialId)) modelStore.updateElement(e.id, { materialId: keep } as never);
        if (kind === 'sections' && gone.has(e.sectionId)) modelStore.updateElement(e.id, { sectionId: keep } as never);
      }
      if (kind === 'materials') {
        for (const [id, q] of modelStore.quads) if (gone.has(q.materialId)) modelStore.updateQuad(id, { materialId: keep });
        for (const [id, p] of modelStore.plates) if (gone.has(p.materialId)) modelStore.updatePlate(id, { materialId: keep });
      }
      for (const id of drop) if (kind === 'materials' ? modelStore.removeMaterial(id) : modelStore.removeSection(id)) removed++;
    }
  });
  return removed;
}
