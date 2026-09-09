import { setPublicLocale, type PublicLocale } from '../../lib/i18n/store.svelte';
import { parsePublicPath } from '../../lib/i18n/public-routes';

export const REPO_URL = 'https://github.com/lambdaclass/stabileo';
export const DOCS_HUB_URL = `${REPO_URL}/blob/main/docs/README.md`;
export const QUICK_START_URL = `${REPO_URL}/blob/main/docs/QUICKSTART.md`;
export const AI_WORKFLOW_URL = `${REPO_URL}/blob/main/docs/AI_MODELING_WORKFLOW.md`;
export const SOLVER_REF_URL = `${REPO_URL}/blob/main/docs/SOLVER_REFERENCE.md`;

export function enterApp() {
  window.dispatchEvent(new CustomEvent('stabileo-enter-app'));
}

/**
 * Move between the public pages — the landing and the blog — without
 * reloading the document.
 *
 * A plain `<a href="/blog">` would work in production and would be wrong
 * anyway: the site is static, so the browser would fetch /blog, get the 404
 * page, and bounce through `/?route=/blog` with a visible flash. App.svelte
 * listens for this and swaps the page in place.
 */
export function goPublic(path: string) {
  window.dispatchEvent(new CustomEvent('stabileo-navigate', { detail: path }));
}

/**
 * Change language on a public page: set it, then move to the same route under
 * the new prefix.
 *
 * Setting the locale alone would leave a Portuguese page at `/es/blog/x`. The
 * address is the part that gets shared and indexed, so it is the part that has
 * to be right — the rendering follows it, never the other way round.
 */
export function switchPublicLocale(locale: PublicLocale) {
  setPublicLocale(locale);
  goPublic(parsePublicPath(window.location.pathname).path);
}

/**
 * Scroll to a section.
 *
 * One smooth scroll, which is all this should ever have needed.
 *
 * An earlier version re-asserted the target every 220 ms because clicking
 * "Estado" landed 2,418 px short. That fixed the symptom and felt like a
 * spring: each re-assertion restarted the animation, so the page arrived in
 * visible steps. The cause was elsewhere — the screenshots reserved no height
 * until they decoded, so the target moved while the scroll was travelling.
 * Now they declare their intrinsic size (see Shot.svelte), the page stops
 * growing underneath the scroll, and one call lands.
 */
export function scrollToId(id: string, root?: HTMLElement | null) {
  const el = (root ?? document).querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const GITHUB_API = `https://api.github.com/repos/lambdaclass/stabileo`;
const CACHE_KEY = 'stabileo-gh-stars';
const CACHE_TTL = 6 * 60 * 60 * 1000;

/** Last value we successfully read, fresh or not. `null` when nothing is cached. */
function cachedStars(): { stars: number; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { stars, ts } = JSON.parse(raw);
    return typeof stars === 'number' && typeof ts === 'number' ? { stars, ts } : null;
  } catch {
    return null;
  }
}

/**
 * Star count, with a stale cache preferred over no answer at all.
 *
 * The unauthenticated GitHub API allows 60 requests an hour per IP, and it
 * answers 403 rather than 0 once that is spent. This used to return `null` on
 * any non-OK response, so the moment the cache went stale AND the limit was
 * spent the page rendered an em dash where a number had been — which reads as
 * a broken counter, not as a rate limit.
 *
 * A star count changes slowly, so a value from yesterday is honest and useful
 * where "—" is neither. The fresh path is unchanged; only the failure path is,
 * and the em dash now means "never fetched" rather than "not fetched today".
 */
export async function fetchGithubStars(): Promise<number | null> {
  const cached = cachedStars();
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.stars;

  try {
    const res = await fetch(GITHUB_API);
    if (!res.ok) return cached?.stars ?? null;
    const data = await res.json();
    const stars = typeof data?.stargazers_count === 'number' ? data.stargazers_count : null;
    if (stars == null) return cached?.stars ?? null;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ stars, ts: Date.now() })); } catch {}
    return stars;
  } catch {
    return cached?.stars ?? null;
  }
}
