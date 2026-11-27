export type SlabFace = 'bottomX' | 'bottomY' | 'topX' | 'topY';
export const SLAB_FACES: readonly SlabFace[] = ['bottomX', 'bottomY', 'topX', 'topY'];

export const SLAB_MESH_DIAMETERS: readonly number[] = [8, 10, 12, 16];
export const SLAB_BAR_RANGE = { min: 6, max: 16 } as const;
export const BEAM_BAR_RANGE = { min: 10, max: 25 } as const;
export const COLUMN_BAR_RANGE = { min: 12, max: 32 } as const;
export const TIE_BAR_RANGE = { min: 6, max: 16 } as const;
export const WALL_BAR_RANGE = { min: 8, max: 20 } as const;
export const FOOTING_BAR_RANGE = { min: 10, max: 25 } as const;
export const inRange = (dia: number, r: { min: number; max: number }): boolean => dia >= r.min && dia <= r.max;
