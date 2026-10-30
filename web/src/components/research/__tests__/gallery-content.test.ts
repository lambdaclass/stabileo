import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Gallery from '../Gallery.svelte';
import { publicI18n, setLocale } from '../../../lib/i18n/store.svelte';
import { EXPERIMENTS } from '../experiments';
import catalog from '../../../../../research/papers.json';
import { bibliography, citation } from '../catalogue';
import { reviewCount, reviewLabel } from '../reviews';
import { rs } from '../i18n';

const original = publicI18n.locale;
afterEach(() => setLocale(original));
it('renders citations without empty separators and descriptive leads for every live card', () => {
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
    setLocale(locale);
    const { body } = render(Gallery);
    const cards = [...body.matchAll(/<li class="rs-g-runcard[^>]*>([\s\S]*?)<\/li>/g)];
    expect(cards).toHaveLength(EXPERIMENTS.length);
    for (const [card] of cards) {
      const byline = card.match(/<p class="rs-g-by[^>]*>([\s\S]*?)<\/p>/)![1].replace(/<[^>]*>/g, '');
      expect(byline).not.toMatch(/(?:[,·]\s*[,·]|\.\s+[,·])/);
      const lead = card.match(/<p class="rs-g-hook[^>]*>([\s\S]*?)<\/p>/)![1].replace(/<[^>]*>/g, '');
      expect(lead.length).toBeGreaterThan(30);
      expect(lead).not.toMatch(/^(First version|Primera versión|Primeira versão).*\d+ (reviews|revisiones|revisões)/);
    }
  }
});
/** Papers whose second review round (Kimi, Codex, Claude; 2026-10-30) is fixed and recorded. */
const SECOND_ROUND = new Set(['andreassen-2011']);
it.each(EXPERIMENTS)('$paperId has authors, publication, year and its completed review rounds', e => {
  const paper = catalog.papers.find(p => p.id === e.paperId)!;
  const b = bibliography(paper);
  expect(b.authors.length).toBeGreaterThan(0);
  expect(b.venue.trim()).not.toBe('');
  expect(b.year).toBeGreaterThan(1800);
  expect(citation(paper)).not.toMatch(/,\s*,/);
  expect(reviewCount(e.paperId)).toBe(SECOND_ROUND.has(e.paperId) ? 2 : 1);
  expect(paper.reviews).toContainEqual({ round: 1, reviewers: ['codex', 'kimi'], date: '2026-10-30' });
});
it('omits absent bibliographic fields without dangling separators', () => {
  expect(citation({ crossref: { title: 'Book', authors: [], venue: '', year: 1979 } })).toBe('1979');
});
it('translates the gallery scope and review labels in all six locales', () => {
  const titles = new Set<string>();
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
    setLocale(locale);
    titles.add(rs().researchTitle);
    expect(rs().galleryLead.length).toBeGreaterThan(80);
    expect(rs().galleryLead).toContain('Stabileo');
    expect(reviewLabel('tools-batch-1', locale)).toContain('1');
    expect(reviewLabel('tools-batch-2', locale)).toContain('1');
  }
  expect(titles.size).toBe(6);
});
