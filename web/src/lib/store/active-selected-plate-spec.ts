import { t } from '../i18n';
import { modelStore } from './model.svelte';
import { plateSpringRequirements } from '../model/physical/plate-springs';
import { plateEntry, plateShellKeys, platesWholeIn, setPlateShellSpec } from './physical-plates';
import type { PreparePlateSprings, SelectedPlateSpec } from './selected-plate-spec';

export const setSelectedPlateSpec: SelectedPlateSpec = (shells, spec) => {
  const ids = platesWholeIn(shells);
  if (typeof spec !== 'function') {
    setPlateShellSpec(ids, spec);
    return;
  }
  for (const id of ids) {
    const plate = plateEntry(id);
    if (plate) setPlateShellSpec([id], spec(plate.surface.thickness));
  }
};

export const preparePlateSprings: PreparePlateSprings = (keys, soil) => {
  const plates = platesWholeIn(keys);
  const whole = new Set(plates.flatMap(id => plateShellKeys(id)));
  const { nodes, incompatible, invalid } = plateSpringRequirements(modelStore.model, new Map(plates.map(id => [id, soil])));
  const owned = new Set<number>();
  for (const key of keys) {
    const id = Number(key.slice(1));
    const shell = key.startsWith('q') ? modelStore.quads.get(id) : modelStore.plates.get(id);
    for (const node of shell?.nodes ?? []) {
      if (whole.has(key)) owned.add(node);
      else if (nodes.has(node)) return { error: t('foundation.mixedSoilSelection') };
    }
  }
  if (invalid || [...owned].some(node => incompatible.has(node))) return { error: t('foundation.inconsistentPlateSprings') };
  return { owned, save: () => { if (plates.length) setPlateShellSpec(plates, { springs: soil }, owned); } };
};
