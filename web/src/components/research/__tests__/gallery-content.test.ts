import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Gallery from '../Gallery.svelte';
import { publicI18n, setLocale } from '../../../lib/i18n/store.svelte';
import { EXPERIMENTS } from '../experiments';
import catalog from '../../../../../research/papers.json';
import { bibliography, citation } from '../catalogue';
import { finalReview, reviewCount } from '../reviews';
import { rs } from '../i18n';
import { PUBLIC_LOCALES } from '../../../lib/i18n/offered';

const original = publicI18n.locale;
afterEach(() => setLocale(original));
it('renders citations without empty separators and descriptive leads for every live card', () => {
  for (const locale of PUBLIC_LOCALES) {
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
const SECOND_ROUND = new Set(['mattiasson-elastica', 'ferrari-2025', 'shauer-2025', 'grossman-2026', 'fairclough-2026', 'zmyslony-2026', 'pastrana-2026', 'riks-1979', 'horne-1979', 'macneal-harder-1985', 'cqc-1981', 'newmark-1959', 'navier-plate', 'dadeppo-arch-1975', 'lee-frame-1968', 'andreassen-2011']);
const ROUNDS: Record<string, number> = { 'mattiasson-elastica': 3 };
const AWAITING_REVIEW = new Set(['gay-neto-2014', 'feher-sipos-varkonyi-2026']);
const REVIEWED = EXPERIMENTS.filter(e => !AWAITING_REVIEW.has(e.paperId));
const REVIEW_NOTE = /First version|Primera versión|Primeira versão|Erste Version|Première version|İlk sürüm|review rounds?\b|rondas? de revisión|rodadas? de revisão|Prüfrunden?|cycles? de revue|inceleme turu/;
it.each(EXPERIMENTS)('$paperId has authors, publication, year and its completed review rounds', e => {
  const paper = catalog.papers.find(p => p.id === e.paperId)!;
  const b = bibliography(paper);
  expect(b.authors.length).toBeGreaterThan(0);
  expect(b.venue.trim()).not.toBe('');
  expect(b.year).toBeGreaterThan(1800);
  expect(citation(paper)).not.toMatch(/,\s*,/);
  if (AWAITING_REVIEW.has(e.paperId)) {
    expect(paper.reviews ?? []).toEqual([]);
    return;
  }
  expect(reviewCount(e.paperId)).toBe(ROUNDS[e.paperId] ?? (SECOND_ROUND.has(e.paperId) ? 2 : 1));
  expect(paper.reviews).toContainEqual({ round: 1, reviewers: ['codex', 'kimi'], date: '2026-10-30' });
  if (SECOND_ROUND.has(e.paperId)) {
    const second = (paper.reviews ?? []).filter(r => r.round === 2);
    expect(second.every(r => r.date === '2026-10-30')).toBe(true);
    expect(new Set(second.flatMap(r => r.reviewers ?? [r.reviewer]))).toEqual(new Set(['kimi', 'codex', 'claude']));
  }
});
it('omits absent bibliographic fields without dangling separators', () => {
  expect(citation({ crossref: { title: 'Book', authors: [], venue: '', year: 1979 } })).toBe('1979');
});
it('translates the gallery scope in all six locales', () => {
  const titles = new Set<string>();
  for (const locale of PUBLIC_LOCALES) {
    setLocale(locale);
    titles.add(rs().researchTitle);
    expect(rs().galleryLead.length).toBeGreaterThan(80);
    expect(rs().galleryLead).toContain('Stabileo');
  }
  expect(titles.size).toBe(PUBLIC_LOCALES.length);
});
it('shows no first-version or review-round note on any card, while the catalogue keeps the records', () => {
  expect(finalReview('mattiasson-elastica')).toBe(true);
  for (const e of REVIEWED) expect(reviewCount(e.paperId)).toBeGreaterThan(0);
  expect(reviewCount('tools-batch-1')).toBe(2);
  expect(reviewCount('tools-batch-2')).toBe(2);
  for (const locale of PUBLIC_LOCALES) {
    setLocale(locale);
    const { body } = render(Gallery);
    expect(body).not.toContain('rs-g-first');
    expect(body.replace(/<[^>]*>/g, ' ')).not.toMatch(REVIEW_NOTE);
  }
});

it('titles the Riks card in the language its article is written in', async () => {
  const { cardTitle } = await import('../card-title');
  const { articleStrings } = await import('../riksCrisfield/article');
  const riks = EXPERIMENTS.find((e) => e.paperId === 'riks-1979')!;
  for (const locale of PUBLIC_LOCALES) {
    setLocale(locale);
    expect(cardTitle(riks)).toBe(articleStrings(locale).arcLengthSnapThroughRiksAndCrisfield);
    const { body } = render(Gallery);
    expect(body).toContain(articleStrings(locale).arcLengthSnapThroughRiksAndCrisfield);
  }
});

it('names each thumbnail link by its localized card title and keeps the image decorative', async () => {
  const { cardTitle } = await import('../card-title');
  for (const locale of ['en', 'es', 'pt']) {
    setLocale(locale);
    const { body } = render(Gallery);
    const thumbs = [...body.matchAll(/<a[^>]*class="rs-g-thumb[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(thumbs).toHaveLength(EXPERIMENTS.length);
    for (const [link, inner] of thumbs) {
      expect(EXPERIMENTS.some((e) => link.includes(`aria-label="${cardTitle(e).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`))).toBe(true);
      for (const [img] of inner.matchAll(/<img[^>]*>/g)) expect(img).toContain('alt=""');
    }
  }
});

it('#1886: the Fehér card shows its own localized lead', async () => {
  const { translations } = await import('../feher2026/strings');
  for (const locale of ['en', 'es', 'pt']) {
    setLocale(locale);
    const { body } = render(Gallery);
    const cards = [...body.matchAll(/<li class="rs-g-runcard[^>]*>([\s\S]*?)<\/li>/g)];
    const card = cards.find(([html]) => html.includes('/research/stability/feher-sipos-varkonyi-2026'))![0];
    const lead = card.match(/<p class="rs-g-hook[^>]*>([\s\S]*?)<\/p>/)![1].replace(/<[^>]*>/g, '');
    expect(lead).toBe(translations[locale].lead);
  }
});
