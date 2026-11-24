import { buildFeatures } from '../../../../config/public-features.mjs';

const accountsBuilt = typeof __PUBLIC_FEATURES_COMPILED__ === 'undefined' ? buildFeatures().accounts : __PUBLIC_FEATURES__.accounts;

export const STANDING_PAGE_PATHS: readonly string[] = ['/cirsoc', '/reliability', '/sap2000-alternative', '/etabs-alternative', '/changelog', ...(accountsBuilt ? ['/terms', '/privacy', '/usage-data'] : [])];

export function isStandingPagePath(path: string): boolean {
  return STANDING_PAGE_PATHS.includes(path.replace(/\/$/, ''));
}
