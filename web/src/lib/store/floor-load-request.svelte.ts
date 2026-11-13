/** A target for the area-load section asked for from elsewhere (a plate's panel): the Loads tab opens that section with it chosen. */
export const floorLoadRequest = $state<{ target: string | null }>({ target: null });

export function requestFloorLoad(target: string): void {
  floorLoadRequest.target = target;
}
