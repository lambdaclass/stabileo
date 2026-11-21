import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import { asymmetry, decodeRun, displacementOf, logStep, logValue, parseFigure, RATE_RANGE, restGeometry, sameSettings, snapFrame, thetaPeaks } from '../protocol';
import SnapChecks from '../SnapChecks.svelte';
import replay from '../../../../../../research/mechanics/vella-2024/reference-results/replay.json';
import study from '../../../../../../research/mechanics/vella-2024/reference-results/study.json';
import published from '../../../../../../research/mechanics/vella-2024/reference-results/published.json';
import comparison from '../../../../../../research/mechanics/vella-2024/reference-results/published_comparison.json';
import validation from '../../../../../../research/mechanics/vella-2024/VALIDATION.json';
import figureCsv from '../../../../../../research/mechanics/vella-2024/reference-results/fig2c_digitized.csv?raw';
import { snapStrings, translations } from '../strings';
import { snapCard } from '../card';
import { setLocale } from '../../../../lib/i18n/store.svelte';
import { PUBLIC_LOCALES } from '../../../../lib/i18n/offered';

it('replays a seeded run that snaps asymmetrically with the start branch’s critical points', () => {
  const run = decodeRun(replay);
  expect(run.outcome.snapped).toBe(true);
  expect(run.outcome.amplification).toBeGreaterThan(2);
  expect(run.critical.muA).toBeGreaterThan(run.critical.muStar);
  expect(run.critical.muA).toBeCloseTo(study.dynamics.critical.muA, 12);
  const k = snapFrame(run)!;
  expect(k).not.toBeNull();
  expect(run.frames[k].height).toBeGreaterThan(0);
  expect(run.frames[k - 1].height).toBeLessThanOrEqual(0);
  expect(run.frames[0].x[0]).toBeCloseTo(0.5 - run.frames[0].x[run.settings.n] + 0.5, 12);
  expect(() => decodeRun({ ...replay, frames: [] })).toThrow();
  expect(() => decodeRun({ ...replay, critical: { ...replay.critical, muA: 0 } })).toThrow();
  expect(() => decodeRun({ ...replay, settings: { ...replay.settings, rate: Number.NaN } })).toThrow();
});

const JUMP = ['tSnap', 'muSnap', 'tEnd', 'thetaDuring', 'amplification', 'amplificationFromMuA'] as const;
const noSnap = () => ({ ...replay, outcome: { ...replay.outcome, snapped: false, ...Object.fromEntries(JUMP.map(k => [k, null])) } });

it('decodes a run without a snap as an explicit no-snap outcome, with no snap frame', () => {
  const run = decodeRun(noSnap());
  expect(run.outcome.snapped).toBe(false);
  expect(run.outcome.amplification).toBeNull();
  expect(snapFrame(run)).toBeNull();
  expect(Number.isFinite(run.outcome.thetaBefore)).toBe(true);
});

it('refuses a snap without finite snap values, and snap values without a snap', () => {
  for (const key of JUMP) {
    expect(() => decodeRun({ ...replay, outcome: { ...replay.outcome, [key]: null } }), key).toThrow('Invalid outcome');
    expect(() => decodeRun({ ...replay, outcome: { ...replay.outcome, [key]: Number.NaN } }), key).toThrow('Invalid outcome');
    expect(() => decodeRun({ ...noSnap(), outcome: { ...noSnap().outcome, [key]: 1 } }), key).toThrow('Invalid outcome');
  }
});

it('keeps every positive peak of |θ| on the logarithmic trace and counts the exact zeros', () => {
  const { points, zeros } = thetaPeaks({ t: [0, 1, 2, 3], thetaMin: [0, -3e-12, -1e-9, 0], thetaMax: [0, 2e-12, 4e-3, 0] });
  expect(points).toEqual([[1, 3e-12], [2, 4e-3]]);
  expect(zeros).toBe(2);
});

it('shows a failed row’s difference and tolerance with the same relative default when the flag is omitted', () => {
  const html = (relative?: boolean) => render(SnapChecks, { props: { s: translations.en, rows: [{ id: 'x', reference: 1, computed: 1.5, relative, observed: 0.5, tolerance: 0.25, passed: false, source: 'p. 1' }] } }).body.replace(/<!--[^>]*-->/g, '');
  expect(html()).toContain('✗ 50 % (not reproduced, tolerance 25 %)');
  expect(html(true)).toContain('✗ 50 % (not reproduced, tolerance 25 %)');
  expect(html(false)).toContain('✗ 0.5 abs. (not reproduced, tolerance 0.25 abs.)');
});

