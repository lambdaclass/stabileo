import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_LOCALES } from '../../i18n/offered';
import { ALL_DICTS } from '../../i18n/locales/all';
import { RESEARCH_META } from '../../research-meta';
import { landingGraph } from '../../landing-schema';
import { STANDING_PAGES, findStandingPage } from '../../blog/pages';
import { POSTS, inLocale } from '../../blog';
import { routeKind } from '../../public-route';
import { publicPaths, LAST_MODIFIED, POST_DATE } from '../../../../scripts/public-pages';
import { sitemapXml } from '../../../../scripts/sitemap';

describe('public positioning', () => {
  for (const locale of PUBLIC_LOCALES) {
    it(`${locale}: landing metadata and software JSON-LD are complete and honest`, () => {
      const dict = ALL_DICTS[locale];
      const description = dict['landing.metaDescription'];
      expect(description.length).toBeGreaterThanOrEqual(70);
      expect(description.length).toBeLessThanOrEqual(160);
      expect(dict['landing.metaTitle']).toContain('Stabileo');
      const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': landingGraph(locale, description) });
      const graph = JSON.parse(json)['@graph'];
      const app = graph.find((node: { '@type': string }) => node['@type'] === 'SoftwareApplication');
      expect(app).toMatchObject({ name: 'Stabileo', applicationCategory: 'EngineeringApplication',
        operatingSystem: 'Web, Windows, macOS, Linux', offers: { price: 0 },
        license: 'https://www.gnu.org/licenses/agpl-3.0.html', url: `https://stabileo.com/${locale}/`,
        sameAs: 'https://github.com/lambdaclass/stabileo', publisher: { name: 'Ergodic Group' } });
      expect(graph.some((node: { '@type': string }) => node['@type'] === 'Organization')).toBe(true);
      expect(json).not.toContain('aggregateRating');
    });
    it(`${locale}: all editorial pages have titles and descriptions`, () => {
      for (const page of STANDING_PAGES) {
        const body = inLocale(page.i18n, locale);
        expect(body.title.trim(), page.path).not.toBe('');
        expect(body.description.trim(), page.path).not.toBe('');
        if (page.path.startsWith('/alternatives/')) {
          expect(page.i18n[locale]).toBeDefined();
          expect(body.description.length).toBeGreaterThanOrEqual(70);
          expect(body.description.length).toBeLessThanOrEqual(160);
          expect(JSON.stringify(body)).toContain('.s2k');
          expect(JSON.stringify(body)).toContain('.e2k');
        }
      }
      expect(ALL_DICTS[locale]['blog.indexTitle'].trim()).not.toBe('');
      expect(ALL_DICTS[locale]['blog.lead'].trim()).not.toBe('');
      for (const meta of Object.values(RESEARCH_META)) {
        expect(meta.title.trim()).not.toBe('');
        expect(meta.description.length).toBeGreaterThanOrEqual(70);
        expect(meta.description.length).toBeLessThanOrEqual(160);
      }
      for (const post of POSTS) {
        const body = inLocale(post.i18n, locale);
        expect(body.title.trim(), post.slug).not.toBe('');
        expect(body.excerpt.trim(), post.slug).not.toBe('');
      }
    });
  }

  it('keeps legacy SAP2000 links as aliases of the current page', async () => {
    expect(findStandingPage('/sap2000-alternative/')).toBe(findStandingPage('/alternatives/sap2000'));
    expect(findStandingPage('/sap2000-alternative')?.path).toBe('/alternatives/sap2000');
    expect(routeKind({ pathname: '/es/sap2000-alternative/', search: '', hash: '' }).kind).toBe('blog');
    expect(await publicPaths()).not.toContain('/sap2000-alternative');
    expect(STANDING_PAGES.some((p) => p.path === '/sap2000-alternative')).toBe(false);
  });

  it('keeps substantive dates across builds and omits unknown dates', async () => {
    vi.useFakeTimers();
    try {
      const builds: string[] = [];
      for (const day of ['2026-10-29', '2026-11-10']) {
        vi.setSystemTime(new Date(day));
        const paths = await publicPaths();
        for (const post of POSTS) {
          expect(LAST_MODIFIED.get(`/blog/${post.slug}`)).toBe(post.updated ?? post.date);
          expect(POST_DATE.get(`/blog/${post.slug}`)).toBe(post.date);
        }
        for (const page of STANDING_PAGES) expect(LAST_MODIFIED.get(page.path)).toBe(page.updated);
        builds.push(sitemapXml(paths.map((path) => `/en${path === '/' ? '' : path}/`), LAST_MODIFIED));
      }
      expect(builds[0]).toBe(builds[1]);
      expect(sitemapXml(['/en/', '/en/research/'], LAST_MODIFIED)).not.toContain('<lastmod>');
    } finally {
      vi.useRealTimers();
    }
  });

  it('includes every canonical URL exactly once, with reciprocal language alternates and content dates', async () => {
    const paths = await publicPaths();
    for (const path of ['/alternatives/sap2000', '/alternatives/etabs', ...STANDING_PAGES.map((p) => p.path), ...POSTS.map((p) => `/blog/${p.slug}`)]) expect(paths).toContain(path);
    const written = ['/', ...PUBLIC_LOCALES.flatMap((locale) => paths.map((path) => `/${locale}${path === '/' ? '' : path}/`))];
    const xml = sitemapXml(written, LAST_MODIFIED);
    const doc = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
    const locs = doc.map((entry) => entry.match(/<loc>(.*?)<\/loc>/)![1]);
    expect(locs.sort()).toEqual(written.filter((path) => path !== '/').map((path) => `https://stabileo.com${path}`).sort());
    for (const entry of doc) {
      const href = entry.match(/<loc>(.*?)<\/loc>/)![1];
      const path = new URL(href).pathname;
      expect(routeKind({ pathname: path, search: '', hash: '' }).kind).not.toBe('app');
      const modified = LAST_MODIFIED.get(path.replace(/^\/[a-z]{2}/, '').replace(/\/$/, '') || '/');
      if (modified) expect(entry).toContain(`<lastmod>${modified}</lastmod>`);
      else expect(entry).not.toContain('<lastmod>');
      for (const locale of [...PUBLIC_LOCALES, 'x-default']) {
        const alternate = entry.match(new RegExp(`hreflang="${locale}" href="([^"]+)"`))![1];
        expect(locs).toContain(alternate);
        expect(doc.find((e) => e.includes(`<loc>${alternate}</loc>`))).toContain(`href="${href}"`);
      }
    }
  });
});
