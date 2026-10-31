import { PUBLIC_LOCALES, type Locale } from '../../lib/i18n/offered';
import { STRINGS } from './i18n';
import { galleryStrings } from './gallery-i18n';
import { text as andreassen } from './andreassen2011/i18n';
import { translations as biggins } from './biggins2026/strings';
import { translations as cqc } from './cqc1981/strings';
import { strings as dadeppo } from './dadeppo1975/i18n';
import { translations as fairclough } from './fairclough2026/translations';
import { springTranslations } from './grossman2026/translations';
import { strings as lee } from './lee1968/i18n';
import { strings as macneal } from './macneal1985/i18n';
import { strings as mattiasson } from './mattiasson1981/i18n';
import { strings as navier } from './navier1823/strings';
import { translations as newmark } from './newmark1959/i18n';
import { strings as plastic } from './plastic-collapse/i18n';
import { translations as riks } from './riksCrisfield/article';
import { shauerLocales } from './shauer2025/locales';
import { strings as shell } from './shell1985/i18n';

/** Each research route's own string dictionary: the route is published in exactly the locales it defines. */
const DICTIONARIES: Record<string, object> = {
  '/research': galleryStrings,
  '/research/optimization/andreassen-2011': andreassen,
  '/research/mechanics/biggins-2026': biggins,
  '/research/benchmarks/cqc-1981': cqc,
  '/research/benchmarks/dadeppo-arch-1975': dadeppo,
  '/research/optimisation/fairclough-2026': fairclough,
  '/research/stability/ferrari-sigmund-2025': STRINGS,
  '/research/metamaterials/grossman-2026': { ...STRINGS, ...springTranslations },
  '/research/benchmarks/lee-frame-1968': lee,
  '/research/benchmarks/macneal-harder-1985': macneal,
  '/research/benchmarks/mattiasson-elastica': mattiasson,
  '/research/benchmarks/navier-plate': navier,
  '/research/benchmarks/newmark-1959': newmark,
  '/research/form-finding/pastrana-2026': STRINGS,
  '/research/benchmarks/plastic-collapse': plastic,
  '/research/benchmarks/riks-crisfield': riks,
  '/research/fracture/shauer-2025': { ...STRINGS, ...shauerLocales },
  '/research/benchmarks/shell-obstacle-course': shell,
};

const isResearch = (path: string) => path === '/research' || path.startsWith('/research/');

/** The public locales a route is published in. Research routes: the locales their dictionary defines (English when unknown); other routes: all. */
export function routeLocales(path: string): Locale[] {
  if (!isResearch(path)) return [...PUBLIC_LOCALES];
  const dictionary = DICTIONARIES[path.replace(/\/$/, '')];
  return dictionary ? PUBLIC_LOCALES.filter((l) => l in dictionary) : PUBLIC_LOCALES.filter((l) => l === 'en');
}

export const supportsResearchRoute = (path: string, locale: string): boolean => (routeLocales(path) as string[]).includes(locale);

export const researchRoutes = (): string[] => Object.keys(DICTIONARIES);
