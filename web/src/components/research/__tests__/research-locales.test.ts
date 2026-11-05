import { expect, it } from 'vitest';
import { EXPERIMENTS } from '../experiments';
import { RESEARCH_GALLERY, researchLocales, supportsResearchRoute } from '../locales';
import { STRINGS } from '../i18n';
import { galleryStrings } from '../gallery-i18n';
import { text as andreassen } from '../andreassen2011/i18n';
import { translations as biggins } from '../biggins2026/strings';
import { translations as riser } from '../gayNeto2014/strings';
import { translations as cqc } from '../cqc1981/strings';
import { strings as dadeppo } from '../dadeppo1975/i18n';
import { translations as fairclough } from '../fairclough2026/translations';
import { springTranslations } from '../grossman2026/translations';
import { strings as lee } from '../lee1968/i18n';
import { strings as macneal } from '../macneal1985/i18n';
import { strings as mattiasson } from '../mattiasson1981/i18n';
import { strings as navier } from '../navier1823/strings';
import { translations as newmark } from '../newmark1959/i18n';
import { strings as plastic } from '../plastic-collapse/i18n';
import { translations as riks } from '../riksCrisfield/article';
import { shauerLocales } from '../shauer2025/locales';
import { strings as shell } from '../shell1985/i18n';
import { translations as shellArticle } from '../shell1985/article';

const ALL = ['en', 'es', 'pt', 'de', 'fr', 'tr'];
const defined = (...dictionaries: object[]) => ALL.filter((l) => dictionaries.every((d) => l in d));
const either = (base: object, extra: object) => {
  if (ALL.some((l) => l in base && l in extra)) throw new Error('a page dictionary and its extra languages overlap');
  return { ...base, ...extra };
};

/** Every dictionary a page renders its own copy from: the page is written only in the languages all of them define. */
const DICTIONARIES: Record<string, object[]> = {
  [RESEARCH_GALLERY]: [galleryStrings, STRINGS],
  '/research/optimization/andreassen-2011': [andreassen],
  '/research/mechanics/biggins-2026': [biggins],
  '/research/mechanics/gay-neto-2014': [riser],
  '/research/benchmarks/cqc-1981': [cqc],
  '/research/benchmarks/dadeppo-arch-1975': [dadeppo],
  '/research/optimisation/fairclough-2026': [fairclough],
  '/research/stability/ferrari-sigmund-2025': [STRINGS],
  '/research/metamaterials/grossman-2026': [either(STRINGS, springTranslations)],
  '/research/benchmarks/lee-frame-1968': [lee],
  '/research/benchmarks/macneal-harder-1985': [macneal],
  '/research/benchmarks/mattiasson-elastica': [mattiasson],
  '/research/benchmarks/navier-plate': [navier],
  '/research/benchmarks/newmark-1959': [newmark],
  '/research/form-finding/pastrana-2026': [STRINGS],
  '/research/benchmarks/plastic-collapse': [plastic],
  '/research/benchmarks/riks-crisfield': [riks],
  '/research/fracture/shauer-2025': [either(STRINGS, shauerLocales)],
  '/research/benchmarks/shell-obstacle-course': [shell, shellArticle],
};

it('covers the gallery and every paper page', () => {
  expect(Object.keys(DICTIONARIES).sort()).toEqual([RESEARCH_GALLERY, ...EXPERIMENTS.map((e) => e.path)].sort());
});

it.each(Object.entries(DICTIONARIES))('publishes %s exactly in the languages its own dictionaries define', (path, dictionaries) => {
  expect([...researchLocales(path)]).toEqual(defined(...dictionaries));
});

it('publishes a paper without German copy without /de/, and one with it under /de/', () => {
  expect(supportsResearchRoute('/research/stability/ferrari-sigmund-2025', 'de')).toBe(false);
  expect(supportsResearchRoute('/research/benchmarks/navier-plate', 'de')).toBe(true);
  expect(supportsResearchRoute('/research/benchmarks/navier-plate/', 'de')).toBe(true);
  expect(researchLocales('/research/unknown-paper')).toEqual(['en']);
  for (const locale of ALL) expect(supportsResearchRoute('/tools', locale)).toBe(true);
});
