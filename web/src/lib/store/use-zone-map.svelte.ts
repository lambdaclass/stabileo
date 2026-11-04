/** How the use zones are drawn over the floors: not at all, by use, by state or by load intensity. A view setting. */
let mode = $state<'off' | 'use' | 'status' | 'intensity'>('off');
export const useZoneMap = {
  get mode() { return mode; },
  set mode(v: 'off' | 'use' | 'status' | 'intensity') { mode = v; },
};
