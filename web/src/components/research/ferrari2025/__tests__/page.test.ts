import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FerrariPage from '../FerrariPage.svelte';
import paper from '../../../../../../research/stability/ferrari-sigmund-2025/reference-results/paper_values.json';
import comparison from '../../../../../../research/stability/ferrari-sigmund-2025/reference-results/published_comparison.json';
import replay from '../../../../../../research/stability/ferrari-sigmund-2025/results/stabileo_results.json';
import validation from '../../../../../../research/stability/ferrari-sigmund-2025/VALIDATION.json';
import PlotXY from '../../grossman2026/PlotXY.svelte';
import { setLocale } from '../../../../lib/i18n/store.svelte';
import { rs } from '../../i18n';
import { PUBLIC_LOCALES } from '../../../../lib/i18n/offered';
import { translations } from '../strings';

afterEach(() => setLocale('en'));
const text = (html: string) => html.replace(/<!--.*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

it('keeps every key, list and placeholder in all eight locales', () => {
  const placeholders = (v: string) => (v.match(/\{\w+\}/g) ?? []).sort();
  expect(Object.keys(translations).sort()).toEqual([...PUBLIC_LOCALES].sort());
  for (const locale of PUBLIC_LOCALES) {
    expect(Object.keys(translations[locale]).sort()).toEqual(Object.keys(translations.en).sort());
    expect(Object.keys(translations[locale].rows).sort()).toEqual(comparison.checks.map(r => r.id).sort());
    for (const key of Object.keys(translations.en) as (keyof typeof translations.en)[]) {
      const value = translations[locale][key];
      if (typeof value === 'string') expect(placeholders(value), `${locale}.${key}`).toEqual(placeholders(translations.en[key] as string));
      if (locale !== 'en' && typeof value === 'string' && key !== 'imperfection') expect(value, `${locale}.${key}`).not.toBe(translations.en[key]);
    }
  }
});

it('writes the comparison rows from the validation test, with beta left as a failure', () => {
  const rows = Object.fromEntries(comparison.checks.map(r => [r.id, r]));
  expect(rows['lambda-numerical'].reference).toBe(paper.numerical.lambda_1);
  expect(rows['lambda-closed'].reference).toBe(paper.closed_form.lambda_1);
  expect(rows['alpha-closed'].reference).toBe(paper.closed_form.alpha);
  expect(rows['beta-closed'].reference).toBe(paper.closed_form.beta);
  for (const id of ['lambda-numerical', 'lambda-closed', 'alpha-closed']) expect(rows[id].passed).toBe(true);
  expect(rows['beta-closed'].passed).toBe(false);
  for (const row of comparison.checks) {
    const expected = row.metric.startsWith('absolute') ? Math.abs(row.computed - row.reference) : Math.abs(row.computed - row.reference) / Math.abs(row.reference);
    expect(row.observed).toBeCloseTo(expected, 12);
    expect(row.passed).toBe(row.observed <= row.tolerance);
  }
  expect(validation.checks.every(c => c.passed)).toBe(true);
});

for (const locale of PUBLIC_LOCALES) {
  it(`renders the model, the evidence and the comparison in ${locale}`, () => {
    setLocale(locale);
    const s = translations[locale];
    const body = render(FerrariPage).body;
    const page = text(body);
    const format = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(v);
    expect(body).toContain(`lang="${locale}"`);
    expect(page).toContain(`α = ${format(paper.numerical.alpha)}`);
    expect(page).toContain(`β = ${format(paper.numerical.beta)}`);
    expect(page).toContain(s.title);
    for (const row of comparison.checks) expect(page).toContain(s.rows[row.id]);
    const model = text(body.match(/data-testid="ferrari-model"[^>]*>(.*?)<\/p>/s)![1]);
    for (const value of [paper.parameters.length_m, paper.parameters.young_MPa, paper.parameters.area_m2, -paper.parameters.corner_force_N / 1000, Object.keys(replay.model.elements).length / 2]) {
      expect(model).toContain(format(value));
    }
    const moment = -paper.parameters.corner_force_N / 1000 * paper.parameters.eccentricity_m;
    expect(replay.model.loads[0].data.my).toBe(moment);
    const scientific = (x: number) => {
      const [m, e] = x.toExponential(3).split('e');
      const mantissa = new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }).format(Number(m));
      return mantissa + ' × 10' + String(Number(e)).replace(/[-0-9]/g, c => c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]);
    };
    expect(model).toContain(scientific(paper.parameters.inertia_m4));
    const evidence = text(body.match(/data-testid="ferrari-checks"[^>]*>(.*?)<\/p>/s)![1]);
    for (const x of [Math.max(...validation.checks.slice(0, 4).map(c => c.observed)), validation.checks[0].tolerance]) expect(evidence).toContain(scientific(x));
    expect(page).toContain(`3 ${rs().of} 4 ${rs().checksPass}`);
    expect(model).toContain(new Intl.NumberFormat(locale, { maximumFractionDigits: 6, signDisplay: 'always' }).format(moment) + ' kN·m');
    const beta = text(body.match(/data-testid="ferrari-beta"[^>]*>(.*?)<\/p>/s)![1]);
    expect(beta).toContain(new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }).format(comparison.checks.find(r => r.id === 'beta-closed')!.computed));
    expect(beta).toContain(format(paper.closed_form.beta));
    expect(page).toContain(`λ₁ = ${format(replay.lambda)}`);
    expect(page).toContain(`${validation.checks.length} ${rs().of} ${validation.checks.length} ${rs().checksPass}`);
    expect(page).not.toMatch(/\{\w+\}|undefined|NaN/);
  });
}

for (const locale of PUBLIC_LOCALES) {
  it(`localizes chart ticks in ${locale}`, () => {
    setLocale(locale);
    const body = render(PlotXY, { props: {
      series: [{ name: 'test', color: '#000', kind: 'line', points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }] }],
      xLabel: 'x', yLabel: 'y', ariaLabel: 'test',
    } }).body;
    expect(body).toContain(new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(0.1));
  });
}
