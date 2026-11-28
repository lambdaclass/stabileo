import { unifiedPlates } from '../features';
import { tp } from '../i18n';
import { meshDeferredSlabs, representFootprints } from '../model/building/deferred-slabs';
import type { PlatePreparation } from './physical-plates';

export function prepareDeferredSolveSlabs(mode: string, notify?: (message: string) => void): string | null {
  if (unifiedPlates() && mode === 'pro') return null;
  const footprints = representFootprints();
  if (footprints.refused.length) return tp('building.slabs.cannotSimplify', { names: footprints.refused.join(', ') });
  if (footprints.slabs) notify?.(tp('building.slabs.footprintsAtSolve', { n: footprints.slabs }));
  const mesh = meshDeferredSlabs();
  if (mesh.slabs) notify?.(tp('building.slabs.meshedAtSolve', { n: mesh.slabs, shells: mesh.shells }));
  return null;
}

export function platePreparationError(result: Extract<PlatePreparation, { ok: false }>): string {
  if ('error' in result) return result.error;
  return tp({
    needsMesh: 'plates.analysisNeedsMesh',
    invalid: 'plates.analysisInvalid',
    localLoads: 'plates.analysisLocalLoads',
    refused: 'plates.analysisMeshRefused',
  }[result.reason], { names: result.plates.join(', ') });
}
