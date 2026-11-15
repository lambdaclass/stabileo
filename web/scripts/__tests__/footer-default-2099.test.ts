import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import Footer from '../../src/components/landing/LandingFooter.svelte';
import ProCalc from '../../src/components/landing/LandingProCalc.svelte';
import { setPublicLocale } from '../../src/lib/i18n/store.svelte';
import { publicPaths } from '../public-paths';
import { publicFeatureEnabled } from '../../src/lib/features';
import { routeKind } from '../../src/lib/public-route';

afterEach(() => { setPublicLocale('en'); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([undefined, '0', '1'].flatMap(accounts => [undefined, '0', '1'].map(tools => ({ accounts, tools }))))('known wrong result: #2099 — main footer and account publication with %j', async ({ accounts, tools }) => {
  vi.stubEnv('VITE_ACCOUNTS', accounts);
  vi.stubEnv('VITE_TOOLS', tools);
  vi.stubEnv('VITE_RESEARCH', '0');
  vi.stubEnv('VITE_DIAGRAM_GAME', '0');
  vi.stubEnv('DEV', false);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  setPublicLocale('en');
  const body = render(Footer).body;
  const groups = [...body.matchAll(/<ul aria-labelledby="foot-([^"]+)">([\s\S]*?)<\/ul>/g)].map(([, id, html]) => ({
    id,
    links: [...html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(([, , attrs, label]) => [label.replace(/<[^>]*>/g, '').trim(), attrs.match(/href="([^"]+)"/)?.[1] ?? null]),
  }));
  expect(groups).toEqual([
    { id: 'product', links: [['Open the editor', null], ...(tools === '1' ? [] : [['Examples', '/en/examples/']]), ['Tools', '/en/tools/'], ['Pricing', '/en/#pricing']] },
    { id: 'verification', links: [['Reliability', '/en/reliability/'], ['Research', '/en/research/'], ['Paper', '/en/paper/'], ['CIRSOC', '/en/cirsoc/'], ['SAP2000 alternative', '/en/sap2000-alternative/'], ['ETABS alternative', '/en/etabs-alternative/']] },
    { id: 'project', links: [['Blog', '/en/blog/'], ['Changelog', '/en/changelog/'], ...(accounts === '1' ? [['Terms', '/en/terms/'], ['Privacy', '/en/privacy/']] : []), ['Documentation', 'https://github.com/lambdaclass/stabileo/blob/main/docs/README.md'], ['GitHub', 'https://github.com/lambdaclass/stabileo']] },
  ]);
  const section = render(ProCalc).body;
  expect(section).toContain(tools === '1' ? 'href="/en/tools/"' : 'href="/en/examples/"');
  expect(section.replace(/<[^>]*>/g, '')).toContain(tools === '1' ? 'Tools' : 'Examples');
  const paths = await publicPaths();
  for (const path of ['/terms', '/privacy', '/usage-data']) {
    expect(publicFeatureEnabled(path), path).toBe(accounts === '1');
    expect(paths.includes(path), path).toBe(accounts === '1');
    expect(routeKind(new URL(`https://stabileo.test/en${path}/`)), path).toEqual(accounts === '1' ? { kind: 'blog', path } : { kind: 'landing', path });
  }
});
