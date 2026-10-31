import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import catalog from '../../../../../research/papers.json';
import Gallery from '../Gallery.svelte';
import { EXPERIMENTS } from '../experiments';
import { RESEARCH_PAPER_PATHS, researchLastReview, researchLocales, supportsResearchRoute } from '../locales';
import { galleryGraph, paperMeta, paperTitle, researchUrlLocale } from '../meta';
import { publicI18n, setLocale, type PublicLocale } from '../../../lib/i18n/store.svelte';

const labels = { research: 'Research', researchTitle: 'Research in structural engineering' };
const original = publicI18n.locale;
afterEach(() => setLocale(original));

it('publishes every paper page, in English at least and never in a language without research copy', () => {
  expect([...RESEARCH_PAPER_PATHS].sort()).toEqual(EXPERIMENTS.map((e) => e.path).sort());
  for (const path of ['/research', ...RESEARCH_PAPER_PATHS]) {
    const locales = researchLocales(path);
    expect(locales).toContain('en');
    for (const locale of ['de', 'fr', 'tr']) expect(supportsResearchRoute(path, locale)).toBe(false);
  }
  expect(researchLocales('/research/benchmarks/riks-crisfield')).toEqual(['en']);
  expect(researchLocales('/research/benchmarks/lee-frame-1968')).toEqual(['en', 'es', 'pt']);
  expect(supportsResearchRoute('/tools', 'de')).toBe(true);
});

it('dates each research page by its latest review, not by the build', () => {
  expect(researchLastReview('/research/benchmarks/lee-frame-1968')).toBe('2026-10-30');
  expect(researchLastReview('/research')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(researchLastReview('/research/no-such-paper')).toBeUndefined();
});

it.each(EXPERIMENTS)('$paperId states a self canonical path, its title and a citation of the original paper by DOI', (e) => {
  const paper = catalog.papers.find((p) => p.id === e.paperId)!;
  for (const locale of ['en', 'es', 'de'] as PublicLocale[]) {
    const meta = paperMeta({ paperId: e.paperId, name: 'A page name', lead: 'What the page reproduces and how it was checked.' }, locale, labels);
    const own = researchUrlLocale(e.path, locale);
    const url = `https://stabileo.com/${own}${e.path}/`;
    expect(meta.path).toBe(e.path);
    expect(meta.written).toEqual(researchLocales(e.path));
    expect(meta.title).toMatch(/^A page name .*— Stabileo Research$/);
    expect(meta.title).toContain(String(paper.crossref.year));
    expect(meta.description).toBe('What the page reproduces and how it was checked.');
    const article = meta.graph.find((n) => (n as { '@id'?: string })['@id'] === `${url}#article`) as Record<string, unknown>;
    expect(article).toMatchObject({ '@type': 'ScholarlyArticle', url, inLanguage: own, name: 'A page name', isBasedOn: { '@id': `https://doi.org/${paper.doi}` } });
    expect(article.citation).toMatchObject({
      '@type': 'ScholarlyArticle',
      '@id': `https://doi.org/${paper.doi}`,
      name: paper.crossref.title,
      datePublished: String(paper.crossref.year),
      identifier: { propertyID: 'DOI', value: paper.doi },
    });
    const crumbs = meta.graph.find((n) => (n as { '@type'?: string })['@type'] === 'BreadcrumbList') as { itemListElement: { item: string }[] };
    expect(crumbs.itemListElement.at(-1)!.item).toBe(url);
  }
});

it('does not repeat the year a page name already carries', () => {
  expect(paperTitle('Lee frame (1968)', 'lee-frame-1968')).toBe('Lee frame (1968) — Stabileo Research');
  expect(paperTitle('Topology optimization of an MBB beam', 'andreassen-2011')).toBe('Topology optimization of an MBB beam (Andreassen et al. 2010) — Stabileo Research');
});

it('lists every paper in the gallery graph at the URL it is published under', () => {
  const graph = galleryGraph('es', labels);
  const items = (graph[0] as { mainEntity: { itemListElement: { url: string }[] } }).mainEntity.itemListElement.map((i) => i.url);
  expect(items).toContain('https://stabileo.com/es/research/benchmarks/lee-frame-1968/');
  expect(items).toContain('https://stabileo.com/en/research/benchmarks/riks-crisfield/');
  expect(items).toHaveLength(EXPERIMENTS.length);
});

it('links each gallery card to a URL the paper is published under', () => {
  for (const locale of ['en', 'es', 'pt']) {
    setLocale(locale);
    const { body } = render(Gallery);
    for (const e of EXPERIMENTS) {
      const published = `/${researchUrlLocale(e.path, locale as PublicLocale)}${e.path}/`;
      expect(body, `${locale} ${e.path}`).toContain(`href="${published}"`);
      for (const other of ['en', 'es', 'pt'].filter((l) => !researchLocales(e.path).includes(l))) {
        expect(body, `${locale} links ${e.path} in ${other}`).not.toContain(`href="/${other}${e.path}/"`);
      }
    }
  }
});
