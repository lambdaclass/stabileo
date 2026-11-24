import { expect, it } from 'vitest';
import * as publicEntries from 'virtual:public-i18n';
import * as appEntries from 'virtual:app-i18n';
import { de as lazyDe } from 'virtual:app-i18n/de';
import { fr as lazyFr } from 'virtual:app-i18n/fr';
import { tr as lazyTr } from 'virtual:app-i18n/tr';
import { hu as lazyHu } from 'virtual:app-i18n/hu';
import { zh as lazyZh } from 'virtual:app-i18n/zh';
import en from '../locales/en';
import es from '../locales/es';
import pt from '../locales/pt';
import de from '../locales/de';
import fr from '../locales/fr';
import tr from '../locales/tr';
import hu from '../locales/hu';
import zh from '../locales/zh';
import browserDe from '../locales/browser/de';
import fullDe from '../locales/full/de';
import browserFr from '../locales/browser/fr';
import fullFr from '../locales/full/fr';
import browserTr from '../locales/browser/tr';
import fullTr from '../locales/full/tr';
import browserHu from '../locales/browser/hu';
import fullHu from '../locales/full/hu';
import browserZh from '../locales/browser/zh';
import fullZh from '../locales/full/zh';
import { isComplete } from '../offered';
import type { Translations } from '../types';

const LOCALES = ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'zh'] as const;
const LAZY = ['de', 'fr', 'tr', 'hu', 'zh'] as const;

async function mesherDictionary(locale: typeof LOCALES[number]): Promise<Translations> {
  if (!__PUBLIC_FEATURES__.proPlatesUnified) return {};
  const { default: dictionaries } = await import('virtual:mesher-i18n');
  return dictionaries[locale];
}

it('#2399 retains the diagram-game navigation label in the eager dictionary', () => {
  expect(publicEntries.en['landing.navGame']).toBe(en['landing.navGame']);
});

function expectExactPartition(expected: Translations, ...dictionaries: Translations[]) {
  const entries = dictionaries.flatMap(dictionary => Object.entries(dictionary));
  const combined = Object.fromEntries(entries);
  expect(Object.keys(combined)).toHaveLength(entries.length);
  expect(combined).toEqual(expected);
}

it.each(LOCALES.filter(isComplete))('#2365 %s dictionaries preserve every translation exactly once', async locale => {
  const source = { en, es, pt, de, fr, tr, hu, zh }[locale];
  const mesher = await mesherDictionary(locale);
  if (__PUBLIC_FEATURES__.proPlatesUnified) {
    expect(mesher).toEqual(Object.fromEntries(Object.entries(source).filter(([key]) => key.startsWith('mesher.'))));
  }
  expectExactPartition(source, publicEntries[locale], appEntries[locale], mesher);
});

it.each(LOCALES.filter((l) => !isComplete(l)))('%s, not offered, ships no public or app entries', locale => {
  expect(publicEntries[locale]).toEqual({});
  expect(appEntries[locale]).toEqual({});
});

it.each(LAZY.filter(isComplete))('%s lazy app dictionary shares public strings without dropping app translations', locale => {
  expect({ de: lazyDe, fr: lazyFr, tr: lazyTr, hu: lazyHu, zh: lazyZh }[locale]).toEqual(appEntries[locale]);
});

it.each(([
  ['de', browserDe, fullDe],
  ['fr', browserFr, fullFr],
  ['tr', browserTr, fullTr],
  ['hu', browserHu, fullHu],
  ['zh', browserZh, fullZh],
] as const).filter(([locale]) => isComplete(locale)))('#2365 %s browser dictionaries match the Node-compatible full dictionary', async (locale, browser, full) => {
  expectExactPartition(full, browser, await mesherDictionary(locale));
});
