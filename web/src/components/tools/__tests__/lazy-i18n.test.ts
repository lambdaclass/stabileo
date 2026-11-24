import { describe, expect, it } from 'vitest';
import { toolTranslations as dictionaries } from '../translations';
import { scalarViewerTranslations } from '../../viewport/scalar-viewer-i18n';
import { PUBLIC_KEY_PREFIXES } from '../../../lib/i18n/public-prefixes';
import { publicI18n, setPublicLocale, registerFeatureDictionaries, tPublic } from '../../../lib/i18n/store.svelte';
import { TOOL_IDS } from '../calculators';
import { PUBLIC_LOCALES } from '../../../lib/i18n/offered';

describe('Tools route translations', () => {
  it('keeps calculator and viewer strings out of the landing dictionary', () => {
    for (const key of [...Object.keys(dictionaries.en), ...Object.keys(scalarViewerTranslations.en)]) {
      expect(PUBLIC_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))).toBe(false);
    }
  });
  it('translates every calculator and viewer key in every offered locale, with matching placeholders', () => {
    for (const translations of [dictionaries, scalarViewerTranslations]) {
      const keys = Object.keys(translations.en).sort();
      for (const locale of PUBLIC_LOCALES.filter(locale => locale !== 'en')) {
        expect(Object.keys(translations[locale]).sort()).toEqual(keys);
        for (const key of keys) expect(translations[locale][key].match(/\{\w+\}/g)?.sort() ?? []).toEqual(translations.en[key].match(/\{\w+\}/g)?.sort() ?? []);
      }
    }
    for (const key of ['tools.firstVersion', 'tools.calculate']) expect(dictionaries.en[key]).toBeUndefined();
    for (const locale of PUBLIC_LOCALES) expect(dictionaries[locale]['tools.lead']).not.toMatch(/^(First version|Primera versión|Primeira versão|Erste Version|Première version|İlk sürüm|Első verzió)/);
  });
  it('registers the calculator and shared viewer strings for every public locale', () => {
    const before = publicI18n.locale;
    registerFeatureDictionaries(dictionaries);
    try {
      for (const locale of PUBLIC_LOCALES) {
        setPublicLocale(locale);
        const keys = [...TOOL_IDS.map((id) => `tools.${id}`), ...Object.keys(scalarViewerTranslations.en)];
        expect(keys.length).toBeGreaterThan(TOOL_IDS.length);
        for (const key of keys) {
          const translation = dictionaries[locale][key] ?? scalarViewerTranslations[locale][key];
          expect(translation).toBeTruthy();
          expect(tPublic(key)).toBe(translation);
        }
      }
    } finally { setPublicLocale(before); }
  });
});
