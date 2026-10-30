import { onlineServicesAvailable } from './frozen-services';

/**
 * Feature flags for gradual rollout and quick rollback.
 *
 * Flags are read from localStorage (for user overrides) with a build-time
 * default. A flag that is expensive to compute should be cached at module
 * scope; one that is cheap can be read on every access.
 */

const PREFIX = 'stabileo-feature-';

function readFlag(name: string, defaultValue: boolean): boolean {
  try {
    const v = localStorage.getItem(PREFIX + name);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    // private mode / SSR — fall through to default
  }
  return defaultValue;
}

/**
 * Canonical section geometry (PR #124).
 *
 * When off, sections resolve to properties-only regardless of whether the
 * WASM export is present, and the section engine is never consulted. The
 * solver path (A/I/J declared on the section) is unchanged either way, so a
 * model solves identically with the flag on or off — only the detailed
 * stress/drawing path is gated.
 *
 * Default ON: the engine is the shipped behaviour. The flag exists so a bad
 * build or a regression can be turned off in the field without a redeploy.
 */
export function canonicalSections(): boolean {
  return readFlag('canonical-sections', true);
}

export function accounts(): boolean {
  return onlineServicesAvailable() && readFlag('accounts', import.meta.env.DEV || import.meta.env.VITE_ACCOUNTS === '1');
}

/** Override a flag for the current session (used by tests and support). */
export function setFeatureFlag(name: string, value: boolean): void {
  try {
    localStorage.setItem(PREFIX + name, value ? '1' : '0');
  } catch {
    // private mode — ignore
  }
}
