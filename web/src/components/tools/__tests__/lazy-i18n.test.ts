import { describe, expect, it } from 'vitest';
import { toolTranslations as dictionaries } from '../translations';
import { PUBLIC_KEY_PREFIXES } from '../../../lib/i18n/public-prefixes';
import { publicI18n, setPublicLocale, registerFeatureDictionaries, tPublic } from '../../../lib/i18n/store.svelte';
import { TOOL_IDS } from '../calculators';

describe('Tools route translations', () => {
  it('keeps calculator and viewer strings out of the landing dictionary', () => {
    for (const key of Object.keys(dictionaries.en)) {
      expect(PUBLIC_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))).toBe(false);
    }
  });
  it('registers the calculator and shared viewer strings for all six locales', () => {
    const before = publicI18n.locale;
    registerFeatureDictionaries(dictionaries);
    try {
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
        setPublicLocale(locale);
        const keys = [...TOOL_IDS.map((id) => `tools.${id}`), ...Object.keys(dictionaries.en).filter((key) => key.startsWith('scalarViewer.'))];
        expect(keys.length).toBeGreaterThan(TOOL_IDS.length);
        for (const key of keys) {
          expect(dictionaries[locale][key]).toBeTruthy();
          expect(tPublic(key)).toBe(dictionaries[locale][key]);
        }
      }
    } finally { setPublicLocale(before); }
  });
});
