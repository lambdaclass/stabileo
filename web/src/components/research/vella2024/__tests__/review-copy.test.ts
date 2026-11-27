import { expect, it } from 'vitest';
import { translations } from '../strings';

const analytical = {
  en: 'analytical benchmarks', de: 'analytischen Vergleichswerte', es: 'referencias analíticas',
  fr: 'références analytiques', hu: 'analitikus referenciaértékeket', pt: 'referências analíticas',
  tr: 'analitik referans', zh: '解析基准',
};

it.each(Object.entries(translations))('%s identifies the analytical benchmark and the independent simulation', (locale, copy) => {
  expect(copy.model).toContain(analytical[locale as keyof typeof analytical]);
});

it.each(Object.entries(translations))('%s distinguishes growth, peak angle and the transition verdict', (_locale, copy) => {
  for (const id of ['fig2c-amplitude', 'fig2c-amplitude-one-end']) expect(copy.rows[id]).toMatch(/ A(?: |,|，|$)/);
  expect(copy.summary.symmetric).toBe('A < 2');
  expect(copy.summary.asymmetric).toBe('A ≥ 2');
  expect(copy.reproduces.join(' ')).toContain('A < 2');
  expect(copy.doesnt.join(' ')).not.toContain('A < 2');
});

it('states the Hungarian critical-rate discrepancy as a complete comparison', () => {
  expect(translations.hu.doesnt.join(' ')).toMatch(/10 %-kal eltér/);
});
