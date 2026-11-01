import { PUBLIC_LOCALES, type Locale } from './offered';
import { PAPER_LOCALES } from '../../components/paper/locales';
import { isResearchRoute, researchLocales } from '../../components/research/published';

declare const __BLOG_TRANSLATIONS__: readonly string[];

let blogTranslations: ReadonlySet<string> | undefined;

function translated(entry: string): boolean {
  if (typeof __BLOG_TRANSLATIONS__ === 'undefined') throw new Error('__BLOG_TRANSLATIONS__ is not defined: every language but en, es and pt would look unwritten');
  blogTranslations ??= new Set(__BLOG_TRANSLATIONS__);
  return blogTranslations.has(entry);
}

/** The languages a post or standing page is written in without a translation file. */
export const BASE_LOCALES: readonly Locale[] = ['en', 'es', 'pt'];

/** The languages a public page is published in: it is prerendered, listed and linked in these and no others. */
export function publishedLocales(path: string): readonly Locale[] {
  const route = path.split('#')[0].replace(/\/+$/, '') || '/';
  if (isResearchRoute(route)) return PUBLIC_LOCALES.filter((l) => researchLocales(route).includes(l));
  if (route === '/paper') return PUBLIC_LOCALES.filter((l) => PAPER_LOCALES.includes(l));
  if (route === '/' || route === '/blog' || route === '/tools' || route.startsWith('/tools/')) return PUBLIC_LOCALES;
  const id = route.startsWith('/blog/') ? route.slice('/blog/'.length) : `page-${route.slice(1)}`;
  return PUBLIC_LOCALES.filter((l) => BASE_LOCALES.includes(l) || translated(`${l}/${id}`));
}

/** The language a link to `path` opens in for a reader of `locale`: theirs when the page is published in it, else English. */
export function publishedLocale(path: string, locale: Locale): Locale {
  return publishedLocales(path).includes(locale) ? locale : 'en';
}
