import { it, expect } from 'vitest';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { downloadBlob } from '../../store/file';

it('downloads real export content and opens blob reports with the desktop router installed', async () => {
  const bundle = await build({
    entryPoints: ['src/lib/platform/external-links.ts'],
    bundle: true, write: false, format: 'iife', globalName: 'links',
    plugins: [{
      name: 'native-opener',
      setup(builder) {
        builder.onResolve({ filter: /^@tauri-apps\/plugin-opener$/ }, () => ({ path: 'opener', namespace: 'mock' }));
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export async function openUrl() {}' }));
      },
    }],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.route('http://stabileo.test/**', (route) => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));
    await page.goto('http://stabileo.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text + '\nlinks.routeExternalLinks();' });
    await page.addScriptTag({ content: `window.exportBlob = ${downloadBlob.toString()};` });
    const downloading = page.waitForEvent('download');
    await page.evaluate(() => {
      (window as any).exportBlob(new Blob(['node,force\n1,42\n'], { type: 'text/csv' }), 'results.csv');
    });
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('results.csv');
    expect(await readFile((await download.path())!, 'utf8')).toBe('node,force\n1,42\n');
    const popupReady = page.waitForEvent('popup');
    expect(await page.evaluate(() => {
      const url = URL.createObjectURL(new Blob(['<h1>Report 42</h1>'], { type: 'text/html' }));
      return window.open(url) !== null;
    })).toBe(true);
    const popup = await popupReady;
    await popup.waitForLoadState();
    expect(await popup.locator('h1').textContent()).toBe('Report 42');
    expect(await page.evaluate(() => window.open('blob:https://outside.example/foreign') === null)).toBe(true);
  } finally {
    await browser.close();
  }
}, 30_000);
