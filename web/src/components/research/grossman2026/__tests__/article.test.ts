import { OFFERED_LOCALES } from '../../../../lib/i18n/offered';
import { expect, it } from 'vitest';
import { RESEARCH_DICTIONARIES } from '../../i18n';
import { articleStrings } from '../article';
import { springTranslations } from '../translations';
import { checkLabel } from '../check-labels';
import { evidence, stripComparison } from '../evidence';

it.each(['en','es','pt','de','fr','tr'] as const)('provides localized evidence prose and check labels in %s', (locale) => {
  const dictionary = RESEARCH_DICTIONARIES[locale];
  const strings = articleStrings(dictionary, locale);
  expect(strings.springsFoamComparison).toContain(new Intl.NumberFormat(locale).format(-0.146));
  expect(strings.springsStripBias).toContain(new Intl.NumberFormat(locale).format(0.371));
  expect(strings.springsFoamComparison).not.toMatch(/\{\w+\}/);
  for (const check of evidence.flatMap(g => g.checks)) {
    expect(check.id).toBeTruthy();
    expect(checkLabel(check, locale)).not.toBe('');
    if (locale !== 'en') expect(checkLabel(check, locale)).not.toBe(check.name);
  }
});
it.each(['de','fr','tr'] as const)('translates every spring key in %s', (locale) => {
  for (const key of Object.keys(RESEARCH_DICTIONARIES.en).filter(key => key.startsWith('springs'))) {
    expect(springTranslations[locale]).toHaveProperty(key);
  }
});
it('publishes the four direct disagreements without a pending badge', () => {
  expect(stripComparison.filter(row => !row.passed).map(row => row.eta)).toEqual([0, 0.05, 0.1, 0.2]);
});

it('has a research dictionary for every offered locale', () => {
  for (const locale of OFFERED_LOCALES) expect(RESEARCH_DICTIONARIES).toHaveProperty(locale);
});
