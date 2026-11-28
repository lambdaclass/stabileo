import { afterEach, expect, it, vi } from 'vitest';
import { diagramGame, publicFeatureEnabled, publicLocaleEnabled, research, setFeatureFlag, tools } from '../features';
import { routeKind } from '../public-route';
import { publishedLocales } from '../i18n/published';
import { PUBLIC_LOCALES } from '../i18n/offered';
import { publicPaths } from '../../../scripts/public-paths';
import { RESEARCH_GALLERY, RESEARCH_PAPER_PATHS } from '../../components/research/locales';
import { MAIN_TOOL_IDS, EXAMPLE_PATHS } from '../public-surface';
import { mohrPanel, openMohr, openMohrFromFibre } from '../mohr/panel.svelte';

const mainPaths = [RESEARCH_GALLERY, ...RESEARCH_PAPER_PATHS, '/paper', '/tools', ...MAIN_TOOL_IDS.map(id => `/tools/${id}`), ...EXAMPLE_PATHS];
const newPaths = ['/tools/mohr-2d', '/tools/mohr-3d', '/tools/beam-frame', '/tools/slab-on-columns', '/tools/earthquake-frame', '/tools/rc-column', '/tools/outrigger', '/tools/tower', '/diagram-game', '/games', '/games/diagram-game'];
afterEach(() => { vi.unstubAllGlobals(); });
it('disabled integration features stay off without withdrawing anything main publishes', async () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', { accounts: false, research: false, tools: false, diagramGame: false });
  expect([research(), tools(), diagramGame()]).toEqual([false, false, false]);
  const { SITE_NAV } = await import('../../components/site/site-nav');
  expect(SITE_NAV.filter(item => item.kind === 'page').map(item => item.id)).toEqual(['examples', 'tools', 'research', 'blog']);
  for (const path of mainPaths) {
    expect(publicFeatureEnabled(path), path).toBe(true);
    expect(publishedLocales(path), path).toContain('en');
    for (const locale of PUBLIC_LOCALES) expect(routeKind(new URL(`https://stabileo.test/${locale}${path}/`)).kind, `${locale}${path}`).not.toBe('landing');
  }
  for (const path of newPaths) {
    expect(publicFeatureEnabled(path), path).toBe(false);
    expect(publishedLocales(path), path).toEqual([]);
    for (const locale of PUBLIC_LOCALES) expect(routeKind(new URL(`https://stabileo.test/${locale}${path}/`)).kind, `${locale}${path}`).toBe('landing');
  }
  for (const path of await publicPaths()) expect(publicFeatureEnabled(path), path).toBe(true);
  expect(routeKind(new URL('https://stabileo.test/en/blog/')).kind).toBe('blog');
  expect(routeKind(new URL('https://stabileo.test/app/basic')).kind).toBe('app');
});
it('browser overrides can only enable features included in the build', () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', { accounts: false, research: false, tools: false, diagramGame: false });
  for (const [key, name] of [['research', 'research'], ['tools', 'tools'], ['diagramGame', 'diagram-game']] as const) {
    vi.stubGlobal('__PUBLIC_FEATURES__', { accounts: false, research: false, tools: false, diagramGame: false });
    const flags = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => flags.get(key) ?? null, setItem: (key: string, value: string) => flags.set(key, value) });
    setFeatureFlag(name, true);
    expect([publicLocaleEnabled('/research', 'hu'), publicFeatureEnabled('/tools/mohr-2d'), publicFeatureEnabled('/diagram-game')]).toEqual([false, false, false]);
    vi.stubGlobal('__PUBLIC_FEATURES__', { accounts: false, research: false, tools: false, diagramGame: false, ...{ [key]: true } });
    expect(publicLocaleEnabled('/research', 'hu')).toBe(name === 'research');
    expect(publicFeatureEnabled('/tools/mohr-2d')).toBe(name === 'tools');
    expect(publicFeatureEnabled('/diagram-game')).toBe(name === 'diagram-game');
    for (const path of mainPaths) expect(publicFeatureEnabled(path), `${name} ${path}`).toBe(true);
    setFeatureFlag(name, false);
    expect([publicLocaleEnabled('/research', 'hu'), publicFeatureEnabled('/tools/mohr-2d'), publicFeatureEnabled('/diagram-game')]).toEqual([false, false, false]);
  }
});
it('the new embedded Mohr entry points also refuse while Tools is off', () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', { ...__PUBLIC_FEATURES__, tools: false });
  mohrPanel.open = false;
  openMohr({ kind: 'plane' });
  expect(mohrPanel.open).toBe(false);
  openMohr({ kind: 'space' });
  expect(mohrPanel.open).toBe(false);
  openMohrFromFibre(100, 1e-7);
  expect(mohrPanel.open).toBe(false);
});
