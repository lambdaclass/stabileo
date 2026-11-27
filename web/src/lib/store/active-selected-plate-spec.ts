import { plateEntry, platesWholeIn, setPlateShellSpec } from './physical-plates';
import type { SelectedPlateSpec } from './selected-plate-spec';

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
