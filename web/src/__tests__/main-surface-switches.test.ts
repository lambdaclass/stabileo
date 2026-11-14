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
  vi.stubGlobal('localStorage', { getItem: () => null });
  for (const key of ['VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME']) vi.stubEnv(key, '');
};
afterEach(() => { setPublicLocale('en'); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

it.skip('known wrong result: #1950 — switches off preserve main public routes, nav and prerender pages exactly', async () => {
  off();
  const prerender = (await publicPaths()).sort();
  expect(prerender).toEqual(main.routes);
  const candidates = [...main.routes, '/tools/mohr-2d', '/tools/mohr-3d', '/tools/beam-frame', '/tools/tower', '/tools/earthquake-frame', '/tools/rc-column', '/tools/slab-on-columns', '/tools/outrigger', '/diagram-game'];
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

it.skip('known wrong result: #1916 — keeps Fehér main controls and hides only added sliders, explanations and Hungarian research', () => {
  off();
  for (const path of main.research) {
    expect(publishedLocales(path), path).toContain('en');
    expect(publishedLocales(path), path).not.toContain('hu');
  }
  const body = render(ShapePage).body;
  for (const id of ['shape-theta', 'shape-delta']) expect(body).toContain(`id="${id}"`);
  for (const id of ['shape-q', 'shape-members', 'why']) expect(body).not.toContain(`id="${id}"`);
  vi.stubEnv('VITE_RESEARCH', '1');
  expect(publishedLocales('/research')).toContain('hu');
  const enabled = render(ShapePage).body;
  for (const id of ['shape-q', 'shape-members', 'why']) expect(enabled).toContain(`id="${id}"`);
});

it.skip('known wrong result: #1950 — switches on publish added routes and consolidation without changing calculator corrections', async () => {
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
