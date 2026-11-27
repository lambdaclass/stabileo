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

it.each(Object.entries(translations))('%s cites the integrated toy equations', (_locale, copy) => {
  expect(copy.toyRate).toContain('(S74)–(S75)');
});

it.each(Object.entries(translations))('%s uses the study time scale in the rate definition', (_locale, copy) => {
  expect(copy.model).toContain('T_osc = {period} t*');
});

it('names the mesh refinement comparison in Chinese', () => {
  expect(translations.zh.referenceLabel).toContain('网格加密研究');
});

it('states the starting step of the Chinese halving comparison', () => {
  expect(translations.zh.sensitivityText).toContain('在 Δt 低于 0.005 T_osc 时再将 Δt 减半，A 变化 {dt}');
});
