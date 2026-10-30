/**
 * The reader's choice of how Basic 2D calculates P-Δ and the critical load (method, elements
 * per member, axial stiffness, modes), kept while the session lasts.
 */
import { DEFAULT_SETTINGS, ELEMENT_COUNTS, MAX_MODES, type SoSettings } from '../engine/second-order/settings';

let settings = $state<SoSettings>({ ...DEFAULT_SETTINGS });

export const secondOrderSettings = {
  get value(): SoSettings { return settings; },
  set(patch: Partial<SoSettings>): void {
    const next = { ...settings, ...patch };
    if (!ELEMENT_COUNTS.includes(next.n as (typeof ELEMENT_COUNTS)[number])) next.n = DEFAULT_SETTINGS.n;
    next.modes = Math.max(1, Math.min(MAX_MODES, Math.round(next.modes) || DEFAULT_SETTINGS.modes));
    settings = next;
  },
  reset(): void { settings = { ...DEFAULT_SETTINGS }; },
  /** A plain copy for a solve, outside the reactive proxy. */
  snapshot(): SoSettings { return { ...settings }; },
};
