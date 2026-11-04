import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { setLocale, publicI18n } from '../../../../lib/i18n/store.svelte';
import { rs, researchLocale } from '../../i18n';
import { shauerLocales, shauerLocaleKeys } from '../locales';
import { checkMetadata, checkLabel, metricLabel } from '../validation-labels';
import validation from '../../../../../../research/fracture/shauer-2025/VALIDATION.json';
import { num } from '../../shell/format';

const csv: Record<number, URL> = {
  1: new URL('../../../../../../research/fracture/shauer-2025/reference-results/ex1_steps.csv', import.meta.url),
  2: new URL('../../../../../../research/fracture/shauer-2025/reference-results/ex2_steps.csv', import.meta.url),
  3: new URL('../../../../../../research/fracture/shauer-2025/reference-results/ex3_steps.csv', import.meta.url),
};
function rows(example: number) {
  const lines = readFileSync(csv[example], 'utf8').trim().split(/\r?\n/);
  const keys = lines.shift()!.split(',');
  return lines.map(line => Object.fromEntries(line.split(',').map((v, i) => [keys[i], Number(v)])));
}
it('backs the narrative landmarks with recorded reference data and the material formula', () => {
  const steps = rows(2);
  const peak = steps.reduce((a, b) => b.reaction > a.reaction ? b : a);
  expect(steps).toHaveLength(79);
  expect(peak.step).toBe(56);
  expect(steps.at(-1)!.step).toBe(78);
  expect(steps.at(-1)!.pseudotime).toBeCloseTo(0.79, 14);
  expect(peak.reaction).toBeCloseTo(0.7257947845, 9);
  expect(steps[57].staggered_iterations).toBe(308);
  expect(steps[57].reaction).toBeLessThan(peak.reaction / 100);
  expect(Math.sqrt(27 * 210 * 0.0027 / (256 * 0.0075))).toBeCloseTo(2.82, 2);
  // Reference and README damage extrema, including the unphysical nodal degradation.
  expect(Math.max(...steps.map(s => s.damage_max))).toBeCloseTo(1.0096, 4);
  expect(Math.min(...rows(1).map(s => s.damage_min))).toBeCloseTo(3.076336950017797e-8, 15);
  expect(Math.min(...steps.map(s => s.damage_min))).toBeCloseTo(-0.0031224948220514573, 14);
  const min3 = Math.min(...rows(3).map(s => s.damage_min));
  expect(min3).toBeCloseTo(-0.06024191772700118, 14);
  expect((1 - min3) ** 2).toBeCloseTo(1.124, 3);
  expect(validation.checks[20].name).toContain('step 78');
  expect(validation.checks[20].observed).toBeCloseTo(3.085970368132962e-10, 20);
  expect((1 - 0.04) / (70 - 32) / 0.0075).toBeGreaterThan(3);
  expect((0.5 - 0.02) / (80 / 2 - 16) / 0.0075).toBeGreaterThan(2);
});
it('localizes every validation name and metric without changing numbers or tolerances', () => {
  const previous = publicI18n.locale;
  try {
    expect(Object.keys(checkMetadata)).toEqual(validation.checks.map(c => c.name));
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
      setLocale(locale);
      for (const c of validation.checks) {
        expect(checkLabel(c.name)).toBeTruthy();
        expect(metricLabel(c.metric)).toBeTruthy();
        expect(c.observed).toBeLessThanOrEqual(c.tolerance);
      }
      expect(rs().fractureToleranceNote).toContain('1e-4');
      expect(rs().fractureToleranceNote).toContain('1e-8');
      expect(rs().lengthStrength.replace('{strength}', num(Math.sqrt(27 * 210 * 0.0027 / (256 * 0.0075)), { dp: 2 }))).toContain(num(2.82, { dp: 2 }));
      expect(rs().paperNotCompared).toContain('61037c6');
      expect(rs().peakStepLink).toContain('56');
      expect(rs().crackStepLink).toContain('57');
      expect(rs().alternating308).toContain('308');
    }
  } finally { setLocale(previous); }
});
it('provides German, French and Turkish copy for every Shauer and shell string in use', () => {
  const previous = publicI18n.locale;
  const files = ['ShauerPage.svelte', 'IterationsChart.svelte', '../shell/ExperimentShell.svelte', '../shell/VerificationSummary.svelte', '../shell/PaneTabs.svelte'];
  const keys = new Set(files.flatMap(f => [...readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').matchAll(f.startsWith('../shell/') ? /\bs\.(\w+)/g : /\bstrings\.(\w+)/g)].map(m => m[1])));
  // This fallback is not used: Shauer supplies its comparison scope explicitly.
  keys.delete('notComparedWhy');
  try {
    for (const locale of ['de', 'fr', 'tr']) {
      setLocale(locale);
      expect(researchLocale()).toBe(locale);
      for (const key of keys) expect(shauerLocaleKeys, `${locale}.${key}`).toContain(key);
      for (const key of shauerLocaleKeys) expect(rs()[key]).toBe(shauerLocales[locale][key]);
    }
  } finally { setLocale(previous); }
});
it('keeps the complete energy series accessible and uses distinct energy colours', () => {
  const page = readFileSync(new URL('../ShauerPage.svelte', import.meta.url), 'utf8');
  expect(page).toContain('introInArticle');
  expect(page).toContain('metricLabel(c.metric)');
  expect(page).toContain('num(f.step.elastic_energy, { sig: 7 })');
  expect(page).toContain('num(f.step.fracture_energy, { sig: 7 })');
  expect(page).not.toMatch(/name: strings\.(?:elasticEnergy|fractureEnergy), color: (?:REFERENCE|STABILEO)/);
  expect(page).not.toMatch(/authorsQuestions|questionsForAuthors|toFixed|toExponential/);
  const chart = readFileSync(new URL('../LineChart.svelte', import.meta.url), 'utf8');
  expect(chart).toContain('type="range"');
  expect(chart).toContain('onpointerdown={onMove}');
  expect(chart).toContain('aria-live="polite"');
});

it('bundles viewer translations for all public locales', () => {
  const config = readFileSync(new URL('../../../../../vite.research-viewer.config.ts', import.meta.url), 'utf8');
  expect(config).not.toContain('export const ${locale} = {};');
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
    const source = readFileSync(new URL(`../../../../lib/i18n/locales/${locale}.ts`, import.meta.url), 'utf8');
    expect(source).toContain('scalarViewer.viewOptions');
  }
});
