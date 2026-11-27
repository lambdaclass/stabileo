import type { setPlateShellSpec } from './physical-plates';

type PlateSpec = Parameters<typeof setPlateShellSpec>[1];
export type SelectedPlateSpec = (shells: ReadonlySet<string>, spec: PlateSpec | ((thickness: number) => PlateSpec)) => void;
export const setSelectedPlateSpec: SelectedPlateSpec | null = null;
