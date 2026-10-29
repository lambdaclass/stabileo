import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';

const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const base = server.resolvedUrls.local[0];
  await page.goto(new URL('research/metamaterials/grossman-2026?eta=0', base).href);
  await page.waitForFunction(() => Number(document.querySelector('[data-nodes]')?.getAttribute('data-nodes')) > 0);
  const readout = await page.locator('.sp-readout dd').first().textContent();
  assert(readout && !readout.includes('—'), 'strip Poisson ratio must be displayed');
  assert.equal(await page.getByRole('button', { name: 'Open full editor ↗' }).isEnabled(), true);
  for (const file of ['springs.js', 'springs_bg.wasm']) {
    const response = await page.request.get(new URL('research-wasm/grossman-2026/' + file, base).href);
    assert.equal(response.status(), 200, file);
  }
  console.log('Grossman page smoke passed: solver, readout, editor action and runtime assets');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
