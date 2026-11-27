import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { featuresForMode } from '../config/public-features.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function withComponent(mode, script, check) {
  const path = '/component-fixture.js';
  const server = await createServer({
    root, mode, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'component-fixture',
      resolveId: id => id === path ? id : null,
      load: id => id === path ? script : null,
      configureServer(vite) {
        vite.middlewares.use('/component-fixture.html', (_request, response) => {
          response.setHeader('Content-Type', 'text/html');
          response.end('<body><script type="module" src="/component-fixture.js"></script></body>');
        });
      },
    }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.addInitScript(features => { globalThis.__PUBLIC_FEATURES__ = features; }, featuresForMode(mode));
    await check(page, new URL('/component-fixture.html', server.resolvedUrls.local[0]).href);
  } finally {
    await browser?.close();
    await server.close();
  }
}

