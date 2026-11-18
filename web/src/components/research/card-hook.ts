import { publicI18n } from '../../lib/i18n/store.svelte';
import { archStrings } from './biggins2026/strings';
import { riserHook } from './gayNeto2014/card';
import { shapeCard } from './feher2026/card';
import { archCard } from './heyman1966/card';
import { snapCard } from './vella2024/card';
import { topoptStrings } from './andreassen2011/i18n';
import { fs } from './fairclough2026/i18n';
import { strings as newmarkStrings } from './newmark1959/i18n';
import { cqcStrings } from './cqc1981/strings';
import { ps } from './plastic-collapse/i18n';
import { navierStrings } from './navier1823/strings';
import { strings as leeStrings } from './lee1968/i18n';
import { archStrings as dadeppoStrings } from './dadeppo1975/i18n';
import { strings as mattiassonStrings } from './mattiasson1981/i18n';
import { card as macnealCard } from './macneal1985/card';
import { articleStrings as riksStrings } from './riksCrisfield/article';
import { researchLocale, rs } from './i18n';
import { englishOnlyCard } from './english-only-cards';
import type { Experiment } from './experiments';

const pick = <T>(dictionary: Record<string, T>, locale: string): T => dictionary[locale] ?? dictionary.en;

/** The lead a gallery card shows for an experiment, in the reader's current language. */
export function cardHook(e: Experiment): string {
  const locale = publicI18n.locale;
  const translated = englishOnlyCard(e.paperId, locale);
  if (translated) return translated.hook;
  const s = rs();
  switch (e.paperId) {
    case 'dadeppo-arch-1975': return dadeppoStrings(locale).hook;
    case 'lee-frame-1968': return pick(leeStrings, locale).lead;
    case 'navier-plate': return navierStrings(researchLocale()).lead;
    case 'horne-1979': return ps().lead;
    case 'cqc-1981': return cqcStrings().lead;
    case 'newmark-1959': return newmarkStrings().lead;
    case 'fairclough-2026': return fs().lead;
    case 'zmyslony-2026': return archStrings().lead;
    case 'andreassen-2011': return topoptStrings(locale).hook;
    case 'pastrana-2026': return s.formLead;
    case 'grossman-2026': return s.springsHook;
    case 'shauer-2025': return s.shauerHook;
    case 'ferrari-2025': return s.ferrariLead;
    case 'mattiasson-elastica': return pick(mattiassonStrings, locale).hook;
    case 'macneal-harder-1985': return pick(macnealCard, locale).hook;
    case 'heyman-1966': return pick(archCard, locale).hook;
    case 'wang-2024': return pick(snapCard, locale).hook;
    case 'feher-sipos-varkonyi-2026': return pick(shapeCard, locale).hook;
    case 'gay-neto-2014': return pick(riserHook, locale);
    case 'riks-1979': return locale === 'en' ? e.hook : riksStrings(locale).lead;
    default: return e.hook;
  }
}
