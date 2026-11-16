import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { build as bundle } from 'esbuild';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');

for (const research of ['0', '1']) {
  test(`public locale consumers agree with VITE_RESEARCH=${research}`, async () => {
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
      env: { ...process.env, VITE_RESEARCH: research, VITE_TOOLS: '0', VITE_DIAGRAM_GAME: '0', VITE_ACCOUNTS: '0' },
      encoding: 'utf8',
      }));
    } finally {
      rmSync(outfile, { force: true });
    }
    const expected = ['en', 'es', 'pt', 'de', 'fr', 'tr', ...(research === '1' ? ['hu'] : [])];
    assert.deepEqual([...result.offered].sort(), [...expected].sort());
    assert.deepEqual(result.public, expected);
    assert.deepEqual(result.sitemap, expected);
    assert.equal(result.complete, research === '1');
  });

  test(`PublicLink uses the build policy with VITE_RESEARCH=${research}`, async () => {
    const keys = ['VITE_ACCOUNTS', 'VITE_RESEARCH', 'VITE_TOOLS', 'VITE_DIAGRAM_GAME', 'GITHUB_SHA'];
    const previous = keys.map(key => process.env[key]);
    Object.assign(process.env, { VITE_ACCOUNTS: research, VITE_RESEARCH: research, VITE_TOOLS: research, VITE_DIAGRAM_GAME: research, GITHUB_SHA: '000000000000' });
    let browser;
    try {
      const result = await build({
        root,
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
      });
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
      assert.equal(await page.locator('a[data-nav="/blog/untranslated-policy-fixture"]').getAttribute('href'), research === '1' ? '/en/blog/untranslated-policy-fixture/' : '/fr/blog/untranslated-policy-fixture/');
      assert.equal(await page.locator('a[data-nav="/examples/beam-frame"]').getAttribute('href'), research === '1' ? '/fr/tools/beam-frame/' : '/fr/examples/beam-frame/');
      await page.locator('a[data-nav="/examples/beam-frame"]').click();
      assert.equal(await page.evaluate(() => window.nextPath), research === '1' ? '/tools/beam-frame' : '/examples/beam-frame');
      assert.equal(await page.locator('a[data-nav="/research"]').getAttribute('href'), research === '1' ? '/en/research/' : '/fr/research/');
      const policy = await page.evaluate(() => window.policy);
      assert.equal(policy.public.includes('hu'), research === '1');
      assert.equal(policy.offered.includes('hu'), research === '1');
      assert.deepEqual(policy.parsed, research === '1' ? { locale: 'hu', path: '/blog' } : { locale: null, path: '/hu/blog/' });
      assert.equal(policy.preferred, research === '1' ? 'hu' : 'es');
      assert.equal(await page.getByTestId('policy-account-action').count(), research === '1' ? 1 : 0);
      assert.equal(await page.locator('.nav-links').count(), research === '1' ? 0 : 1);
      await page.evaluate(() => window.chooseLocale('hu'));
      assert.equal(await page.evaluate(() => window.activeLocale()), research === '1' ? 'hu' : 'fr');
    } finally {
      await browser?.close();
      keys.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key];
        else process.env[key] = previous[index];
      });
    }
  });
}
