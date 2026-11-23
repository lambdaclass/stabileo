import { modelStore } from './model.svelte';
import { designData } from './design-data';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { concreteFc } from '../model/design-data';

/**
 * The project's concrete as one set of properties: the least f'c among the concretes in use (the
 * conservative reading when a model mixes them), the reinforcement's fy and the slab cover from the
 * design data. f'c is 0 when the model holds no concrete.
 */
export function resolveConcreteProperties(): { fc: number; fy: number; cover: number } {
  let fc = Infinity;
  // Only the concretes: a steel's yield or a timber's strength is not an f'c.
  for (const m of modelStore.model.materials.values()) {
    if (materialFamilyOf(m, catalogueGradeFamily).family !== 'concrete') continue;
    const v = concreteFc(m);
    if (typeof v === 'number' && v > 0) fc = Math.min(fc, v);
  }
  const d = designData();
  return {
    fc: Number.isFinite(fc) ? fc : 0,
    fy: d.rebarFy,
    cover: d.covers.slab,
  };
}
