import { expect, it } from 'vitest';
import { setLocale, publicI18n } from '../../../lib/i18n/store.svelte';
import { rs } from '../i18n';
import { reviewStatus, reviewVerdict } from '../reviews';

it('counts recorded reviews, deduplicates reviewers and keeps stage separate from approval', () => {
  const original = publicI18n.locale;
  try {
    setLocale('en');
    const review = { reviewer: 'codex', date: '2026-10-29', commit: 'abcdef0', verdict: 'not ready' };
    expect(reviewStatus({ version_stage: 'first-version' }, rs())).toBe('First version · not reviewed yet');
    expect(reviewStatus({ version_stage: 'first-version', reviews: [review] }, rs())).toBe('First version · Reviewed 1× (Codex)');
    expect(reviewStatus({ reviews: [review, { ...review, reviewer: 'grok' }] }, rs())).toBe('Reviewed 2× (Codex, Grok)');
    expect(reviewStatus({ version_stage: 'improved', reviews: [review, review] }, rs())).toBe('Improved · Reviewed 2× (Codex)');
    expect(reviewVerdict(review.verdict, rs())).toBe('Not ready');
    for (const locale of ['es', 'pt']) {
      setLocale(locale);
      expect(reviewStatus({ version_stage: 'first-version' }, rs())).not.toContain('First version');
      expect(reviewStatus({ reviews: [review] }, rs())).toContain('1× (Codex)');
      expect(reviewVerdict(review.verdict, rs())).not.toBe('Not ready');
    }
  } finally { setLocale(original); }
});
