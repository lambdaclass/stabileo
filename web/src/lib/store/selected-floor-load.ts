import type { acceptsFloorPlate as testPlate, selectedFloorLoad as createSelection, requestFloorLoad as request, watchFloorLoadRequest as watch } from './selected-floor-load-enabled.svelte';

export const selectedFloorLoad: typeof createSelection | null = null;
export const acceptsFloorPlate: typeof testPlate | null = null;

export const requestFloorLoad: typeof request | null = null;
export const watchFloorLoadRequest: typeof watch | null = null;
