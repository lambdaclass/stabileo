import { describe, expect, it } from 'vitest';
import { MOVED_PAGES, movedAddress, movedRoute } from '../lib/legacy-routes';
import { routeKind } from '../lib/public-route';
import { PUBLIC_LOCALES } from '../lib/i18n/offered';
import { publicPaths } from '../../scripts/public-paths';
import { redirectPage } from '../../scripts/redirect-page';
import { TOOLS } from '../components/tools/registry';

const ORIGIN = 'https://stabileo.com';
const FORMER_EXAMPLES = ['beam-frame', 'slab-on-columns', 'earthquake-frame', 'rc-column', 'outrigger', 'tower'];

describe('the examples moved under the tools', () => {
  it('maps every former example to the tool with the same id, and the index to the tools index', () => {
    expect(MOVED_PAGES).toEqual(['/examples', ...FORMER_EXAMPLES.map(id => `/examples/${id}`)]);
    expect(movedRoute('/examples')).toBe('/tools');
    expect(movedRoute('/examples/')).toBe('/tools');
    for (const id of FORMER_EXAMPLES) expect(movedRoute(`/examples/${id}`)).toBe(`/tools/${id}`);
    for (const path of ['/', '/tools', '/tools/beam-frame', '/blog/examples', '/examplesx']) expect(movedRoute(path), path).toBeNull();
  });

  it('lands each old address on a tool the site publishes, never on one the sitemap lists twice', async () => {
    const paths = await publicPaths();
    for (const from of MOVED_PAGES) {
      expect(paths, from).toContain(movedRoute(from));
      expect(paths, from).not.toContain(from);
    }
    const ids = TOOLS.map(tool => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of FORMER_EXAMPLES) expect(TOOLS.find(tool => tool.id === id)?.kind, id).toBe('model');
  });

  it('keeps the language, the trailing slash, the query and the fragment', () => {
    for (const locale of PUBLIC_LOCALES) {
      for (const id of FORMER_EXAMPLES) {
        expect(movedAddress({ pathname: `/${locale}/examples/${id}/`, search: '?span=8&e2e=1', hash: '#results' }))
          .toBe(`/${locale}/tools/${id}/?span=8&e2e=1#results`);
      }
      expect(movedAddress({ pathname: `/${locale}/examples/`, search: '', hash: '' })).toBe(`/${locale}/tools/`);
    }
    expect(movedAddress({ pathname: '/examples/tower', search: '?topMass=100', hash: '' })).toBe('/tools/tower?topMass=100');
    expect(movedAddress({ pathname: '/en/tools/tower/', search: '', hash: '' })).toBeNull();
  });

  it('routes an old address to the tools page with the new path, before the address bar is rewritten', () => {
    expect(routeKind({ pathname: '/es/examples/outrigger/', search: '?position=0.9', hash: '' })).toEqual({ kind: 'tools', path: '/tools/outrigger' });
    expect(routeKind({ pathname: '/en/examples/', search: '', hash: '' })).toEqual({ kind: 'tools', path: '/tools' });
    expect(routeKind({ pathname: '/en/examples/beam-frame/', search: '', hash: '#data=x' }).kind).toBe('app');
  });

  it('writes a redirect page per language and old address that carries the query on', () => {
    for (const locale of PUBLIC_LOCALES) {
      for (const from of MOVED_PAGES) {
        const to = `/${locale}${movedRoute(from)}/`;
        const html = redirectPage(ORIGIN, locale, from);
        expect(html).toContain(`<html lang="${locale}">`);
        expect(html).toContain('<meta name="robots" content="noindex">');
        expect(html).toContain(`<link rel="canonical" href="${ORIGIN}${to}">`);
        expect(html).toContain(`<script>location.replace(${JSON.stringify(to)} + location.search + location.hash);</script>`);
        expect(html).toContain(`<meta http-equiv="refresh" content="0; url=${to}">`);
        expect(html.indexOf('location.replace')).toBeLessThan(html.indexOf('http-equiv'));
      }
    }
    expect(() => redirectPage(ORIGIN, 'en', '/tools/beam-frame')).toThrow();
  });
});
