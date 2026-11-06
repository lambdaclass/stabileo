import { expect, it } from 'vitest';
import catalog from '../../../../../research/papers.json';
import { SUMMARIES, summaryIn } from '../summaries';

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
