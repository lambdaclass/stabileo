import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import Footer from '../../src/components/landing/LandingFooter.svelte';
import { setPublicLocale } from '../../src/lib/i18n/store.svelte';
import { publicPaths, POST_LASTMOD } from '../public-paths';
import { publicFeatureEnabled } from '../../src/lib/features';
import { routeKind } from '../../src/lib/public-route';
import { TOOLS, toolLastmod } from '../../src/components/tools/registry';
import reviews from '../../../research/tools/batches/VALIDATION.json';

const knownWrong = it.skipIf(process.env.RUN_KNOWN_WRONG !== '1');

afterEach(() => { setPublicLocale('en'); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

knownWrong.each([undefined, '0', '1'])('known wrong result: #2099 — footer legal links remain public with accounts=%s', async accounts => {
  vi.stubEnv('VITE_ACCOUNTS', accounts);
  vi.stubEnv('DEV', false);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  setPublicLocale('en');
  const body = render(Footer).body;
  expect(body).toContain('href="/en/terms/"');
  expect(body.replace(/<[^>]*>/g, '')).toContain('Terms');
  expect(body).toContain('href="/en/privacy/"');
  expect(body.replace(/<[^>]*>/g, '')).toContain('Privacy');
  const paths = await publicPaths();
  for (const path of ['/terms', '/privacy']) {
    expect(publicFeatureEnabled(path), path).toBe(true);
    expect(paths, path).toContain(path);
    expect(routeKind(new URL(`https://stabileo.test/en${path}/`)), path).toEqual({ kind: 'blog', path });
  }
  expect(publicFeatureEnabled('/register')).toBe(accounts === '1');
  expect(publicFeatureEnabled('/usage-data')).toBe(accounts === '1');
});

knownWrong.each([undefined, '0', '1'])('known wrong result: #2099 — tools index keeps the latest registry review with tools=%s', async tools => {
  vi.stubEnv('VITE_TOOLS', tools);
  await publicPaths();
  expect(POST_LASTMOD.get('/tools')).toBe(TOOLS.map(tool => toolLastmod(tool, reviews.batches)).sort().at(-1));
  for (const tool of TOOLS.filter(tool => publicFeatureEnabled(`/tools/${tool.id}`))) {
    expect(POST_LASTMOD.get(`/tools/${tool.id}`), tool.id).toBe(toolLastmod(tool, reviews.batches));
  }
  expect(POST_LASTMOD.get('/blog')).toBe([...POST_LASTMOD].filter(([path]) => path.startsWith('/blog/')).map(([, date]) => date).sort().at(-1));
});
