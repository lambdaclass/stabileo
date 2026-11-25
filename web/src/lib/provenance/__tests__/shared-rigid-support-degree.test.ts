import { expect, it } from 'vitest';
import { RESULT_CHANGES } from '../full-registry';

const terms = {
  en: 'degree of static indeterminacy',
  es: 'grado de hiperestaticidad',
  pt: 'grau de hiperestaticidade',
  de: 'Grad der statischen Unbestimmtheit',
  fr: 'degré d’hyperstaticité',
  hu: 'statikai határozatlansági fok',
  tr: 'hiperstatiklik derecesi',
  zh: '超静定次数',
  ar: 'درجة عدم التحديد الساكن',
  hi: 'स्थैतिक अनिश्चितता की डिग्री',
  id: 'derajat hiperstatis',
  it: 'grado di iperstaticità',
  ja: '超静定次数',
  ko: '부정정 차수',
  ru: 'степень статической неопределимости',
} as const;

it.each(Object.entries(terms))('names the degree of static indeterminacy in %s', (locale, term) => {
  const change = RESULT_CHANGES.changes.find(({ id }) => id === 'shared-rigid-support-degree');
  expect(change?.explanation[locale as keyof typeof terms]).toContain(term);
});
