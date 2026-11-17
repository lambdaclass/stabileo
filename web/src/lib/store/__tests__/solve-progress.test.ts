import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { solveProgress, secondsLeft, noticesToReview } from '../solve-progress.svelte';
import { setLocale } from '../../i18n';
import { ensureLocale } from '../../i18n/store.svelte';
import { OFFERED_LOCALES } from '../../i18n/offered';

describe('solve progress', () => {
  beforeEach(() => solveProgress.dismiss());

  it('runs through its steps and ends with how it went', () => {
    solveProgress.begin(1000);
    expect(solveProgress.now).toMatchObject({ phase: 'prepare', startedAt: 1000 });
    solveProgress.step('mesh');
    solveProgress.step('cases', 0, 4, 1200);
    solveProgress.step('cases', 1, 4, 1400);
    expect(solveProgress.now).toMatchObject({ phase: 'cases', done: 1, total: 4, casesAt: 1200 });
    solveProgress.step('combine');
    solveProgress.finish({ ok: true, warnings: 2 }, 2000);
    expect(solveProgress.now).toMatchObject({ phase: 'done', endedAt: 2000, warnings: 2 });
    solveProgress.step('single');
    expect(solveProgress.now?.phase).toBe('done');
    solveProgress.dismiss();
    expect(solveProgress.now).toBeNull();
  });

  it('a failure keeps its reason', () => {
    solveProgress.begin(0);
    solveProgress.finish({ ok: false, error: 'Mechanism at node 4', warnings: 0 }, 10);
    expect(solveProgress.now).toMatchObject({ phase: 'failed', error: 'Mechanism at node 4' });
  });

  it('estimates the time left from the pace of the cases done, counting down until the next one finishes', () => {
    solveProgress.begin(0);
    solveProgress.step('cases', 0, 5, 1000);
    expect(secondsLeft(solveProgress.now!, 1500)).toBeNull();
    solveProgress.step('cases', 2, 5, 3000);
    expect(secondsLeft(solveProgress.now!, 3000)).toBeCloseTo(3, 9);
    expect(secondsLeft(solveProgress.now!, 4000)).toBeCloseTo(2, 9);
    expect(secondsLeft(solveProgress.now!, 9000)).toBe(0);
    solveProgress.step('cases', 5, 5, 4000);
    expect(secondsLeft(solveProgress.now!, 4000)).toBeNull();
  });
});

describe('the notice count', () => {
  afterEach(() => setLocale('en'));

  it('says one notice in the singular and points PRO to Diagnostics, Basic to the results table', () => {
    setLocale('en');
    expect(noticesToReview(1, true)).toBe('1 notice to review in Diagnostics');
    expect(noticesToReview(3, true)).toBe('3 notices to review in Diagnostics');
    expect(noticesToReview(1, false)).toBe('1 notice to review in the results table');
    expect(noticesToReview(2, false)).toBe('2 notices to review in the results table');
  });

  it('has both forms in every offered language, and Basic never names Diagnostics', async () => {
    for (const locale of OFFERED_LOCALES) {
      await ensureLocale(locale);
      setLocale(locale);
      for (const pro of [true, false]) {
        const one = noticesToReview(1, pro), many = noticesToReview(7, pro);
        expect(one, `${locale} one`).toContain('1');
        expect(many, `${locale} many`).toContain('7');
        expect(one, locale).not.toMatch(/solveProgress/);
        expect(many, locale).not.toMatch(/solveProgress/);
        if (!pro) expect(many, locale).not.toMatch(/diagn|tanılama/i);
      }
      expect(noticesToReview(1, true), locale).not.toBe(noticesToReview(1, false));
    }
  });
});