it('draws the stability diagram’s markers from the same study as its curves, in the curves’ height units', () => {
  const branch = study.diagram.inverted;
  const crossing = (value: (p: (typeof branch)[number]) => number) => {
    const k = branch.findIndex((p, i) => i > 0 && value(branch[i - 1]) > 0 && value(p) <= 0);
    const [a, b] = [value(branch[k - 1]), value(branch[k])];
    return branch[k - 1].height + ((branch[k].height - branch[k - 1].height) * a) / (a - b);
  };
  expect(Math.abs(crossing(p => p.spectrum.omega2_antisymmetric) - study.diagram.critical.heightA)).toBeLessThan(1e-4);
  expect(Math.abs(crossing(p => p.spectrum.omega2_symmetric) - study.diagram.critical.heightStar)).toBeLessThan(1e-4);
  expect(decodeRun(replay).critical.heightA).toBeCloseTo(study.diagram.critical.heightA, 9);
});

it('draws a strip that is mirror-symmetric when its heights are', () => {
  const { xy, cells } = restGeometry(4);
  expect(xy).toEqual([0, 0, 0.25, 0, 0.5, 0, 0.75, 0, 1, 0]);
  expect(cells).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  expect(asymmetry([0, 1, 2, 1, 0])).toEqual([0, 0, 0, 0, 0]);
  expect(asymmetry([0, 1, 2, 3, 0])).toEqual([0, -2, 0, 2, 0]);
  expect(displacementOf([0, 0.5, 1], [0, 0.1, 0])).toEqual([0, 0, 0, 0.1, 0, 0]);
});

it('maps the logarithmic sliders to and from rates', () => {
  expect(logValue(RATE_RANGE, 60, 0)).toBe(0.005);
  expect(logValue(RATE_RANGE, 60, 60)).toBe(0.7);
  for (const r of [0.005, 0.03, 0.3, 0.7]) expect(Math.abs(logValue(RATE_RANGE, 60, logStep(RATE_RANGE, 60, r)) / r - 1)).toBeLessThan(0.05);
  const run = decodeRun(replay);
  expect(sameSettings(run.settings, { ...run.settings })).toBe(true);
  expect(sameSettings(run.settings, { ...run.settings, rate: run.settings.rate * 1.01 })).toBe(false);
});

it('keeps the evidence consistent with what the page states', () => {
  for (const c of validation.checks) expect(c.passed).toBe(c.observed <= c.tolerance);
  expect(comparison.checks.length).toBeGreaterThan(5);
  for (const c of comparison.checks) {
    expect(c.passed).toBe(true);
    const observed = c.relative ? Math.abs(c.computed / c.reference - 1) : Math.abs(c.computed - c.reference);
    expect(observed).toBeCloseTo(c.observed, 12);
  }
  expect(published.table_s1.rows).toHaveLength(30);
  const figure = parseFigure(figureCsv);
  expect(figure.simulation.length).toBeGreaterThan(100);
  expect(study.dynamics.seeded.find(p => p.rate === 0.005)!.amplification).toBeGreaterThan(10);
  expect(study.dynamics.seeded.find(p => p.rate === 0.7)!.amplification).toBeLessThan(2);
});

it('translates the experiment in every research locale with the same keys and placeholders', () => {
  const placeholders = (v: string) => [...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && !Array.isArray(v) ? keys(v).map(x => `${k}.${x}`) : [k]));
  const flat = (o: object): Record<string, string> => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : Array.isArray(v) ? v.map((x, i) => [`${k}.${i}`, x]) : Object.entries(flat(v)).map(([a, b]) => [`${k}.${a}`, b]))));
  const english = flat(translations.en);
  const titles = new Set<string>();
  try {
    for (const locale of PUBLIC_LOCALES) {
      setLocale(locale);
      const s = snapStrings();
      expect(keys(s).sort()).toEqual(keys(translations.en).sort());
      const mine = flat(s);
      for (const [k, v] of Object.entries(english)) {
        expect(mine[k].length, `${locale} ${k}`).toBeGreaterThan(0);
        expect(placeholders(mine[k]), `${locale} ${k}`).toEqual(placeholders(v));
      }
      expect(s.title).toBe(snapCard[locale as keyof typeof snapCard].title);
      titles.add(s.title);
    }
  } finally { setLocale('en'); }
  expect(titles.size).toBe(PUBLIC_LOCALES.length);
});

it('labels every source in every locale with the same pages, equations and figures as the evidence', () => {
  const shown = [...validation.checks.filter(c => 'reference' in c || c.source.startsWith('arXiv')), ...validation.not_reproduced];
  // The references are the numbers in a label: pages, equations (S17), figures 2(c), 0.096 → the same multiset in every language.
  const references = (label: string) => (label.replace(/(\d),(\d)/g, '$1.$2').match(/S?\d+(?:\.\d+)?/g) ?? []).sort();
  for (const [locale, strings] of Object.entries(translations)) {
    for (const c of shown) {
      const label = strings.sources[c.id];
      expect(label, `${locale} ${c.id}`).toBeTruthy();
      expect(references(label), `${locale} ${c.id}`).toEqual(references(c.source.replace(/^arXiv:2312\.13908v2 /, '').replace(/, read off the figure.*$/, '')));
    }
    expect(strings.citation.split('{title}'), locale).toHaveLength(2);
  }
});
