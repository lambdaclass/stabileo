/**
 * What a footing carries beyond its own node, for the general footing path: the reactions at
 * every supported node, the column standing on each, and the thickness of a strip's wall.
 */
import { modelStore } from './model.svelte';
import { collectFootingColumns, collectNodeReactions } from './detailing-footing-inputs';
import { columnOn } from '../model/foundation/generate';
import type { FootingColumn, NodeReactions } from '../engine/detailing/run-footing-design';

/** Reactions at every node a footing rests on, its own and the others it carries. */
export function collectFootingSupportReactions(): Map<number, NodeReactions> {
  return collectNodeReactions([...modelStore.model.footings.values()].flatMap((f) => [f.nodeId, ...(f.supportedNodeIds ?? [])]));
}

export function collectFootingSupport(): {
  columns: Map<number, FootingColumn>;
  columnAt: (nodeId: number) => FootingColumn | undefined;
  wallThickness: Map<number, number>;
} {
  const columns = collectFootingColumns();
  const at = new Map<number, FootingColumn>();
  for (const f of modelStore.model.footings.values()) {
    for (const n of f.supportedNodeIds ?? []) {
      const id = columnOn(n);
      const el = id === undefined ? undefined : modelStore.model.elements.get(id);
      const sec = el ? modelStore.model.sections.get(el.sectionId) : undefined;
      if (id !== undefined && sec?.b && sec?.h) at.set(n, columns.get(id) ?? { elementId: id, b: sec.b, h: sec.h });
    }
  }
  const wallThickness = new Map<number, number>();
  for (const f of modelStore.model.footings.values()) {
    if (f.wallGroupId === undefined || wallThickness.has(f.wallGroupId)) continue;
    const g = modelStore.model.groups.get(f.wallGroupId);
    const t = [...(g?.members.quads ?? []).map((q) => modelStore.quads.get(q)?.thickness), ...(g?.members.plates ?? []).map((p) => modelStore.plates.get(p)?.thickness)]
      .find((x): x is number => typeof x === 'number' && x > 0);
    if (t !== undefined) wallThickness.set(f.wallGroupId, t);
  }
  return { columns, columnAt: (n) => at.get(n), wallThickness };
}
