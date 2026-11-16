import { publicLocaleEnabled } from './features';

export function unpublishedResearchAddress(loc: Pick<Location, 'pathname' | 'search' | 'hash'>): string | null {
  const match = loc.pathname.match(/^\/([a-z]{2})(\/research(?:\/.*)?)$/);
  if (!match || publicLocaleEnabled(match[2], match[1])) return null;
  return `/en${match[2]}${loc.search}${loc.hash}`;
}

export function restoreUnpublishedResearchRoute(): void {
  const next = unpublishedResearchAddress(location);
  if (next) history.replaceState(history.state, '', next);
}
