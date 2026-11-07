import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import catalog from '../../../../../research/papers.json';
import Gallery from '../Gallery.svelte';
import { EXPERIMENTS } from '../experiments';
import { bibliography } from '../catalogue';
import { RESEARCH_PAPER_PATHS, researchLastReview, researchLocales } from '../locales';
import { galleryGraph, paperMeta, paperTitle } from '../meta';
import { PAPER_PUBLISHED, publishedLocale, publishedLocales } from '../../../lib/i18n/published';
import { PAPER_LOCALES } from '../../paper/locales';
import { PUBLIC_LOCALES } from '../../../lib/i18n/offered';
import { publicI18n, setLocale, type PublicLocale } from '../../../lib/i18n/store.svelte';

const labels = { research: 'Research', researchTitle: 'Research in structural engineering' };
const original = publicI18n.locale;
afterEach(() => setLocale(original));

it('publishes every paper page, in English at least and never in a language without research copy', () => {
  expect([...RESEARCH_PAPER_PATHS].sort()).toEqual(EXPERIMENTS.map((e) => e.path).sort());
  for (const path of ['/research', ...RESEARCH_PAPER_PATHS]) {
    const locales = researchLocales(path);
    expect(locales).toContain('en');
    for (const locale of ['de', 'fr', 'tr'] as PublicLocale[]) {
      const published = locales.includes(locale) && PUBLIC_LOCALES.includes(locale);
      expect(publishedLocales(path).includes(locale)).toBe(published);
      expect(publishedLocale(path, locale)).toBe(published ? locale : 'en');
    }
  }
  expect(researchLocales('/research/benchmarks/shell-obstacle-course')).toEqual(['en']);
  expect(researchLocales('/research/stability/ferrari-sigmund-2025')).toEqual(['en', 'es', 'pt']);
  expect(researchLocales('/research/benchmarks/lee-frame-1968')).toEqual(['en', 'es', 'pt', 'de', 'fr', 'tr']);
  expect(publishedLocale('/research/benchmarks/shell-obstacle-course', 'es')).toBe('en');
  expect(publishedLocale('/research/stability/ferrari-sigmund-2025', 'de')).toBe('en');
  expect(publishedLocale('/research/benchmarks/lee-frame-1968#edit', 'es')).toBe('es');
});

it('publishes /paper in the languages PaperPage declares', () => {
  expect(PAPER_PUBLISHED).toEqual(PAPER_LOCALES);
  expect(publishedLocales('/paper')).toEqual(PAPER_LOCALES);
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
    const own = publishedLocale(e.path, locale);
    const url = `https://stabileo.com/${own}${e.path}/`;
    expect(meta.path).toBe(e.path);
    expect(meta.written).toEqual(researchLocales(e.path));
    expect(meta.title).toMatch(/^A page name .*— Stabileo Research$/);
    expect(meta.title).toContain(String(bibliography(paper).year));
    expect(meta.description).toBe('What the page reproduces and how it was checked.');
    const article = meta.graph.find((n) => (n as { '@id'?: string })['@id'] === `${url}#article`) as Record<string, unknown>;
    expect(article).toMatchObject({ '@type': 'ScholarlyArticle', url, inLanguage: own, name: 'A page name', isBasedOn: { '@id': `https://doi.org/${paper.doi}` } });
    expect(article.citation).toMatchObject({
      '@type': 'ScholarlyArticle',
      '@id': `https://doi.org/${paper.doi}`,
      name: paper.crossref.title,
      datePublished: String(bibliography(paper).year),
      identifier: { propertyID: 'DOI', value: paper.doi },
    });
    const crumbs = meta.graph.find((n) => (n as { '@type'?: string })['@type'] === 'BreadcrumbList') as { itemListElement: { item: string }[] };
    expect(crumbs.itemListElement.at(-1)!.item).toBe(url);
  }
});

it('does not repeat a credit the page name already carries, and only then', () => {
  expect(paperTitle('Lee frame (1968)', 'lee-frame-1968', 'en')).toBe('Lee frame (1968) — Stabileo Research');
  expect(paperTitle('Topology optimization of an MBB beam', 'andreassen-2011', 'en')).toBe('Topology optimization of an MBB beam (Andreassen et al. 2011) — Stabileo Research');
  expect(paperTitle('Frame of 19680 bars', 'lee-frame-1968', 'en')).toMatch(/\(Lee et al\. 1968\) — Stabileo Research$/);
  expect(paperTitle('Benchmark 1968', 'lee-frame-1968', 'en')).toMatch(/\(Lee et al\. 1968\) — Stabileo Research$/);
});

