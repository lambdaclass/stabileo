/**
 * Where this browser's visit came from, kept in the first-party cookie `stb_visit` for 30 days:
 * the UTM tags and click ids of the address it arrived on, the site it came from and the page it
 * entered on. The last visit that brought any of them wins; a direct visit keeps the one stored.
 * It travels with the sign-up as `source` (`StabileoMarketing.SignupSources`).
 */
const COOKIE = 'stb_visit';
const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'network', 'gclid', 'gbraid', 'wbraid', 'fbclid'] as const;
const MAX_AGE = 30 * 24 * 60 * 60;
const MAX_LENGTH = 200;

export type Visit = Partial<Record<(typeof PARAMS)[number] | 'referrer' | 'landing' | 'first_seen', string>>;

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, '');

export function externalHost(referrer: string, ownHost: string): string | undefined {
  try {
    const host = bareHost(new URL(referrer).hostname);
    const own = bareHost(ownHost);
    if (!host || host === own || host.endsWith(`.${own}`) || own.endsWith(`.${host}`)) return undefined;
    return host;
  } catch {
    return undefined;
  }
}

/** What an arrival says about where it came from; empty for a direct one. */
export function visitFrom(search: string, referrer: string, loc: { hostname: string; pathname: string }, now = new Date()): Visit {
  const params = new URLSearchParams(search);
  const visit: Visit = {};
  for (const key of PARAMS) {
    const value = params.get(key)?.trim();
    if (value) visit[key] = value.slice(0, MAX_LENGTH);
  }
  const host = externalHost(referrer, loc.hostname);
  if (host) visit.referrer = host;
  if (Object.keys(visit).length === 0) return visit;
  visit.landing = loc.pathname.slice(0, MAX_LENGTH);
  visit.first_seen = now.toISOString();
  return visit;
}

export function readVisit(doc: Pick<Document, 'cookie'> = document): Visit {
  const raw = doc.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (typeof parsed !== 'object' || parsed === null) return {};
    const visit: Visit = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value) (visit as Record<string, string>)[key] = value.slice(0, MAX_LENGTH);
    }
    return visit;
  } catch {
    return {};
  }
}

/** Keeps this arrival when it says anything; a direct one leaves the stored visit alone. */
export function captureVisit(win: Pick<Window, 'location'> & { document: Pick<Document, 'cookie' | 'referrer'> } = window): Visit {
  const visit = visitFrom(win.location.search, win.document.referrer, win.location);
  if (Object.keys(visit).length === 0) return readVisit(win.document);
  const secure = win.location.protocol === 'https:' ? '; Secure' : '';
  try {
    win.document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(visit))}; path=/; max-age=${MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    /* cookies blocked: the visit is not kept */
  }
  return visit;
}

/** What the sign-up sends as `source`: the visit, what asked for the account, and the page. */
export function signupSource(trigger: string, doc: Pick<Document, 'cookie'> = document, path = location.pathname): Record<string, string> {
  return { ...readVisit(doc), trigger: trigger.slice(0, 64), page: path.slice(0, 256) };
}
