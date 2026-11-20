import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { build as bundle } from 'esbuild';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { build } from 'vite';
import config from '../config/features.json' with { type: 'json' };
import { disabledFeatures, withProductionFeatures } from './public-features-test-fixture.mjs';

const root = resolve(import.meta.dirname, '..');

test('Node locale and sitemap consumers agree with the production config', async () => {
  const { research } = config.production;
  const source = `
    import { OFFERED_LOCALES, PUBLIC_LOCALES, isComplete } from './src/lib/i18n/offered.ts';
    import { writtenIn } from './scripts/public-paths.ts';
    console.log(JSON.stringify({ offered: OFFERED_LOCALES, public: PUBLIC_LOCALES, complete: isComplete('hu'), sitemap: writtenIn('/') }));
  `;
  const outfile = resolve(root, `scripts/.policy-node-fixture-${randomUUID()}.mjs`);
  let result;
  try {
    await bundle({ stdin: { contents: source, resolveDir: root }, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', external: ['*.svelte'] });
    result = JSON.parse(execFileSync(process.execPath, [outfile], {
    cwd: root,
    encoding: 'utf8',
    }));
  } finally {
    rmSync(outfile, { force: true });
  }
  const expected = ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', ...(research ? ['hu'] : [])];
  assert.deepEqual([...result.offered].sort(), [...expected].sort());
  assert.deepEqual(result.public, expected);
  assert.deepEqual(result.sitemap, expected);
  assert.equal(result.complete, research);
});

for (const research of [false, true]) {
  test(`PublicLink uses the build policy with research=${research}`, async () => {
    let browser;
    try {
      const result = await withProductionFeatures(Object.fromEntries(Object.keys(disabledFeatures).map(key => [key, research])), configFile => build({
        root,
        configFile,
        plugins: [{
          name: 'public-link-policy-fixture',
          enforce: 'pre',
          resolveId(id, importer) {
            if (id === 'public-link-policy-fixture') return '\0public-link-policy-fixture';
            if (importer?.endsWith('/landing/PublicLink.svelte') && id === './landing-utils') return '\0policy-navigation';
            if (importer?.endsWith('/landing/PublicLink.svelte') && id.endsWith('/public-navigation')) return '\0policy-prefetch';
          },
          load(id) {
            if (id === '\0policy-navigation') return 'export const goPublic = path => { window.nextPath = path; };';
            if (id === '\0policy-prefetch') return 'export const prefetchPublicLink = () => ({});';
            if (id !== '\0public-link-policy-fixture') return;
            return `
              import { mount, createRawSnippet } from 'svelte';
              import Link from ${JSON.stringify(resolve(root, 'src/components/landing/PublicLink.svelte'))};
              import Header from ${JSON.stringify(resolve(root, 'src/components/site/SiteHeader.svelte'))};
              import { setLocale, publicI18n } from ${JSON.stringify(resolve(root, 'src/lib/i18n/store.svelte.ts'))};
              import { PUBLIC_LOCALES, OFFERED_LOCALES } from ${JSON.stringify(resolve(root, 'src/lib/i18n/offered.ts'))};
              import { parsePublicPath, preferredPublicLocale } from ${JSON.stringify(resolve(root, 'src/lib/i18n/public-routes.ts'))};
              window.chooseLocale = setLocale;
              window.activeLocale = () => publicI18n.locale;
              mount(Header, { target: document.body, props: { actions: createRawSnippet(() => ({ render: () => '<button data-testid="policy-account-action">Account</button>' })) } });
              window.policy = { public: PUBLIC_LOCALES, offered: OFFERED_LOCALES, parsed: parsePublicPath('/hu/blog/'), preferred: preferredPublicLocale(['hu-HU', 'es']) };
              for (const to of ['/', '/blog/untranslated-policy-fixture', '/examples/beam-frame', '/research', '/register']) {
                mount(Link, { target: document.body, props: { to, 'data-nav': to, children: createRawSnippet(() => ({ render: () => '<span>Open</span>' })) } });
              }
            `;
          },
        }],
        build: { write: false, rollupOptions: { input: 'public-link-policy-fixture' } },
        logLevel: 'silent',
      }));
      const files = new Map(result.output.map(item => [item.fileName, item.type === 'chunk' ? item.code : item.source]));
      const entry = result.output.find(item => item.type === 'chunk' && item.isEntry).fileName;
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.route('http://policy.test/**', route => {
        const path = new URL(route.request().url()).pathname.slice(1);
        if (!path) return route.fulfill({ contentType: 'text/html', body: `<script type="module" src="/${entry}"></script>` });
        return route.fulfill({ contentType: 'text/javascript', body: files.get(path) ?? '' });
      });
      await page.addInitScript(() => {
        localStorage.setItem('stabileo-lang', 'fr');
        localStorage.setItem('stabileo-lang-manual', '1');
        for (const flag of ['research', 'tools', 'accounts', 'diagram-game']) localStorage.setItem(`stabileo-feature-${flag}`, '1');
      });
      await page.goto('http://policy.test/');
      await page.waitForSelector('a[data-nav="/"]');
      assert.equal(await page.locator('a[data-nav="/"]').getAttribute('href'), '/fr/');
      assert.equal(await page.locator('a[data-nav="/blog/untranslated-policy-fixture"]').getAttribute('href'), research ? '/en/blog/untranslated-policy-fixture/' : '/fr/blog/untranslated-policy-fixture/');
      assert.equal(await page.locator('a[data-nav="/examples/beam-frame"]').getAttribute('href'), research ? '/fr/tools/beam-frame/' : '/fr/examples/beam-frame/');
      await page.locator('a[data-nav="/examples/beam-frame"]').click();
      assert.equal(await page.evaluate(() => window.nextPath), research ? '/tools/beam-frame' : '/examples/beam-frame');
      assert.equal(await page.locator('a[data-nav="/research"]').getAttribute('href'), research ? '/en/research/' : '/fr/research/');
      const policy = await page.evaluate(() => window.policy);
      assert.equal(policy.public.includes('hu'), research);
      assert.equal(policy.offered.includes('hu'), research);
      assert.deepEqual(policy.parsed, research ? { locale: 'hu', path: '/blog' } : { locale: null, path: '/hu/blog/' });
      assert.equal(policy.preferred, research ? 'hu' : 'es');
      assert.equal(await page.getByTestId('policy-account-action').count(), research ? 1 : 0);
      assert.equal(await page.locator('.nav-links').count(), research ? 0 : 1);
      await page.evaluate(() => window.chooseLocale('hu'));
      assert.equal(await page.evaluate(() => window.activeLocale()), research ? 'hu' : 'fr');
    } finally {
      await browser?.close();
    }
  });
}