it('dates Andreassen by the volume the paper is cited in (Struct Multidisc Optim 43, 2011), not Crossref\'s online date', () => {
  const entry = catalog.papers.find((p) => p.id === 'andreassen-2011')!;
  expect(entry.crossref.year).toBe(2010);
  const meta = paperMeta({ paperId: 'andreassen-2011', name: 'MBB beam', lead: 'x' }, 'en', labels);
  const article = meta.graph.find((n) => (n as { '@id'?: string })['@id']?.endsWith('#article')) as { citation: { datePublished: string } };
  expect(meta.title).toContain('(Andreassen et al. 2011)');
  expect(article.citation.datePublished).toBe('2011');
});

it('cuts headlines at 110 characters, never inside a surrogate pair', () => {
  const meta = paperMeta({ paperId: 'andreassen-2011', name: `${'a'.repeat(109)}𝜎𝜎`, lead: 'x' }, 'en', labels);
  const article = meta.graph.find((n) => (n as { '@id'?: string })['@id']?.endsWith('#article')) as { headline: string };
  expect([...article.headline]).toHaveLength(110);
  expect(article.headline.endsWith('𝜎')).toBe(true);
});

it('joins two authors with the conjunction of the page language', () => {
  expect(paperTitle('Springs', 'grossman-2026', 'en')).toBe('Springs (Grossman & Boudaoud 2026) — Stabileo Research');
  expect(paperTitle('Resortes', 'grossman-2026', 'es')).toBe('Resortes (Grossman y Boudaoud 2026) — Stabileo Research');
  expect(paperTitle('Molas', 'grossman-2026', 'pt')).toBe('Molas (Grossman e Boudaoud 2026) — Stabileo Research');
  expect(paperMeta({ paperId: 'ferrari-2025', name: 'Pandeo', lead: 'x' }, 'es', labels).title).toBe('Pandeo (Ferrari y Sigmund 2025) — Stabileo Research');
});

it('lists every paper in the gallery graph at the URL it is published under', () => {
  const graph = galleryGraph('es', labels);
  const items = (graph[0] as { mainEntity: { itemListElement: { url: string }[] } }).mainEntity.itemListElement.map((i) => i.url);
  expect(items).toContain('https://stabileo.com/es/research/benchmarks/lee-frame-1968/');
  expect(items).toContain('https://stabileo.com/en/research/benchmarks/shell-obstacle-course/');
  expect(items).toContain('https://stabileo.com/es/research/benchmarks/riks-crisfield/');
  expect(items).toHaveLength(EXPERIMENTS.length);
});

it('names each gallery graph item with the title its card shows, in every published language', () => {
  const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  for (const locale of researchLocales('/research') as PublicLocale[]) {
    setLocale(locale);
    const { body } = render(Gallery);
    const shown = [...body.matchAll(/<li class="rs-g-runcard[^"]*">[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(([, h]) => decode(h.replace(/<[^>]*>/g, '').trim()));
    const graph = galleryGraph(locale, labels);
    const named = (graph[0] as { mainEntity: { itemListElement: { name: string }[] } }).mainEntity.itemListElement.map((i) => i.name);
    expect(shown).toHaveLength(EXPERIMENTS.length);
    expect(named, locale).toEqual(shown);
  }
});

it('links each gallery card to a URL the paper is published under', () => {
  for (const locale of ['en', 'es', 'pt']) {
    setLocale(locale);
    const { body } = render(Gallery);
    for (const e of EXPERIMENTS) {
      const published = `/${publishedLocale(e.path, locale as PublicLocale)}${e.path}/`;
      expect(body, `${locale} ${e.path}`).toContain(`href="${published}"`);
      for (const other of ['en', 'es', 'pt'].filter((l) => !researchLocales(e.path).includes(l))) {
        expect(body, `${locale} links ${e.path} in ${other}`).not.toContain(`href="/${other}${e.path}/"`);
      }
    }
  }
});
