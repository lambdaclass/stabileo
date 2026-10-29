/**
 * Which kind of page an address is: the application, the blog (and the standing pages), or the
 * landing. main.ts reads it to mount the application directly on an app route, and Root.svelte to
 * render the public pages without it, so both decide the same way.
 */
import { parsePublicPath, publicHref } from './i18n/public-routes';
import { findStandingPage } from './blog/pages';

/**
 * The fragments `utils/url-sharing.ts` restores a model from (`CODE_HASH` is '#code='; not
 * imported, so the public pages do not load the compression code it brings).
 */
const SHARED_MODEL = /^#(data=|embed=|code=)/;

export type RouteKind = 'app' | 'blog' | 'research' | 'landing';

/** `/app` and everything under it: the application's own addresses. */
export function isAppPath(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/');
}

/** `/research` and its papers: Stabileo Research, rendered without the application. */
export function isResearchPath(path: string): boolean {
  return path === '/research' || path.startsWith('/research/');
}

/** `/demo`: the application, on its demo model. */
export function isDemoPath(pathname: string): boolean {
  return pathname === '/demo' || pathname === '/demo/';
}

export function routeKind(loc: Pick<Location, 'pathname' | 'search' | 'hash'> = location): { kind: RouteKind; path: string } {
  const { path } = parsePublicPath(loc.pathname);
  const params = new URLSearchParams(loc.search);
  const p = loc.pathname;
  if (params.has('embed') || isAppPath(p) || isDemoPath(p)) return { kind: 'app', path };
  // A shared model (`/#data=…`, `#embed=…`, `#code=…`) is the application's to restore
  // (`loadFromURLHash`): it used to be mounted behind the landing and read the fragment.
  if (SHARED_MODEL.test(loc.hash)) return { kind: 'app', path };
  if (path === '/blog' || path.startsWith('/blog/') || findStandingPage(path)) return { kind: 'blog', path };
  if (isResearchPath(path)) return { kind: 'research', path };
  return { kind: 'landing', path };
}

/**
 * A path 404.html handed over (`/?route=/es/blog/x`), restored before anything reads the route.
 *
 * Restored through the URL builder, not verbatim. 404.html hands the path over exactly as it was
 * typed or shared, and putting that straight back in the address bar reinstates whatever shape it
 * had, including the unslashed form the site no longer publishes: a reader arriving on an old link
 * would then be looking at an address that disagrees with the page's own canonical. 404.html keeps
 * the fragment out of `route` (a shared model's `#data=` is too long for the host's request line),
 * so it is still on this address and goes back after the path.
 */
export function restoreRedirectedRoute(): void {
  const redirectedRoute = new URLSearchParams(location.search).get('route');
  if (!redirectedRoute) return;
  const { locale, path } = parsePublicPath(redirectedRoute.split('?')[0]);
  const normalised = locale ? publicHref(path, locale) : redirectedRoute;
  history.replaceState(null, '', normalised + (redirectedRoute.includes('#') ? '' : location.hash));
}
