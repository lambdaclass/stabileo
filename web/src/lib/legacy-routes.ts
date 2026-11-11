import { PUBLIC_LOCALES } from './i18n/offered';

/** Routes that moved, old prefix to new: `/examples/<id>` became the tool with the same id. */
export const MOVED_ROUTES: readonly (readonly [string, string])[] = [['/examples', '/tools']];

/** Every address the site published before it moved, which keeps a page that sends its reader on. */
export const MOVED_PAGES: readonly string[] = ['/examples', ...['beam-frame', 'slab-on-columns', 'earthquake-frame', 'rc-column', 'outrigger', 'tower'].map(id => `/examples/${id}`)];

export function movedRoute(path: string): string | null {
  const route = path.replace(/\/+$/, '') || '/';
  for (const [from, to] of MOVED_ROUTES) {
    if (route === from) return to;
    if (route.startsWith(`${from}/`)) return `${to}${route.slice(from.length)}`;
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
