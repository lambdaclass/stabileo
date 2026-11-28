import type { setPlateShellSpec } from './physical-plates';

type PlateSpec = Parameters<typeof setPlateShellSpec>[1];
export type SelectedPlateSpec = (shells: ReadonlySet<string>, spec: PlateSpec | ((thickness: number) => PlateSpec)) => void;
export const setSelectedPlateSpec: SelectedPlateSpec | null = null;

export type PreparePlateSprings = (keys: ReadonlySet<string>, soil: import('../model/physical/plate-springs').PlateSoil) =>
  { error: string } | { owned: ReadonlySet<number>; save: () => void };
export const preparePlateSprings: PreparePlateSprings | null = null;
