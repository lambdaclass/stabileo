import { translations as damping } from '../cqc1981/strings';
import { translations as shape } from '../feher2026/strings';
import { strings as plate } from '../navier1823/strings';
import { strings as shells } from '../shell1985/i18n';
import { numbers } from './localized-numbers';
import { expect, it } from 'vitest';
import { publicI18n, setLocale } from '../../../lib/i18n/store.svelte';
import { rs } from '../i18n';
import { topoptStrings } from '../andreassen2011/i18n';
import { PUBLIC_LOCALES } from '../../../lib/i18n/offered';

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
  const placeholders = (s: string) => s.match(/\{\w+\}/g)?.sort() ?? [];
  try {
    setLocale('en');
    const english = rs();
    for (const locale of ['es', 'pt', 'hu', 'zh']) {
      setLocale(locale);
      const translated = rs();
      expect(translated.paperOverview).not.toBe(english.paperOverview);
      expect(translated.damageLimitation).not.toBe(english.damageLimitation);
      for (const key of Object.keys(english) as (keyof typeof english)[]) {
        const source = english[key];
        const value = translated[key];
        if (typeof source !== 'string' || typeof value !== 'string') continue;
        expect(numbers(value, locale), `${locale}.${key}`).toEqual(numbers(source, "en"));
        expect(placeholders(value), `${locale}.${key}`).toEqual(placeholders(source));
      }
    }
  } finally { setLocale(original); }
});

it('preserves topology article numbers and translates every research string', () => {
  const english = topoptStrings('en');
  for (const locale of PUBLIC_LOCALES.filter((l) => l !== 'en')) {
    const translated = topoptStrings(locale);
    expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      expect(numbers(String(translated[key]), locale), `${locale}.${key}`).toEqual(numbers(String(english[key]), "en"));
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
    for (const locale of PUBLIC_LOCALES) {
      setLocale(locale);
      expect(researchLocale()).toBe(locale);
      expect(new Intl.NumberFormat(researchLocale()).format(2.4313)).toBe(new Intl.NumberFormat(locale).format(2.4313));
    }
  } finally { setLocale(original); }
});

it.skip('known wrong result: #2505 distinguishes grouped thousands from decimal fractions', () => {
  for (const locale of ['en', 'zh', 'de', 'es', 'fr', 'hu', 'tr', 'pt']) {
    const format = new Intl.NumberFormat(locale, {useGrouping: true, minimumFractionDigits: 3});
    expect(numbers(format.format(1250), locale)).toEqual(['1250']);
    expect(numbers(format.format(1.25), locale)).toEqual(['1.25']);
  }
});

const conditions = {
  en: ['damping', 'in-plane', 'halv', 'cause remains open'],
  de: ['Dämpfung', 'Plattenebene', 'Halbierung', 'Ursache bleibt offen'],
  es: ['amortiguamiento', 'plano', 'mitad', 'causa sigue abierta'],
  fr: ['amortissement', 'plan', 'moitié', 'cause reste ouverte'],
  hu: ['csillapítás', 'síkjában', 'felez', 'ok továbbra is nyitott'],
  pt: ['amortecimento', 'plano', 'metade', 'causa permanece em aberto'],
  tr: ['sönüm', 'düzlem', 'yarıya', 'nedeni henüz bilinmiyor'],
  zh: ['阻尼', '面内', '减半', '原因尚未确定'],
};

it.skip.each(Object.entries(conditions))('known wrong result: #2505 describes the actual loading, refusal and refinement in %s', (language, terms) => {
  const locale = language as keyof typeof conditions;
  expect(damping[locale].limitations[2]).toContain(terms[0]);
  expect(plate[locale].hardText).toContain(terms[1]);
  expect(plate[locale].hardText).toContain(terms[2]);
  expect(JSON.stringify(shape[locale])).toContain(terms[3]);
  expect(shells[locale].lead).toContain('#798');
  expect(shells[locale].validationText.split(/[.。]/).filter(Boolean)).toHaveLength(3);
});

it.skip('known wrong result: #2505 attributes missing roof loads to nodal tributary areas', () => {
  expect(shells.hu.auditText).toContain('csomópontokhoz tartozó terület');
  expect(shells.zh.auditText).toContain('节点分担面积');
});
