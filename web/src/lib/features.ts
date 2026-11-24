/**
 * Feature flags for gradual rollout and quick rollback.
 *
 * Flags are read from localStorage (for user overrides) with a build-time
 * default. A flag that is expensive to compute should be cached at module
 * scope; one that is cheap can be read on every access.
 */

import { buildFeatures } from '../../config/public-features.mjs';
import { publicFeatureEnabledWithFlags, type PublicFeatures } from './public-feature-policy';
export type { PublicFeatures } from './public-feature-policy';

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

export const PUBLIC_POLICY_AVAILABLE = typeof __PUBLIC_FEATURES_COMPILED__ === 'undefined'
  ? (['research', 'tools', 'diagramGame', 'accounts'] as const).some(key => buildFeatures()[key])
  : __PUBLIC_FEATURES__.research || __PUBLIC_FEATURES__.tools || __PUBLIC_FEATURES__.diagramGame || __PUBLIC_FEATURES__.accounts;

export function globalAxes(): boolean {
  return typeof __PUBLIC_FEATURES_COMPILED__ === 'undefined' ? buildFeatures().globalAxes : __PUBLIC_FEATURES__.globalAxes;
}

export function accounts(): boolean {
  const built = typeof __PUBLIC_FEATURES_COMPILED__ === 'undefined' ? buildFeatures().accounts : __PUBLIC_FEATURES__.accounts;
  return built && readFlag('accounts', true);
}

export function researchBuilt(): boolean {
  return typeof __PUBLIC_FEATURES_COMPILED__ === 'undefined' ? buildFeatures().research : __PUBLIC_FEATURES__.research;
}

export function research(): boolean {
  return researchBuilt() && readFlag('research', true);
}

export function tools(): boolean {
  const built = typeof __PUBLIC_FEATURES_COMPILED__ === 'undefined' ? buildFeatures().tools : __PUBLIC_FEATURES__.tools;
  return built && readFlag('tools', true);
}

export function diagramGame(): boolean {
  const built = typeof __PUBLIC_FEATURES_COMPILED__ === 'undefined' ? buildFeatures().diagramGame : __PUBLIC_FEATURES__.diagramGame;
  return built && readFlag('diagram-game', true);
}

export const publicFeatures = (): PublicFeatures => ({ research: research(), tools: tools(), diagramGame: diagramGame(), accounts: accounts() });

export function publicFeatureEnabled(path: string, flags: PublicFeatures = publicFeatures()): boolean {
  return publicFeatureEnabledWithFlags(path, { ...flags, accounts: flags.accounts ?? accounts() });
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
