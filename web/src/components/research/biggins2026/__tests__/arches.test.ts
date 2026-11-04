import { expect, it } from 'vitest';
import { decodeRun, postSnapStep } from '../protocol';
import replay from '../../../../../../research/mechanics/biggins-2026/reference-results/replay.json';
import { archStrings } from '../strings';
import { setLocale } from '../../../../lib/i18n/store.svelte';
it('replays the checked threshold and an equilibrium jump', () => {
  const run = decodeRun(replay);
  expect(run.threshold / Math.sqrt(run.compression)).toBeCloseTo(21.52, 2);
  expect(run.frames[0].y[32]).toBeGreaterThan(0);
  expect(run.frames[60].y[32]).toBeLessThan(0);
  expect(() => decodeRun({ ...run, threshold: NaN })).toThrow();
  expect(() => decodeRun({ ...run, frames: [] })).toThrow();
});
it('translates the experiment in all research locales', () => {
  const titles = new Set<string>();
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
    setLocale(locale);
    const s = archStrings();
    titles.add(s.title);
    expect(Object.values(s).every(v => typeof v === 'string' ? v.length > 0 : Object.values(v).every(t => t.length > 0))).toBe(true);
  }
  setLocale('en');
  expect(titles.size).toBe(6);
});

it('identifies both critical equilibria without relying on rounded alpha', () => {
  const run = decodeRun(replay);
  const i = postSnapStep(run);
  expect(i).toBe(49);
  expect(run.frames[i].alpha).toBe(run.threshold);
  expect(run.frames[i - 1].alpha).toBe(run.threshold);
  expect(run.frames[i - 1].y[32]).toBeGreaterThan(0);
  expect(run.frames[i].y[32]).toBeLessThan(0);
  expect(run.frames[i - 1].force).toBeCloseTo(run.modes[1].force, 6);
});

it('checks the evidence numbers and keys used in every locale', async () => {
  const { default: validation } = await import('../../../../../../research/mechanics/biggins-2026/VALIDATION.json');
  const { default: published } = await import('../../../../../../research/mechanics/biggins-2026/reference-results/published_comparison.json');
  const { default: reference } = await import('../../../../../../research/mechanics/biggins-2026/reference-results/thresholds.json');
  const { rs } = await import('../../i18n');
  const { chartStrings } = await import('../../shell/chart-strings');
  expect(validation.published_checks).toEqual(published.checks);
  const p = published.checks[0];
  expect(p.reference).toBe(21.52);
  expect(p.computed).toBe(replay.threshold / Math.sqrt(replay.compression));
  expect(p.observed).toBe(Math.abs(p.computed - p.reference));
  expect(p.tolerance).toBe(0.005);
  expect(p.passed).toBe(p.observed <= p.tolerance);
  expect(validation.checks[0].observed).toBe(Math.max(...replay.curve.map((point, i) => Math.abs(point[1] / reference[i][1] - 1))));
  expect(reference.find(p => p[0] === 0.7)![1]).toBeCloseTo(21.5141, 4);
  for (const c of validation.checks) expect(c.passed).toBe(c.observed <= c.tolerance);
  const labels = new Set<string>();
  try {
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
      setLocale(locale);
      const s = archStrings();
      expect(Object.keys(s.checkLabels).sort()).toEqual(validation.checks.map(c => c.metric).sort());
      expect(s.evidence).toContain('{threshold}');
      expect(s.referenceCaveat).toContain('{software}');
      expect(s.referenceCaveat).toContain('{published}');
      expect(s.coordinates).toContain('x/L');
      expect(s.force).toContain('NL²/EI');
      expect(chartStrings().axes).toContain('{x}');
      expect(chartStrings().axes).toContain('{y}');
      labels.add(rs().replaySource);
    }
    expect(labels.size).toBe(6);
  } finally { setLocale('en'); }
});
