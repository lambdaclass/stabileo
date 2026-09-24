/**
 * Clearing the integrity findings in one step each: coincident nodes, duplicate members,
 * zero-length members and orphan nodes.
 *
 * The diagnostics find these; until now the only remedy was to hunt them one by one. Each
 * function here is one undo step and reports what it did, including anything it had to give up.
 *
 * ── Merging coincident nodes ──────────────────────────────────────
 *
 * Nodes within the tolerance of each other become the lowest-numbered of them, and everything that
 * named the others is renamed: member ends, shell corners, supports, nodal loads, constraints,
 * connectors, footings and groups. Two supports on nodes that merge cannot both stay; the first is
 * kept and the other is counted as dropped. A member whose two ends merge has become zero-length,
 * and a member that now duplicates another is a duplicate; both are left for the functions below,
 * which the combined clean-up runs next.
 */

import { modelStore } from '../../store/model.svelte';
import type { Load } from '../../store/model.svelte';

export const MERGE_TOL = 1e-4;

export interface CleanupReport {
  mergedNodes: number;
  droppedSupports: number;
  removedDuplicates: number;
  removedLoadsOnDuplicates: number;
  removedZeroLength: number;
  removedOrphans: number;
}

const empty = (): CleanupReport => ({
  mergedNodes: 0, droppedSupports: 0, removedDuplicates: 0, removedLoadsOnDuplicates: 0, removedZeroLength: 0, removedOrphans: 0,
});

/** Groups of coincident nodes, each sorted, lowest id first. Spatial hash on the tolerance. */
export function coincidentNodeGroups(tol = MERGE_TOL): number[][] {
  const cells = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.round(x / tol)},${Math.round(y / tol)},${Math.round(z / tol)}`;
  const parent = new Map<number, number>();
  const find = (a: number): number => { while (parent.get(a) !== a) a = parent.get(a)!; return a; };
  for (const n of modelStore.nodes.values()) parent.set(n.id, n.id);
  for (const n of modelStore.nodes.values()) {
    const [cx, cy, cz] = [Math.round(n.x / tol), Math.round(n.y / tol), Math.round((n.z ?? 0) / tol)];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const m of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        const o = modelStore.nodes.get(m)!;
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

export function mergeCoincidentNodes(tol = MERGE_TOL): CleanupReport {
  const report = empty();
  const groups = coincidentNodeGroups(tol);
  if (groups.length === 0) return report;
  const to = new Map<number, number>();
  for (const g of groups) for (const id of g.slice(1)) to.set(id, g[0]!);
  const r = (id: number) => to.get(id) ?? id;

  modelStore.batch(() => {
    for (const e of [...modelStore.elements.values()]) {
      if (to.has(e.nodeI) || to.has(e.nodeJ)) modelStore.updateElement(e.id, { nodeI: r(e.nodeI), nodeJ: r(e.nodeJ) });
    }
    for (const q of [...modelStore.quads.values()]) if (q.nodes.some((n) => to.has(n))) modelStore.updateQuadNodes(q.id, q.nodes.map(r) as typeof q.nodes);
    for (const p of [...modelStore.plates.values()]) if (p.nodes.some((n) => to.has(n))) modelStore.updatePlateNodes(p.id, p.nodes.map(r) as typeof p.nodes);
    const supported = new Set<number>();
    for (const s of [...modelStore.supports.values()].sort((a, b) => a.id - b.id)) {
      const target = r(s.nodeId);
      if (supported.has(target)) { modelStore.removeSupport(s.id); report.droppedSupports++; continue; }
      supported.add(target);
      if (target !== s.nodeId) modelStore.updateSupport(s.id, { nodeId: target });
    }
    modelStore.replaceLoads(modelStore.loads.map((l) => {
      const d = l.data as { nodeId?: number };
      return d.nodeId !== undefined && to.has(d.nodeId) ? ({ ...l, data: { ...l.data, nodeId: r(d.nodeId) } } as Load) : l;
    }));
    modelStore.remapNodeReferences(to);
    for (const g of modelStore.model.groups.values()) {
      if (g.members.nodes?.some((n) => to.has(n))) {
        modelStore.setGroupMembers(g.id, { ...g.members, nodes: [...new Set(g.members.nodes.map(r))] });
      }
    }
    for (const id of to.keys()) { modelStore.removeNode(id); report.mergedNodes++; }
  });
  return report;
}

/** Members joining the same two nodes: the lowest id stays. */
export function removeDuplicateMembers(): CleanupReport {
  const report = empty();
  const seen = new Map<string, number>();
  const dup: number[] = [];
  for (const e of [...modelStore.elements.values()].sort((a, b) => a.id - b.id)) {
    const k = e.nodeI < e.nodeJ ? `${e.nodeI}-${e.nodeJ}` : `${e.nodeJ}-${e.nodeI}`;
    if (seen.has(k)) dup.push(e.id); else seen.set(k, e.id);
  }
  if (dup.length === 0) return report;
  const onDup = new Set(dup);
  report.removedLoadsOnDuplicates = modelStore.loads.filter((l) => onDup.has((l.data as { elementId?: number }).elementId ?? -1)).length;
  modelStore.batch(() => { for (const id of dup) { modelStore.removeElement(id); report.removedDuplicates++; } });
  return report;
}

export function removeZeroLengthMembers(tol = MERGE_TOL): CleanupReport {
  const report = empty();
  const zero = [...modelStore.elements.values()].filter((e) => {
    if (e.nodeI === e.nodeJ) return true;
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    return !!a && !!b && Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) <= tol;
  }).map((e) => e.id);
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
export function cleanUpModel(tol = MERGE_TOL): CleanupReport {
  const total = empty();
  modelStore.batch(() => {
    for (const r of [mergeCoincidentNodes(tol), removeZeroLengthMembers(tol), removeDuplicateMembers(), removeOrphanNodes()]) {
      for (const k of Object.keys(total) as (keyof CleanupReport)[]) total[k] += r[k];
    }
  });
  return total;
}
