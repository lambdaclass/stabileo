import { expect, it } from 'vitest';
import { publicI18n, setLocale } from '../../../lib/i18n/store.svelte';
import { rs } from '../i18n';
import { topoptStrings } from '../andreassen2011/i18n';

it('attributes reset parameters to reference code in every public locale', () => {
  const original = publicI18n.locale;
  try {
    for (const [locale, expected] of [
      ['en', 'Reset to the reference-code parameters'],
      ['es', 'Restablecer los parámetros del código de referencia'],
      ['pt', 'Restaurar os parâmetros do código de referência'],
    ]) {
      setLocale(locale);
      expect(rs().resetParameters).toBe(expected);
    }
  } finally { setLocale(original); }
});

it('preserves numeric values and interpolation tokens in research translations', () => {
  const original = publicI18n.locale;
  const numbers = (s: string) => s.match(/\d+(?:\.\d+)*(?:e[+-]?\d+)?/g) ?? [];
  const placeholders = (s: string) => s.match(/\{\w+\}/g)?.sort() ?? [];
  try {
    setLocale('en');
    const english = rs();
    for (const locale of ['es', 'pt']) {
      setLocale(locale);
      const translated = rs();
      expect(translated.paperOverview).not.toBe(english.paperOverview);
      expect(translated.damageLimitation).not.toBe(english.damageLimitation);
      for (const key of Object.keys(english) as (keyof typeof english)[]) {
        const source = english[key];
        const value = translated[key];
        if (typeof source !== 'string' || typeof value !== 'string') continue;
        expect(numbers(value), `${locale}.${key}`).toEqual(numbers(source));
        expect(placeholders(value), `${locale}.${key}`).toEqual(placeholders(source));
      }
    }
  } finally { setLocale(original); }
});

it('preserves topology article numbers and translates every research string', () => {
  const english = topoptStrings('en');
  const numbers = (s: string) => s.match(/\d+(?:\.\d+)*(?:e[+-]?\d+)?/g) ?? [];
  for (const locale of ['es', 'pt', 'de', 'fr', 'tr']) {
    const translated = topoptStrings(locale);
    expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      expect(numbers(String(translated[key])), `${locale}.${key}`).toEqual(numbers(String(english[key])));
    }
    expect(translated.overview).not.toBe(english.overview);
    expect(translated.title).not.toBe(english.title);
  }
  expect(topoptStrings('de')).not.toBe(english);
});

it('formats numbers in all six public locales', async () => {
  const { researchLocale } = await import('../i18n');
  const original = publicI18n.locale;
  try {
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
      setLocale(locale);
      expect(researchLocale()).toBe(locale);
      expect(new Intl.NumberFormat(researchLocale()).format(2.4313)).toBe(new Intl.NumberFormat(locale).format(2.4313));
    }
  } finally { setLocale(original); }
});

it('publishes each research route only in the locales its own dictionary defines', async () => {
  const { routeLocales, supportsResearchRoute, researchRoutes } = await import('../locales');
  const { EXPERIMENTS } = await import('../experiments');
  expect(routeLocales('/research')).toEqual(['en', 'es', 'pt', 'de', 'fr', 'tr']);
  expect(supportsResearchRoute('/research/stability/ferrari-sigmund-2025', 'de')).toBe(false);
  expect(routeLocales('/research/stability/ferrari-sigmund-2025')).toEqual(['en', 'es', 'pt']);
  expect(supportsResearchRoute('/research/benchmarks/navier-plate', 'de')).toBe(true);
  expect(supportsResearchRoute('/research/benchmarks/navier-plate/', 'de')).toBe(true);
  expect(routeLocales('/research/unknown-paper')).toEqual(['en']);
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) expect(supportsResearchRoute('/tools', locale)).toBe(true);
  expect(researchRoutes().sort()).toEqual(['/research', ...EXPERIMENTS.map(e => e.path)].sort());
});
