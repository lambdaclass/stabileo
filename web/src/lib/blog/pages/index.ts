/**
 * Standing pages: kept current rather than dated, rendered by the blog's component under
 * /<locale><path>/, prerendered and listed in the sitemap like the posts.
 */
import { cirsocPage, type StandingPage } from './cirsoc';
import { reliabilityPage } from './reliability';
import { sap2000AlternativePage } from './sap2000-alternative';
import { termsPage } from './terms';
import { privacyPage } from './privacy';
import { usageDataPage } from './usage-data';

export type { StandingPage };

export const STANDING_PAGES: StandingPage[] = [cirsocPage, reliabilityPage, sap2000AlternativePage, termsPage, privacyPage, usageDataPage];

export function findStandingPage(path: string): StandingPage | undefined {
  const p = path.replace(/\/$/, '');
  return STANDING_PAGES.find((page) => page.path === p);
}
