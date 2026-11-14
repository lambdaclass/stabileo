/**
 * Feature flags for gradual rollout and quick rollback.
 *
 * Flags are read from localStorage (for user overrides) with a build-time
 * default. A flag that is expensive to compute should be cached at module
 * scope; one that is cheap can be read on every access.
 */

import { MAIN_TOOL_IDS } from './public-surface';

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

export const ACCOUNT_ROUTES_AVAILABLE = import.meta.env?.VITE_ACCOUNTS !== '0';

export function accounts(): boolean {
  return ACCOUNT_ROUTES_AVAILABLE && readFlag('accounts', import.meta.env?.DEV || import.meta.env?.VITE_ACCOUNTS === '1');
}

export function research(): boolean {
  return readFlag('research', import.meta.env?.VITE_RESEARCH === '1');
}

export function tools(): boolean {
  return readFlag('tools', import.meta.env?.VITE_TOOLS === '1');
}

export function diagramGame(): boolean {
  return readFlag('diagram-game', import.meta.env?.VITE_DIAGRAM_GAME === '1');
}

export type PublicFeatures = { research: boolean; tools: boolean; diagramGame: boolean; accounts?: boolean };

export const publicFeatures = (): PublicFeatures => ({ research: research(), tools: tools(), diagramGame: diagramGame(), accounts: accounts() });

export function publicFeatureEnabled(path: string, flags: PublicFeatures = publicFeatures()): boolean {
  const route = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (['/register', '/terms', '/privacy', '/usage-data'].includes(route)) return flags.accounts ?? accounts();
  if (route.startsWith('/tools/')) return flags.tools || MAIN_TOOL_IDS.some(id => route === `/tools/${id}`);
  if (route === '/diagram-game') return flags.diagramGame;
  return true;
}

/** Override a flag for the current session (used by tests and support). */
export function setFeatureFlag(name: string, value: boolean): void {
  try {
    localStorage.setItem(PREFIX + name, value ? '1' : '0');
  } catch {
    // private mode — ignore
  }
}

export function publicLocaleEnabled(path: string, locale: string, flags: PublicFeatures = publicFeatures()): boolean {
  const route = path.split(/[?#]/)[0].replace(/\/+$/, '');
  return locale !== 'hu' || !(route === '/research' || route.startsWith('/research/')) || flags.research;
}
