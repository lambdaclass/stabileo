import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aiTranslations } from '../ai-translations';
import { PUBLIC_LOCALES } from '../../../lib/i18n/offered';
import { publicI18n, registerFeatureDictionaries, setPublicLocale, tPublic } from '../../../lib/i18n/store.svelte';

const source = readFileSync(join(import.meta.dirname, '../LandingAi.svelte'), 'utf8');
const english = Object.keys(aiTranslations.en).sort();

describe('the landing AI section copy', () => {
  it('holds every key the section reads, and the points it builds at runtime', () => {
    const literal = [...source.matchAll(/t\('(landingAi\.[A-Za-z0-9]+)'\)/g)].map((m) => m[1]);
    const points = [...source.matchAll(/'(aiPt\d)'/g)].map((m) => `landingAi.${m[1]}`);
    expect(points).toHaveLength(4);
    for (const key of [...literal, ...points]) expect(english, key).toContain(key);
    expect(new Set([...literal, ...points])).toEqual(new Set(english));
  });

  for (const locale of PUBLIC_LOCALES) {
    it(`is complete in ${locale}`, () => {
      const dict = aiTranslations[locale];
      expect(dict, locale).toBeDefined();
      expect(Object.keys(dict).sort()).toEqual(english);
      for (const [key, value] of Object.entries(dict)) expect(value.trim(), `${locale} ${key}`).not.toBe('');
    });
  }

  it('is read in the visitor’s language once the section registers it', () => {
    registerFeatureDictionaries({ es: aiTranslations.es, en: aiTranslations.en });
    const before = publicI18n.locale;
    setPublicLocale('es');
    expect(tPublic('landingAi.aiPt1')).toBe(aiTranslations.es['landingAi.aiPt1']);
    setPublicLocale('en');
    expect(tPublic('landingAi.aiPt1')).toBe(aiTranslations.en['landingAi.aiPt1']);
    setPublicLocale(before);
  });
});
