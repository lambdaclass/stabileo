import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import Footer from '../../src/components/landing/LandingFooter.svelte';
import { setPublicLocale } from '../../src/lib/i18n/store.svelte';
import { publicPaths, POST_LASTMOD } from '../public-paths';
import { publicFeatureEnabled } from '../../src/lib/features';
import { routeKind } from '../../src/lib/public-route';
import { TOOLS, toolLastmod } from '../../src/components/tools/registry';
import reviews from '../../../research/tools/batches/VALIDATION.json';

afterEach(() => { setPublicLocale('en'); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([undefined, '0', '1'])('known wrong result: #2099 — footer legal links follow accounts with accounts=%s', async accounts => {
  vi.stubEnv('VITE_ACCOUNTS', accounts);
  vi.stubEnv('DEV', false);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  setPublicLocale('en');
  const body = render(Footer).body;
  expect(body.includes('href="/en/terms/"')).toBe(accounts === '1');
  expect(body.replace(/<[^>]*>/g, '').includes('Terms')).toBe(accounts === '1');
  expect(body.includes('href="/en/privacy/"')).toBe(accounts === '1');
  expect(body.replace(/<[^>]*>/g, '').includes('Privacy')).toBe(accounts === '1');
  const paths = await publicPaths();
  for (const path of ['/terms', '/privacy']) {
    expect(publicFeatureEnabled(path), path).toBe(accounts === '1');
    expect(paths.includes(path), path).toBe(accounts === '1');
    expect(routeKind(new URL(`https://stabileo.test/en${path}/`)), path).toEqual(accounts === '1' ? { kind: 'blog', path } : { kind: 'landing', path });
  }
  expect(publicFeatureEnabled('/register')).toBe(accounts === '1');
  expect(publicFeatureEnabled('/usage-data')).toBe(accounts === '1');
});

it.each([undefined, '0', '1'])('known wrong result: #2099 — tools index keeps the latest registry review with tools=%s', async tools => {
  vi.stubEnv('VITE_TOOLS', tools);
  await publicPaths();
  expect(POST_LASTMOD.get('/tools')).toBe(TOOLS.filter(tool => publicFeatureEnabled(`/tools/${tool.id}`)).map(tool => toolLastmod(tool, reviews.batches)).sort().at(-1));
  for (const tool of TOOLS.filter(tool => publicFeatureEnabled(`/tools/${tool.id}`))) {
    expect(POST_LASTMOD.get(`/tools/${tool.id}`), tool.id).toBe(toolLastmod(tool, reviews.batches));
  }
  expect(POST_LASTMOD.get('/blog')).toBe([...POST_LASTMOD].filter(([path]) => path.startsWith('/blog/')).map(([, date]) => date).sort().at(-1));
});

it.each(['0001-01-01', '9999-12-31'])('known wrong result: #2099 — blog metadata ignores unrelated route dates (%s)', async date => {
  await publicPaths();
  const expected = [...POST_LASTMOD].filter(([path]) => path.startsWith('/blog/')).map(([, day]) => day).sort().at(-1);
  expect(expected).toBeDefined();
  POST_LASTMOD.set('/metadata-regression', date);
  try {
    for (let pass = 0; pass < 2; pass++) {
      await publicPaths();
      expect(POST_LASTMOD.get('/blog')).toBe(expected);
    }
  } finally {
    POST_LASTMOD.delete('/metadata-regression');
  }
});
