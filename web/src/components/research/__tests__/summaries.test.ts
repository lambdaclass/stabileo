import { expect, it } from 'vitest';
import catalog from '../../../../../research/papers.json';
import { SUMMARIES, summaryIn } from '../summaries';
import { CATALOGUE_SUMMARIES, summaryIn as catalogueSummaryIn } from '../catalogue-summaries';
import { EXPERIMENTS } from '../experiments';

it('translates every catalogue summary into Spanish and Portuguese from its current English text', () => {
  for (const p of catalog.papers.filter((p) => p.summary && p.summary_source)) {
    expect(SUMMARIES[p.id]?.en, `${p.id}: papers.yaml summary changed; retranslate it in summaries.ts`).toBe(p.summary);
    for (const locale of ['es', 'pt']) expect(summaryIn(p, locale), `${locale} ${p.id}`).not.toBe(p.summary);
    expect(summaryIn(p, 'en')).toBe(p.summary);
  }
});

it('shows the English summary rather than a stale translation once the English text changes', () => {
  expect(summaryIn({ id: 'cqc-1981', summary: 'A rewritten summary.' }, 'es')).toBe('A rewritten summary.');
});

it('ships exactly the summaries rendered below the runnable cards and preserves their translations', () => {
  const live = new Set(EXPERIMENTS.map(e => e.paperId));
  const papers = catalog.papers.filter(p => !live.has(p.id) && p.summary && p.summary_source);
  expect(Object.keys(CATALOGUE_SUMMARIES).sort()).toEqual(papers.map(p => p.id).sort());
  for (const paper of papers) {
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
      expect(catalogueSummaryIn(paper, locale)).toBe(summaryIn(paper, locale));
    }
    const rewritten = { ...paper, summary: 'A rewritten summary.' };
    expect(catalogueSummaryIn(rewritten, 'es')).toBe(rewritten.summary);
  }
});
