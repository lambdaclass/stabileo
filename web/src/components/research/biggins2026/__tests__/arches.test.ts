import { expect, it } from 'vitest';
import { decodeRun } from '../protocol';
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
  for (const locale of ['en', 'es', 'pt']) {
    setLocale(locale);
    const s = archStrings();
    titles.add(s.title);
    expect(Object.values(s).every(v => v.length > 0)).toBe(true);
  }
  setLocale('en');
  expect(titles.size).toBe(3);
});
