import { expect, it } from 'vitest';
import * as publicEntries from 'virtual:public-i18n';
import * as appEntries from 'virtual:app-i18n';
import { de as lazyDe } from 'virtual:app-i18n/de';
import { fr as lazyFr } from 'virtual:app-i18n/fr';
import { tr as lazyTr } from 'virtual:app-i18n/tr';
import en from '../locales/en';
import es from '../locales/es';
import pt from '../locales/pt';
import de from '../locales/de';
import fr from '../locales/fr';
import tr from '../locales/tr';
import browserDe from '../locales/browser/de';
import fullDe from '../locales/full/de';
import browserFr from '../locales/browser/fr';
import fullFr from '../locales/full/fr';
import browserTr from '../locales/browser/tr';
import fullTr from '../locales/full/tr';

it.each(['en', 'es', 'pt', 'de', 'fr', 'tr'] as const)('%s dictionary split preserves every translation exactly once', locale => {
  expect(Object.keys(appEntries[locale]).filter(key => key in publicEntries[locale])).toEqual([]);
  expect({ ...publicEntries[locale], ...appEntries[locale] }).toEqual({ en, es, pt, de, fr, tr }[locale]);
});

it.each(['de', 'fr', 'tr'] as const)('%s lazy app dictionary shares public strings without dropping app translations', locale => {
  expect({ de: lazyDe, fr: lazyFr, tr: lazyTr }[locale]).toEqual(appEntries[locale]);
});

it.each([
  ['de', browserDe, fullDe],
  ['fr', browserFr, fullFr],
  ['tr', browserTr, fullTr],
])('%s browser dictionary matches the Node-compatible full dictionary', (_locale, browser, full) => {
  expect(browser).toEqual(full);
});
