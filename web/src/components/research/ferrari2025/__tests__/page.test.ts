import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FerrariPage from '../FerrariPage.svelte';
import paper from '../../../../../../research/stability/ferrari-sigmund-2025/reference-results/paper_values.json';
import comparison from '../../../../../../research/stability/ferrari-sigmund-2025/reference-results/published_comparison.json';
import replay from '../../../../../../research/stability/ferrari-sigmund-2025/results/stabileo_results.json';
import validation from '../../../../../../research/stability/ferrari-sigmund-2025/VALIDATION.json';
import { comparisonDifference } from '../../shell/context';
import { sci } from '../../shell/format';
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
  const lba = validation.study.lba_load_factor.values;
  const fine = validation.study.corotational.find(c => c.elements_per_member === 40)!;
  const expected = {
    'lambda-numerical': [lba[1], 1e-4, 'absolute difference'],
    'lambda-closed': [lba[3], 1e-3, 'relative difference'],
    'alpha-closed': [fine.alpha, 4e-3, 'relative difference'],
    'beta-closed': [fine.beta, 1.1e-2, 'relative difference'],
  };
  for (const [id, [computed, tolerance, metric]] of Object.entries(expected)) {
    expect(rows[id]).toMatchObject({ computed, tolerance, metric });
    expect(rows[id].observed).toBeCloseTo(comparisonDifference(rows[id]), 12);
    expect(rows[id].passed).toBe(rows[id].observed <= rows[id].tolerance);
  }
  expect(comparisonDifference({ ...rows['alpha-closed'], metric: 'unknown difference' })).toBeNaN();
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
    const summary = body.match(/<dl class="rs-verify[^"]*">(.*?)<\/dl>/s)![1];
    const groups = [...summary.matchAll(/<div[^>]*>(.*?)<\/div>/gs)].map(m => text(m[1]));
    expect(groups[0]).toContain(s.checksLabel);
    expect(groups[1]).toContain(rs().againstPaper);
    expect(groups[1]).toContain(`3 ${rs().of} 4 ${rs().checksPass}`);
    const critical = comparison.checks.find(r => r.id === 'lambda-numerical')!;
    const criticalRow = [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].find(m => m[1].includes(s.rows[critical.id]))![1];
    const cells = [...criticalRow.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(m => m[1].replace(/<!--.*?-->/gs, ''));
    for (const [i, v] of [Math.abs(validation.study.lba_load_factor.values[1] - critical.reference), critical.tolerance].entries()) {
      const { mantissa, exp } = sci(v, 2);
      expect(cells[i + 2]).toContain(mantissa);
      expect(cells[i + 2]).toMatch(new RegExp(`<sup[^>]*>${exp}</sup>`));
    }
    expect(model).toContain(new Intl.NumberFormat(locale, { maximumFractionDigits: 6, signDisplay: 'always' }).format(moment) + ' kN·m');
    const beta = text(body.match(/data-testid="ferrari-beta"[^>]*>(.*?)<\/p>/s)![1]);
    expect(beta).toContain(new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }).format(comparison.checks.find(r => r.id === 'beta-closed')!.computed));
    expect(beta).toContain(format(paper.closed_form.beta));
    expect(page).toContain(`λ₁ = ${format(replay.lambda)}`);
    expect(groups[0]).toContain(`${validation.checks.length} ${rs().of} ${validation.checks.length} ${rs().checksPass}`);
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

it('distinguishes the perfect branch from the fitted moment polynomial in every method', () => {
  for (const s of Object.values(translations)) {
    expect(s.method).toContain('λ(θ) = λ₁(1 + αθ + βθ² + …)');
    expect(s.method).toContain('θ·λ(θ) = λ₁(−Δ + θ + αθ² + βθ³ + …)');
  }
});
