import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { RESEARCH_TOOLS_PATHS, searchMeta, searchHead, TOOL_SLUGS, url } from '../seo/research-tools';
import { PUBLIC_LOCALES } from '../../src/lib/i18n/offered';
import { EXPERIMENTS } from '../../src/components/research/experiments';
import { RELATED, relatedPaths } from '../../src/components/research/related';
import { TOOL_IDS } from '../../src/components/tools/calculators';
import { BATCH_IDS } from '../../src/components/tools/batch';

describe('Research and Tools search coverage', () => {
  it('covers every runnable paper and calculator, with no duplicate routes', () => {
    expect(new Set(RESEARCH_TOOLS_PATHS).size).toBe(27);
    expect(TOOL_SLUGS).toEqual([...TOOL_IDS, ...BATCH_IDS]);
    for (const e of EXPERIMENTS) expect(RESEARCH_TOOLS_PATHS).toContain(e.path);
  });
  for (const locale of PUBLIC_LOCALES) {
    it(`${locale}: unique, bounded, localized copy for every page`, () => {
      const metas = RESEARCH_TOOLS_PATHS.map(path => searchMeta(path, locale));
      expect(new Set(metas.map(m => m.title)).size).toBe(metas.length);
      expect(new Set(metas.map(m => m.description)).size).toBe(metas.length);
      for (const [i, m] of metas.entries()) {
        expect(m.title.length, m.title).toBeLessThanOrEqual(60);
        expect(m.description.length, m.description).toBeLessThanOrEqual(155);
        if (locale !== 'en') expect(m.description).not.toBe(searchMeta(RESEARCH_TOOLS_PATHS[i], 'en').description);
      }
    });
    it(`${locale}: canonical, reciprocal alternates and valid schema shapes`, () => {
      for (const path of RESEARCH_TOOLS_PATHS) {
        const m = searchMeta(path, locale);
        expect(m.canonical).toBe(url(path, locale));
        expect(m.alternates).toEqual([...PUBLIC_LOCALES.map(l => ({ hreflang: l, href: url(path, l) })), { hreflang: 'x-default', href: url(path, 'en') }]);
        const html = searchHead('<title>Old</title><meta name="description" content="old"><link rel="canonical" href="wrong"><script type="application/ld+json">{}</script>', path, locale);
        expect(html.match(/<title>/g)).toHaveLength(1);
        expect(html.match(/rel="canonical"/g)).toHaveLength(1);
        const graph = JSON.parse(html.match(/<script[^>]*>(.*?)<\/script>/s)![1]);
        expect(graph['@context']).toBe('https://schema.org');
        const [crumb, entity] = graph['@graph'];
        expect(crumb['@type']).toBe('BreadcrumbList');
        expect(crumb.itemListElement.at(-1).item).toBe(m.canonical);
        for (const [i, item] of crumb.itemListElement.entries()) {
          expect(item['@type']).toBe('ListItem'); expect(item.position).toBe(i + 1); expect(item.name).toBeTruthy();
        }
        if (path === '/research' || path === '/tools') {
          expect(entity['@type']).toBe('ItemList');
          expect(entity.numberOfItems).toBe(path === '/research' ? 17 : 8);
          expect(entity.itemListElement.map((x: {url: string}) => x.url)).toEqual(RESEARCH_TOOLS_PATHS.filter(p => p.startsWith(path + '/')).map(p => url(p, locale)));
        } else if (path.startsWith('/research/')) {
          expect(entity['@type']).toBe('TechArticle');
          expect(entity.citation['@type']).toBe('ScholarlyArticle');
          expect(entity.citation.url).toMatch(/^https:\/\/doi.org\/10\./);
          expect(entity.citation.name).toBeTruthy();
          expect(entity.isBasedOn).toBe(entity.citation.url);
          expect(entity.inLanguage).toBe(locale);
        } else {
          expect(entity['@type']).toBe('WebApplication');
          expect(entity.offers).toEqual({ '@type': 'Offer', price: 0, priceCurrency: 'USD' });
          expect(entity.isAccessibleForFree).toBe(true);
        }
        const asset = m.image.replace('https://stabileo.com/', 'public/');
        expect(existsSync(asset) || existsSync(asset.replace(/\.png$/, '.svg')), asset).toBe(true);
        expect(html).toContain(`content="${m.ogLocale}"`);
      }
    });
  }
  it('keeps topic links reciprocal and all targets published', () => {
    for (const [tool, papers] of Object.entries(RELATED)) for (const paper of papers) {
      const path = `/research/${paper}`;
      expect(RESEARCH_TOOLS_PATHS).toContain(path);
      expect(relatedPaths(path)).toContain(`/tools/${tool}`);
      expect(relatedPaths(`/tools/${tool}`)).toContain(path);
    }
  });
  it('prerenders and sitemaps the shared inventory in every locale', () => {
    const source = readFileSync('scripts/prerender.ts', 'utf8');
    expect(source).toContain("if (RESEARCH_TOOLS_PATHS.includes(path) ||");
    expect(source).toContain("'/paper', ...RESEARCH_TOOLS_PATHS]");
    expect(source).toContain('<lastmod>');
    expect(source).toContain('Allow: /');
  });
});
