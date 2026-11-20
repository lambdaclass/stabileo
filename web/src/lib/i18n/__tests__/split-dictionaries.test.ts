import { expect, it } from 'vitest';
import * as publicEntries from 'virtual:public-i18n';
import * as appEntries from 'virtual:app-i18n';
import mesherEntries from 'virtual:mesher-i18n';
import { de as lazyDe } from 'virtual:app-i18n/de';
import { fr as lazyFr } from 'virtual:app-i18n/fr';
import { tr as lazyTr } from 'virtual:app-i18n/tr';
import { hu as lazyHu } from 'virtual:app-i18n/hu';
import en from '../locales/en';
import es from '../locales/es';
import pt from '../locales/pt';
import de from '../locales/de';
import fr from '../locales/fr';
import tr from '../locales/tr';
import hu from '../locales/hu';
import browserDe from '../locales/browser/de';
import fullDe from '../locales/full/de';
import browserFr from '../locales/browser/fr';
import fullFr from '../locales/full/fr';
import browserTr from '../locales/browser/tr';
import fullTr from '../locales/full/tr';
import browserHu from '../locales/browser/hu';
import fullHu from '../locales/full/hu';
import { isComplete } from '../offered';
import type { Translations } from '../types';

const LOCALES = ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu'] as const;
const LAZY = ['de', 'fr', 'tr', 'hu'] as const;

function expectExactPartition(expected: Translations, ...dictionaries: Translations[]) {
  const entries = dictionaries.flatMap(dictionary => Object.entries(dictionary));
  const combined = Object.fromEntries(entries);
  expect(Object.keys(combined)).toHaveLength(entries.length);
  expect(combined).toEqual(expected);
}

it.each(LOCALES.filter(isComplete))('#2365 %s dictionaries preserve every translation exactly once', locale => {
  const source = { en, es, pt, de, fr, tr, hu }[locale];
  const mesher = mesherEntries[locale];
  expect(mesher).toEqual(Object.fromEntries(Object.entries(source).filter(([key]) => key.startsWith('mesher.'))));
  expectExactPartition(source, publicEntries[locale], appEntries[locale], mesher);
});

it.each(LOCALES.filter((l) => !isComplete(l)))('%s, not offered, ships no public or app entries', locale => {
  expect(publicEntries[locale]).toEqual({});
  expect(appEntries[locale]).toEqual({});
});

it.each(LAZY.filter(isComplete))('%s lazy app dictionary shares public strings without dropping app translations', locale => {
  expect({ de: lazyDe, fr: lazyFr, tr: lazyTr, hu: lazyHu }[locale]).toEqual(appEntries[locale]);
});

it.each(([
  ['de', browserDe, fullDe],
  ['fr', browserFr, fullFr],
  ['tr', browserTr, fullTr],
  ['hu', browserHu, fullHu],
] as const).filter(([locale]) => isComplete(locale)))('#2365 %s browser dictionaries match the Node-compatible full dictionary', (locale, browser, full) => {
  expectExactPartition(full, browser, mesherEntries[locale]);
});
