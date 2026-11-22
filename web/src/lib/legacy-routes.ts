import { publicFeatures, type PublicFeatures } from './features';
import { EXAMPLE_PATHS } from './public-surface';
import { PUBLIC_LOCALES } from './i18n/offered';

/**
 * Routes that moved, old address to new, with the switch that publishes the new one: `/examples/<id>`
 * became the tool with the same id, and the diagram game, a single page, moved under the games hub.
 */
export const MOVED_ROUTES: readonly (readonly [string, string, 'tools' | 'diagramGame', 'prefix' | 'exact'])[] = [
  ['/examples', '/tools', 'tools', 'prefix'],
  ['/diagram-game', '/games/diagram-game', 'diagramGame', 'exact'],
];

/** Every address the site published before it moved, which keeps a page that sends its reader on. */
export const MOVED_PAGES: readonly string[] = [...EXAMPLE_PATHS, '/diagram-game'];

export const movedPages = (flags: PublicFeatures = publicFeatures()): readonly string[] => MOVED_PAGES.filter(path => movedRoute(path, flags) !== null);

export function movedRoute(path: string, flags: PublicFeatures = publicFeatures()): string | null {
  const route = path.replace(/\/+$/, '') || '/';
  for (const [from, to, flag, match] of MOVED_ROUTES) {
    if (!flags[flag]) continue;
    if (route === from) return to;
    if (match === 'prefix' && route.startsWith(`${from}/`)) return `${to}${route.slice(from.length)}`;
  }
  return null;
}

/** The address a moved page answers to now, keeping its language prefix, trailing slash, query and fragment. */
export function movedAddress(loc: Pick<Location, 'pathname' | 'search' | 'hash'>): string | null {
  const [, prefix, rest] = loc.pathname.match(/^(\/[a-z]{2})(\/.*)?$/) ?? [];
  const localised = prefix !== undefined && (PUBLIC_LOCALES as readonly string[]).includes(prefix.slice(1));
  const target = movedRoute(localised ? rest ?? '/' : loc.pathname);
  if (target === null) return null;
  const slash = loc.pathname.endsWith('/') ? '/' : '';
  return `${localised ? prefix : ''}${target}${slash}${loc.search}${loc.hash}`;
}

export function restoreMovedRoute(): boolean {
  const next = movedAddress(location);
  if (next === null) return false;
  history.replaceState(history.state, '', next);
  return true;
}
