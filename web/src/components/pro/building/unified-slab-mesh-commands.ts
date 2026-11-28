import { tp } from '../../../lib/i18n';
import { modelStore } from '../../../lib/store/model.svelte';
import { clearPlateMesh, physicalPlates, plateStatus } from '../../../lib/store/physical-plates';

export function buildingSlabMeshes() {
  void modelStore.modelVersion;
  const waiting: number[] = [], meshed: number[] = [];
  for (const plate of physicalPlates()) {
    if (plate.physical.kind !== 'slab') continue;
    const status = plateStatus(plate.id);
    if (status === 'unmeshed') waiting.push(plate.id);
    if (status === 'current' || status === 'stale') meshed.push(plate.id);
  }
  return { waiting, meshed };
}

export function removeBuildingSlabMeshes(ids: readonly number[]): string {
  const result = clearPlateMesh(ids);
  return result.error ?? tp('building.slabs.cleared', { n: ids.length });
}
