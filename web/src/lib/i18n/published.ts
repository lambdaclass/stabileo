import { BASE_LOCALES } from '../blog/base-locales';
import { PUBLIC_POLICY_AVAILABLE, publicFeatureEnabled, publicFeatures, type PublicFeatures } from '../features';
import { publicFeatureEnabledWithFlags } from '../public-feature-policy';
import { PUBLIC_LOCALES, type Locale } from './offered';
import { buildPublicLocales } from './offered-research';
import { isResearchRoute, researchLocales } from './research-routes';
import { isGameRoute } from '../game-routes';

import type { PublicationGroup } from '../../../scripts/blog-translations';

declare const __BLOG_TRANSLATIONS__: PublicationGroup[];

function translationsFor(page: string): readonly string[] {
  return __BLOG_TRANSLATIONS__.find(group => group.pages.includes(page))?.locales ?? [];
}

/** PAPER_LOCALES, repeated so /paper and the research pages do not share it as a chunk every route preloads; a test keeps them equal. */
export const PAPER_PUBLISHED: readonly Locale[] = ['en', 'es', 'pt'];

/** The languages a post or standing page is written in without a translation file. */
export { BASE_LOCALES } from '../blog/base-locales';

/** The languages a public page is published in: it is prerendered, listed and linked in these and no others. */
export function publishedLocales(path: string, flags: PublicFeatures = PUBLIC_POLICY_AVAILABLE ? publicFeatures() : { research: false, tools: false, diagramGame: false, accounts: false }): readonly Locale[] {
  const locales = import.meta.env?.MODE !== undefined ? PUBLIC_LOCALES : buildPublicLocales(flags.research);
  const route = path.split('#')[0].replace(/\/+$/, '') || '/';
  if (!(PUBLIC_POLICY_AVAILABLE ? publicFeatureEnabled(route, flags) : publicFeatureEnabledWithFlags(route, flags))) return [];
  if (isResearchRoute(route)) return locales.filter((l) => researchLocales(route, flags).includes(l));
  if (route === '/paper') return locales.filter((l) => PAPER_PUBLISHED.includes(l));
  if (route === '/' || route === '/blog' || route === '/examples' || route.startsWith('/examples/') || route === '/tools' || route.startsWith('/tools/') || isGameRoute(route) || route === '/diagram-game') return locales;
  const id = route.startsWith('/blog/') ? route.slice('/blog/'.length) : `page-${route.slice(1)}`;
  const translated = translationsFor(id);
  return locales.filter(l => BASE_LOCALES.some(base => base === l) || translated.includes(l));
}

/** The language a link to `path` opens in for a reader of `locale`: theirs when the page is published in it, else English. */
export function publishedLocale(path: string, locale: Locale): Locale {
  return publishedLocales(path).includes(locale) ? locale : 'en';
}
