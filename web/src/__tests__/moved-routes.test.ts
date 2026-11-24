import { buildFeatures } from '../../config/public-features.mjs';
import { describe, expect, it } from 'vitest';
import { MOVED_PAGES, movedAddress, movedRoute } from '../lib/legacy-routes';
import { routeKind } from '../lib/public-route';
import { PUBLIC_LOCALES } from '../lib/i18n/offered';
import { publicPaths } from '../../scripts/public-paths';
import { redirectPage } from '../../scripts/redirect-page';
import { TOOLS } from '../components/tools/registry';

const flags = buildFeatures();
const ORIGIN = 'https://stabileo.com';
const FORMER_EXAMPLES = ['beam-frame', 'slab-on-columns', 'earthquake-frame', 'rc-column', 'outrigger', 'tower'];

describe('the examples moved under the tools', () => {
  it('maps every former example to the tool with the same id, and the index to the tools index', () => {
    expect(MOVED_PAGES).toEqual(['/examples', ...FORMER_EXAMPLES.map(id => `/examples/${id}`)]);
    expect(movedRoute('/examples')).toBe(flags.tools ? '/tools' : null);
    expect(movedRoute('/examples/')).toBe(flags.tools ? '/tools' : null);
    for (const id of FORMER_EXAMPLES) expect(movedRoute(`/examples/${id}`)).toBe(flags.tools ? `/tools/${id}` : null);
    for (const path of ['/', '/tools', '/tools/beam-frame', '/blog/examples', '/examplesx']) expect(movedRoute(path), path).toBeNull();
  });

  it('lands each old address on a tool the site publishes, never on one the sitemap lists twice', async () => {
    const paths = await publicPaths();
    for (const from of MOVED_PAGES) {
      const to = from.replace(/^\/examples/, '/tools');
      expect(paths.includes(to), to).toBe(flags.tools || to === '/tools');
      expect(paths.includes(from), from).toBe(!flags.tools);
    }
    const ids = TOOLS.map(tool => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of FORMER_EXAMPLES) expect(TOOLS.find(tool => tool.id === id)?.kind, id).toBe('model');
  });

  it('keeps the language, the trailing slash, the query and the fragment', () => {
    for (const locale of PUBLIC_LOCALES) {
      for (const id of FORMER_EXAMPLES) {
        expect(movedAddress({ pathname: `/${locale}/examples/${id}/`, search: '?span=8&e2e=1', hash: '#results' }))
          .toBe(flags.tools ? `/${locale}/tools/${id}/?span=8&e2e=1#results` : null);
      }
      expect(movedAddress({ pathname: `/${locale}/examples/`, search: '', hash: '' })).toBe(flags.tools ? `/${locale}/tools/` : null);
    }
    expect(movedAddress({ pathname: '/examples/tower', search: '?topMass=100', hash: '' })).toBe(flags.tools ? '/tools/tower?topMass=100' : null);
    expect(movedAddress({ pathname: '/en/tools/tower/', search: '', hash: '' })).toBeNull();
  });

  it('routes an old address to the tools page with the new path, before the address bar is rewritten', () => {
    expect(routeKind({ pathname: '/es/examples/outrigger/', search: '?position=0.9', hash: '' })).toEqual(flags.tools ? { kind: 'tools', path: '/tools/outrigger' } : { kind: 'examples', path: '/examples/outrigger' });
    expect(routeKind({ pathname: '/en/examples/', search: '', hash: '' })).toEqual(flags.tools ? { kind: 'tools', path: '/tools' } : { kind: 'examples', path: '/examples' });
    expect(routeKind({ pathname: '/en/examples/beam-frame/', search: '', hash: '#data=x' }).kind).toBe('app');
  });

  it('writes a redirect page per language and old address that carries the query on', () => {
    for (const locale of PUBLIC_LOCALES) {
      for (const from of MOVED_PAGES) {
        if (!flags.tools) {
          expect(() => redirectPage(ORIGIN, locale, from)).toThrow(`redirect-page: ${from} did not move`);
          continue;
        }
        const to = `/${locale}${from.replace(/^\/examples/, '/tools')}/`;
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
