import { expect, it } from 'vitest';
import { asymmetry, decodeRun, displacementOf, logStep, logValue, parseFigure, RATE_RANGE, restGeometry, sameSettings, snapFrame } from '../protocol';
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
  const k = snapFrame(run);
  expect(run.frames[k].height).toBeGreaterThan(0);
  expect(run.frames[k - 1].height).toBeLessThanOrEqual(0);
  expect(run.frames[0].x[0]).toBeCloseTo(0.5 - run.frames[0].x[run.settings.n] + 0.5, 12);
  expect(() => decodeRun({ ...replay, frames: [] })).toThrow();
  expect(() => decodeRun({ ...replay, critical: { ...replay.critical, muA: 0 } })).toThrow();
  expect(() => decodeRun({ ...replay, settings: { ...replay.settings, rate: Number.NaN } })).toThrow();
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
