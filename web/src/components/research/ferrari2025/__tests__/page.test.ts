import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FerrariPage from '../FerrariPage.svelte';
import paper from '../../../../../../research/stability/ferrari-sigmund-2025/reference-results/paper_values.json';
import replay from '../../../../../../research/stability/ferrari-sigmund-2025/results/stabileo_results.json';
import validation from '../../../../../../research/stability/ferrari-sigmund-2025/VALIDATION.json';
import PlotXY from '../../grossman2026/PlotXY.svelte';
import { setLocale } from '../../../../lib/i18n/store.svelte';
import { rs } from '../../i18n';

afterEach(() => setLocale('en'));
for (const locale of ['en', 'es', 'pt']) {
  it(`renders the paper references and actual model in ${locale}`, () => {
    setLocale(locale);
    const body = render(FerrariPage).body.replace(/<!--.*?-->/g, '');
    const format = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(v);
    const ref = body.match(/data-testid="ferrari-reference"[^>]*>(.*?)<\/p>/s)![1];
    for (const values of [paper.closed_form, paper.numerical]) {
      expect(ref).toContain([values.lambda_1, values.alpha, values.beta].map(format).join('; '));
    }
    for (const v of [paper.parameters.young_MPa, paper.parameters.area_m2, replay.lambda]) expect(body).toContain(format(v));
    expect(body).toContain(new Intl.NumberFormat(locale, { notation: 'scientific', maximumSignificantDigits: 4 }).format(paper.parameters.inertia_m4));
    const checks = body.match(/data-testid="ferrari-checks"[^>]*>(.*?)<\/p>/s)![1];
    for (const value of [validation.checks[4].observed, validation.checks[4].tolerance,
      Math.max(...validation.checks.slice(0, 4).map(c => c.observed)), validation.checks[0].tolerance]) {
      expect(checks).toContain(new Intl.NumberFormat(locale, { notation: 'scientific', maximumSignificantDigits: 4 }).format(value));
    }
    const model = body.match(/data-testid="ferrari-model"[^>]*>(.*?)<\/p>/s)![1];
    for (const value of [paper.parameters.length_m, paper.parameters.young_MPa, paper.parameters.area_m2,
      -paper.parameters.corner_force_N / 1000, paper.parameters.eccentricity_m, Object.keys(replay.model.elements).length / 2]) {
      expect(model).toContain(format(value));
    }
    expect(body).not.toMatch(/\{\w+\}/);
    expect(body).not.toContain(rs().ferrariAuthors);
    expect(body).not.toMatch(/pending|pendiente|pendente|unfinished|provisional/i);
    expect(body).toContain(rs().ferrariComparison);
  });
}

for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
  it(`localizes chart ticks in ${locale}`, () => {
    setLocale(locale);
    const body = render(PlotXY, { props: {
      series: [{ name: 'test', color: '#000', kind: 'line', points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }] }],
      xLabel: 'x', yLabel: 'y', ariaLabel: 'test',
    } }).body;
    expect(body).toContain(new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(0.1));
  });
}
