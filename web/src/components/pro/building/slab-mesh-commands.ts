import { tp } from '../../../lib/i18n';
import { deferredSlabMeshes, simplifySlabs } from '../../../lib/model/building/deferred-slabs';

export { deferredSlabMeshes as buildingSlabMeshes };

export function removeBuildingSlabMeshes(ids: readonly number[]): string {
  const result = simplifySlabs(ids);
  return result.refused.length ? tp('building.slabs.cannotSimplify', { names: result.refused.join(', ') })
    : tp('building.slabs.simplified', { n: result.slabs });
}
