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
  for (const locale of ['es', 'pt']) {
    const translated = topoptStrings(locale);
    expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      expect(numbers(translated[key]), `${locale}.${key}`).toEqual(numbers(english[key]));
    }
    expect(translated.overview).not.toBe(english.overview);
    expect(translated.title).not.toBe(english.title);
  }
  expect(topoptStrings('de')).toBe(english);
});
