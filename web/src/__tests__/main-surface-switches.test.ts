import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import main from './fixtures/origin-main-public-surface.json';
import { routeKind } from '../lib/public-route';
import { publicPaths, writtenIn } from '../../scripts/public-paths';
import { publicFeatureEnabled } from '../lib/features';
import { publishedLocales } from '../lib/i18n/published';
import { setPublicLocale } from '../lib/i18n/store.svelte';
import ShapePage from '../components/research/feher2026/ShapePage.svelte';

const off = () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  vi.stubEnv('DEV', false);
  for (const key of ['VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME']) vi.stubEnv(key, '');
};
afterEach(() => { setPublicLocale('en'); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

it('known wrong result: #1950 — switches off preserve main public routes, nav and prerender pages exactly', async () => {
  off();
  const prerender = (await publicPaths()).sort();
  expect(prerender).toEqual(main.routes);
  const candidates = [...main.routes, '/tools/mohr-2d', '/tools/mohr-3d', '/tools/beam-frame', '/tools/tower', '/tools/earthquake-frame', '/tools/rc-column', '/tools/slab-on-columns', '/tools/outrigger', '/diagram-game', '/register', '/terms', '/privacy', '/usage-data'];
  const routes = candidates.filter(path => path === '/' || routeKind(new URL(`https://stabileo.test/en${path === '/' ? '' : path}/`)).kind !== 'landing').sort();
  expect(routes).toEqual(main.routes);
  const { SITE_NAV } = await import('../components/site/site-nav');
  expect(SITE_NAV).toEqual(main.nav);
  for (const path of main.routes) {
    expect(publicFeatureEnabled(path), path).toBe(true);
    expect(writtenIn(path), path).toContain('en');
  }
  expect(routeKind(new URL('https://stabileo.test/en/examples/beam-frame/'))).toEqual({ kind: 'examples', path: '/examples/beam-frame' });
});

it('known wrong result: #1916 — keeps Fehér main controls and hides only added sliders, explanations and Hungarian research', () => {
  off();
  for (const path of main.research) {
    expect(publishedLocales(path), path).toEqual(main.researchLocales[path as keyof typeof main.researchLocales]);
  }
  const body = render(ShapePage).body;
  for (const id of ['shape-theta', 'shape-delta']) expect(body).toContain(`id="${id}"`);
  for (const id of ['shape-q', 'shape-members', 'why']) expect(body).not.toContain(`id="${id}"`);
  vi.stubEnv('VITE_RESEARCH', '1');
  expect(publishedLocales('/research')).toContain('hu');
  const enabled = render(ShapePage).body;
  for (const id of ['shape-q', 'shape-members', 'why']) expect(enabled).toContain(`id="${id}"`);
});

it('known wrong result: #1950 — switches on publish added routes and consolidation without changing calculator corrections', async () => {
  off();
  vi.stubEnv('VITE_TOOLS', '1');
  vi.stubEnv('VITE_RESEARCH', '1');
  vi.stubEnv('VITE_DIAGRAM_GAME', '1');
  const paths = await publicPaths();
  for (const path of ['/tools/mohr-2d', '/tools/mohr-3d', '/tools/beam-frame', '/diagram-game']) {
    expect(paths).toContain(path);
    expect(routeKind(new URL(`https://stabileo.test/en${path}/`)).kind).not.toBe('landing');
  }
  expect(paths).not.toContain('/examples');
  const { SITE_NAV } = await import('../components/site/site-nav');
  expect(SITE_NAV.map(item => item.id)).toEqual(['basic', 'tools', 'game', 'research', 'pricing', 'blog']);
  const loader = readFileSync(new URL('../components/tools/load-page.ts', import.meta.url), 'utf8');
  expect(loader).toContain('loadToolDetail');
});

it.each(Array.from({ length: 8 }, (_, mask) => mask))('known wrong result: #1950 — publication uses build flags consistently for combination %i', async mask => {
  off();
  const flags = { research: !!(mask & 1), tools: !!(mask & 2), diagramGame: !!(mask & 4), accounts: false };
  for (const [key, enabled] of Object.entries(flags)) vi.stubEnv(`VITE_${key === 'diagramGame' ? 'DIAGRAM_GAME' : key.toUpperCase()}`, enabled ? '1' : '0');
  const paths = await publicPaths();
  const models = ['beam-frame', 'slab-on-columns', 'earthquake-frame', 'rc-column', 'outrigger', 'tower'].map(id => `/tools/${id}`);
  const expected = [...main.routes.filter(path => !flags.tools || !path.startsWith('/examples')), ...(flags.tools ? [...models, '/tools/mohr-2d', '/tools/mohr-3d'] : []), ...(flags.diagramGame ? ['/diagram-game'] : [])].sort();
  expect(paths.sort()).toEqual(expected);
  for (const path of main.research) {
    expect(writtenIn(path).includes('hu'), path).toBe(flags.research && path !== '/research/benchmarks/shell-obstacle-course');
    expect(publishedLocales(path, flags)).toEqual(writtenIn(path));
  }
  const { movedPages } = await import('../lib/legacy-routes');
  expect([...movedPages(flags)].sort()).toEqual(flags.tools ? main.routes.filter(path => path.startsWith('/examples')).sort() : []);
});

it('known wrong result: #1916 — unpublished Hungarian research addresses fall back to English while retaining query and fragment', async () => {
  off();
  const { unpublishedResearchAddress } = await import('../lib/legacy-routes');
  for (const path of main.research) {
    const location = { pathname: `/hu${path}/`, search: '?round=2', hash: '#checks' };
    expect(unpublishedResearchAddress(location)).toBe(`/en${path}/?round=2#checks`);
    vi.stubEnv('VITE_RESEARCH', '1');
    expect(unpublishedResearchAddress(location)).toBeNull();
    vi.stubEnv('VITE_RESEARCH', '0');
  }
  for (const path of ['/hu/', '/hu/tools/', '/en/research/', '/hu/researching/']) expect(unpublishedResearchAddress({ pathname: path, search: '', hash: '' })).toBeNull();
});

it('keeps the original calculator and example headings translated with integration switches off', async () => {
  off();
  const { render: renderPage } = await import('svelte/server');
  const { setPublicLocale: setViewLocale } = await import('../lib/i18n/store.svelte');
  const { loadToolsPage } = await import('../components/tools/load-page');
  const { loadExamplesPage } = await import('../components/examples/load-page');
  const { PUBLIC_LOCALES } = await import('../lib/i18n/offered');
  const examples = (await import('../components/examples/main-copy.json')).default;
  const { exampleStrings } = await import('../components/examples/strings');
  const calculators = (await import('../components/tools/main-copy.json')).default;
  const { toolTranslations } = await import('../components/tools/translations');
  const ToolsPage = await loadToolsPage('/tools');
  const ExamplesPage = await loadExamplesPage();
  for (const locale of PUBLIC_LOCALES) {
    setViewLocale(locale);
    const toolCopy = calculators[locale as keyof typeof calculators] ?? toolTranslations[locale];
    expect(renderPage(ToolsPage, { props: { path: '/tools' } }).body).toContain(toolCopy['tools.index']);
    const exampleCopy: Record<string, string> = { ...examples[locale as keyof typeof examples], ...exampleStrings[locale] };
    expect(renderPage(ExamplesPage, { props: { path: '/examples' } }).body).toContain(exampleCopy['index.title']);
    for (const id of ['beam-frame', 'slab-on-columns', 'earthquake-frame', 'rc-column', 'outrigger', 'tower']) {
      const title = exampleCopy[`${id}.title`];
      expect(title).toBeTruthy();
      expect(renderPage(ExamplesPage, { props: { path: `/examples/${id}` } }).body, `${locale} ${id}`).toContain(title);
    }
  }
  setViewLocale('en');
});
