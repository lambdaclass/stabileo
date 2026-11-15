export const STANDING_PAGE_PATHS: readonly string[] = ['/cirsoc', '/reliability', '/sap2000-alternative', '/etabs-alternative', '/changelog', ...(import.meta.env?.VITE_ACCOUNTS !== '0' ? ['/terms', '/privacy', '/usage-data'] : [])];

export function isStandingPagePath(path: string): boolean {
  return STANDING_PAGE_PATHS.includes(path.replace(/\/$/, ''));
}
