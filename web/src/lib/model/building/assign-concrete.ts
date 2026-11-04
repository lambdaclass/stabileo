/**
 * A concrete for a kind of element, on every level or on one: its bars and shells take the
 * material. The analysis changes with it (E), so it is a model step and retires the solve.
 */
import { modelStore } from '../../store/model.svelte';
import { physicalGroups } from '../../store/physical';
import type { PhysicalKind } from '../physical/types';

export function assignConcrete(kind: PhysicalKind, materialId: number, levelId?: string): number {
  if (!modelStore.materials.has(materialId)) return 0;
  const groups = physicalGroups().filter((g) => g.physical.kind === kind && (!levelId || g.physical.levelFrom === levelId || g.physical.levelTo === levelId));
  let n = 0;
  modelStore.batch(() => {
    for (const g of groups) {
      for (const id of g.members.elements ?? []) { const e = modelStore.elements.get(id); if (e && e.materialId !== materialId) { modelStore.updateElementMaterial(id, materialId); n++; } }
      for (const id of g.members.quads ?? []) { const q = modelStore.quads.get(id); if (q && q.materialId !== materialId) { modelStore.updateQuad(id, { materialId }); n++; } }
      for (const id of g.members.plates ?? []) { const p = modelStore.plates.get(id); if (p && p.materialId !== materialId) { modelStore.updatePlate(id, { materialId }); n++; } }
    }
  });
  return n;
}
