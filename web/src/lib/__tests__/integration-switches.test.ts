import { afterEach, expect, it, vi } from 'vitest';
import { diagramGame, publicFeatureEnabled, research, setFeatureFlag, tools } from '../features';
import { routeKind } from '../public-route';
import { publishedLocales } from '../i18n/published';
import { PUBLIC_LOCALES } from '../i18n/offered';
import { publicPaths } from '../../../scripts/public-paths';
import { RESEARCH_GALLERY, RESEARCH_PAPER_PATHS } from '../../components/research/locales';
import { toolPaths } from '../../components/tools/registry';
import { SITE_NAV } from '../../components/site/site-nav';
import { mohrPanel, openMohr, openMohrFromFibre } from '../mohr/panel.svelte';

const paths = [RESEARCH_GALLERY, ...RESEARCH_PAPER_PATHS, '/paper', ...toolPaths(), '/examples/beam-frame', '/diagram-game'];
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('all three integration switches default off, including in development', async () => {
  for (const key of ['VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME']) vi.stubEnv(key, '');
  expect([research(), tools(), diagramGame()]).toEqual([false, false, false]);
  expect(SITE_NAV.filter(item => item.kind === 'page').map(item => item.id)).toEqual(['blog']);
  for (const path of paths) {
    expect(publicFeatureEnabled(path), path).toBe(false);
    expect(publishedLocales(path), path).toEqual([]);
    for (const locale of PUBLIC_LOCALES) expect(routeKind(new URL(`https://stabileo.test/${locale}${path}/`)).kind, `${locale}${path}`).toBe('landing');
  }
  for (const path of await publicPaths()) expect(publicFeatureEnabled(path), path).toBe(true);
  expect(routeKind(new URL('https://stabileo.test/en/blog/')).kind).toBe('blog');
  expect(routeKind(new URL('https://stabileo.test/app/basic')).kind).toBe('app');
});
it('each switch enables only its own routes', () => {
  for (const name of ['research', 'tools', 'diagram-game']) {
    const flags = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => flags.get(key) ?? null, setItem: (key: string, value: string) => flags.set(key, value) });
    setFeatureFlag(name, true);
    for (const [path, expected] of [['/research', 'research'], ['/tools', 'tools'], ['/diagram-game', 'diagram-game']]) expect(publicFeatureEnabled(path), `${name} ${path}`).toBe(name === expected);
    setFeatureFlag(name, false);
    expect(publicFeatureEnabled(name === 'diagram-game' ? '/diagram-game' : `/${name}`)).toBe(false);
  }
});
it('the embedded Mohr entry points also refuse while Tools is off', () => {
  vi.stubEnv('VITE_TOOLS', '');
  mohrPanel.open = false;
  openMohr({ kind: 'plane' });
  expect(mohrPanel.open).toBe(false);
  openMohr({ kind: 'space' });
  expect(mohrPanel.open).toBe(false);
  openMohrFromFibre(100, 1e-7);
  expect(mohrPanel.open).toBe(false);
});
