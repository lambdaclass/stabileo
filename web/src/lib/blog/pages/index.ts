/**
 * Standing pages: kept current rather than dated, rendered by the blog's component under
 * /<locale><path>/, prerendered and listed in the sitemap like the posts.
 */
import { cirsocPage, type StandingPage } from './cirsoc';
import { reliabilityPage } from './reliability';
import { STANDING_ALIASES } from './aliases';
import { sap2000Page } from './alternative-sap2000';
import { etabsPage } from './alternative-etabs';
import { addTranslations } from '../types';

export type { StandingPage };

export const STANDING_PAGES: StandingPage[] = [cirsocPage, reliabilityPage, sap2000Page, etabsPage];

addTranslations(STANDING_PAGES, (p) => `page-${p.path.slice(1)}`, import.meta.glob(['../translations/*/page-*.ts', '!../translations/*/page-sap2000-alternative.ts'], { eager: true, import: 'default' }));

export function findStandingPage(path: string): StandingPage | undefined {
  const p = path.replace(/\/$/, '');
  return STANDING_PAGES.find((page) => page.path === (STANDING_ALIASES[p] ?? p));
}
