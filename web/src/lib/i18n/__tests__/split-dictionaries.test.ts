import { expect, it } from 'vitest';
import * as publicEntries from 'virtual:public-i18n';
import * as appEntries from 'virtual:app-i18n';
import en from '../locales/en';
import es from '../locales/es';
import pt from '../locales/pt';

it.each(['en', 'es', 'pt'] as const)('%s dictionary split preserves every translation exactly once', locale => {
  expect(Object.keys(appEntries[locale]).filter(key => key in publicEntries[locale])).toEqual([]);
  expect({ ...publicEntries[locale], ...appEntries[locale] }).toEqual({ en, es, pt }[locale]);
});
