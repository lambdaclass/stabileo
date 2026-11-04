export const STANDING_PAGE_PATHS: readonly string[] = ['/cirsoc', '/reliability', '/sap2000-alternative', '/changelog'];

export function isStandingPagePath(path: string): boolean {
  return STANDING_PAGE_PATHS.includes(path.replace(/\/$/, ''));
}
