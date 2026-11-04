import { describe, expect, it } from 'vitest';
import { registerTranslations as dictionaries } from '../translations';
import { PUBLIC_KEY_PREFIXES } from '../../../lib/i18n/public-prefixes';
import { publicI18n, setPublicLocale, registerFeatureDictionaries, tPublic } from '../../../lib/i18n/store.svelte';
import en from '../../../lib/i18n/locales/en';

describe('Register route translations', () => {
  it('keeps the sign-up page strings out of the landing and the app dictionaries', () => {
    for (const key of Object.keys(dictionaries.en)) {
      expect(PUBLIC_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))).toBe(false);
      expect(en[key]).toBeUndefined();
    }
  });
  it('translates every key in all six locales, with matching placeholders', () => {
    const keys = Object.keys(dictionaries.en).sort();
    for (const locale of ['es', 'pt', 'de', 'fr', 'tr']) {
      expect(Object.keys(dictionaries[locale]).sort()).toEqual(keys);
      for (const key of keys) expect(dictionaries[locale][key].match(/\{\w+\}/g)?.sort() ?? []).toEqual(dictionaries.en[key].match(/\{\w+\}/g)?.sort() ?? []);
    }
  });
  it('registers the strings for all six locales', () => {
    const before = publicI18n.locale;
    registerFeatureDictionaries(dictionaries);
    try {
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
        setPublicLocale(locale);
        for (const key of Object.keys(dictionaries.en)) expect(tPublic(key)).toBe(dictionaries[locale][key]);
      }
    } finally { setPublicLocale(before); }
  });
});
