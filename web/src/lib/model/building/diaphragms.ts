/**
 * A rigid diaphragm per level: every node at the level tied in its plane to the one nearest the
 * level's centroid. One undo step for all the levels.
 *
 * A level whose nodes are supported is the base and gets none; a level that already has a
 * diaphragm keeps it and gets no second one, which would tie the same nodes twice.
 */
import { modelStore } from '../../store/model.svelte';
import { detectFloorLevels } from '../../engine/rigid-diaphragm';

export interface DiaphragmReport { added: number; base: number; existing: number }

/** Every elevation that holds two nodes or more, the base included. */
export const nodeLevels = (tol = 0.05): number[] => detectFloorLevels(modelStore.nodes as never, tol);

export function addLevelDiaphragms(levels: number[] = nodeLevels(), tol = 0.05): DiaphragmReport {
  const out: DiaphragmReport = { added: 0, base: 0, existing: 0 };
  const supported = new Set([...modelStore.supports.values()].map((s) => s.nodeId));
  const zOf = (id: number) => modelStore.nodes.get(id)?.z ?? 0;
  const planned: Array<{ master: number; slaves: number[] }> = [];
  for (const z of levels) {
    const ids = [...modelStore.nodes.values()].filter((n) => Math.abs((n.z ?? 0) - z) < tol).map((n) => n.id);
    if (ids.length < 2) continue;
    if (ids.some((id) => supported.has(id))) { out.base++; continue; }
    if (modelStore.constraints.some((c) => c.type === 'diaphragm' && Math.abs(zOf(c.masterNode) - z) < tol)) { out.existing++; continue; }
    const cx = ids.reduce((s, id) => s + modelStore.nodes.get(id)!.x, 0) / ids.length;
    const cy = ids.reduce((s, id) => s + modelStore.nodes.get(id)!.y, 0) / ids.length;
    const d = (id: number) => { const n = modelStore.nodes.get(id)!; return Math.hypot(n.x - cx, n.y - cy); };
    const master = ids.reduce((m, id) => (d(id) < d(m) ? id : m), ids[0]!);
      planned.push({ master, slaves: ids.filter((id) => id !== master) });
  }
  // Nothing to add is no undo step.
  if (planned.length > 0) modelStore.batch(() => {
    for (const p of planned) modelStore.addConstraint({ type: 'diaphragm', masterNode: p.master, slaveNodes: p.slaves, plane: 'XY' });
  });
  out.added = planned.length;
  return out;
}
