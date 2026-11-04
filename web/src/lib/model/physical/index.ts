export * from './types';
export * from './recognize';

import { PHYSICAL_GROUP_KIND, type PhysicalData, type PhysicalKind } from './types';

interface GroupLike { id: number; kind: string; members: { elements?: number[]; plates?: number[]; quads?: number[] }; data?: Record<string, unknown> }

/** The physical data a group carries, or null when it is not a physical element. */
export function physicalDataOf(g: GroupLike): PhysicalData | null {
  if (g.kind !== PHYSICAL_GROUP_KIND) return null;
  const d = g.data as Partial<PhysicalData> | undefined;
  return d && typeof d.kind === 'string' ? (d as PhysicalData) : null;
}

/** Each analysis bar's physical kind, from the physical elements that hold it. */
export function physicalKindIndex(groups: Iterable<GroupLike>): Map<number, PhysicalKind> {
  const out = new Map<number, PhysicalKind>();
  for (const g of groups) {
    const d = physicalDataOf(g);
    if (!d) continue;
    for (const id of g.members.elements ?? []) out.set(id, d.kind);
  }
  return out;
}
