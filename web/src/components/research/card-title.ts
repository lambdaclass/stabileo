import { shellCardTitle } from './shell1985/card';
import { archStrings } from './biggins2026/strings';
import { riserTitle } from './gayNeto2014/card';
import { shapeTitle } from './feher2026/strings';
import { topoptStrings } from './andreassen2011/i18n';
import { fs } from './fairclough2026/i18n';
import { strings as newmarkStrings } from './newmark1959/i18n';
import { cqcStrings } from './cqc1981/strings';
import { ps } from './plastic-collapse/i18n';
import { navierStrings } from './navier1823/strings';
import { strings as leeStrings } from './lee1968/i18n';
import { strings as dadeppoStrings } from './dadeppo1975/i18n';
import { strings as mattiassonStrings } from './mattiasson1981/i18n';
import { card as macnealCard } from './macneal1985/card';
import { articleStrings as riksStrings } from './riksCrisfield/article';
import { researchLocale, rs } from './i18n';
import { englishOnlyCard } from './english-only-cards';
import type { Experiment } from './experiments';

/** The title a gallery card shows for an experiment, in the reader's current language. */
export function cardTitle(e: Experiment): string {
  const locale = researchLocale();
  const s = rs();
  const translated = englishOnlyCard(e.paperId, locale);
  if (translated) return translated.title;
  switch (e.paperId) {
    case 'dadeppo-arch-1975': return (dadeppoStrings[locale as keyof typeof dadeppoStrings] ?? dadeppoStrings.en).title;
    case 'lee-frame-1968': return (leeStrings[locale as keyof typeof leeStrings] ?? leeStrings.en).title;
    case 'navier-plate': return navierStrings(locale).title;
    case 'horne-1979': return ps().title;
    case 'cqc-1981': return cqcStrings().title;
    case 'newmark-1959': return newmarkStrings().title;
    case 'fairclough-2026': return fs().title;
    case 'zmyslony-2026': return archStrings().title;
    case 'gay-neto-2014': return riserTitle[locale as keyof typeof riserTitle] ?? riserTitle.en;
    case 'feher-sipos-varkonyi-2026': return shapeTitle[locale as keyof typeof shapeTitle] ?? shapeTitle.en;
    case 'andreassen-2011': return topoptStrings(locale).title;
    case 'pastrana-2026': return s.formTitle;
    case 'grossman-2026': return s.springsTitle;
    case 'mattiasson-elastica': return (mattiassonStrings[locale as keyof typeof mattiassonStrings] ?? mattiassonStrings.en).title;
    case 'macneal-harder-1985': return (macnealCard[locale as keyof typeof macnealCard] ?? macnealCard.en).title;
    case 'shell-obstacle-course': return shellCardTitle;
    case 'riks-1979': return riksStrings(locale).arcLengthSnapThroughRiksAndCrisfield;
    case 'ferrari-2025': return s.ferrariTitle;
    case 'shauer-2025': return s.shauerTitle;
    default: return e.name;
  }
}
