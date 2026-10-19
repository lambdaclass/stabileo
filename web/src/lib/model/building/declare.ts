/**
 * Declaring what the building tools place: a physical element per piece, named as the
 * recognition names them (C, V, D, L, M and a number that continues the model's own).
 */
import { modelStore } from '../../store/model.svelte';
import { PHYSICAL_GROUP_KIND, type PhysicalData, type PhysicalKind } from '../physical/types';
import { levelAt } from '../physical/recognize';

export type Members = { elements?: number[]; quads?: number[]; plates?: number[] };

export const PREFIX: Record<PhysicalKind, string> = { column: 'C', beam: 'V', brace: 'D', slab: 'L', wall: 'M' };

export function declare(name: string, members: Members, data: PhysicalData): number {
  return modelStore.addGroup(name, PHYSICAL_GROUP_KIND, members, { origin: 'user', data: data as unknown as Record<string, unknown> });
}

/** Names after the highest the model already has with that prefix. */
export const nextName = (prefix: string) => {
  let n = 0;
  for (const g of modelStore.model.groups.values()) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(g.name);
    if (g.kind === PHYSICAL_GROUP_KIND && m) n = Math.max(n, Number(m[1]));
  }
  return () => `${prefix}${++n}`;
};

/** A drawn run: the element it belongs to and the node it ends at. */
export interface DrawnRun { groupId: number; kind: PhysicalKind; end: number }

/**
 * Declare one drawn bar. A bar that starts where the last run of the same kind ended joins it
 * (a beam drawn in a chain is one beam, a column drawn storey by storey is one column); any
 * other starts an element of its own. Its levels are the grid's where its ends lie on one.
 */
export function declareDrawnBar(id: number, kind: 'column' | 'beam' | 'brace', typology: string | undefined, last: DrawnRun | null): DrawnRun | null {
  const e = modelStore.elements.get(id);
  if (!e) return null;
  const zi = modelStore.nodes.get(e.nodeI)?.z ?? 0, zj = modelStore.nodes.get(e.nodeJ)?.z ?? 0;
  const levels = modelStore.grid?.levels ?? [];
  const [lo, hi] = zi <= zj ? [zi, zj] : [zj, zi];
  const g = last && last.kind === kind && last.end === e.nodeI && kind !== 'brace' ? modelStore.model.groups.get(last.groupId) : undefined;
  if (g && g.kind === PHYSICAL_GROUP_KIND) {
    modelStore.setGroupMembers(g.id, { ...g.members, elements: [...(g.members.elements ?? []), id] });
    const d = g.data as unknown as PhysicalData;
    const zOf = (lv?: string) => levels.find((l) => l.id === lv)?.z ?? (lv?.startsWith('z:') ? Number(lv.slice(2)) : 0);
    if (kind === 'column' && hi > zOf(d.levelTo)) modelStore.setGroupData(g.id, { ...d, levelTo: levelAt(hi, levels) } as unknown as Record<string, unknown>);
    return { groupId: g.id, kind, end: e.nodeJ };
  }
  const groupId = declare(nextName(PREFIX[kind])(), { elements: [id] }, {
    kind, provenance: 'declared', levelFrom: levelAt(lo, levels), levelTo: levelAt(hi, levels),
    ...(typology ? { typology } : {}),
  });
  return { groupId, kind, end: e.nodeJ };
}
