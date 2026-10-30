/** Only publish research translations that exist. Other public sections have their own policy. */
export function supportsResearchRoute(path: string, locale: string): boolean {
  return !(path === '/research' || path.startsWith('/research/')) || ['en', 'es', 'pt'].includes(locale);
}
