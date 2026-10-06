#!/usr/bin/env node
// npm run bench:collision-worker
// Requires built WASM and Playwright Chromium. Builds a temporary, benchmark-only
// page so both threads run production bundles; no benchmark code enters the app.
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { mkdtemp, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = await mkdtemp(join(tmpdir(), 'stabileo-collision-worker-'));
const entry = join(root, `.${basename(outDir)}.html`);
let server, browser;
try {
  await writeFile(entry, '<!doctype html><title>Collision worker benchmark</title><script type="module">import { benchmark } from "/scripts/collision-worker/benchmark.ts"; window.runBenchmark = benchmark;</script>');
  await build({
    configFile: false, root, plugins: [svelte()],
    define: { __STABILEO_COMMIT__: JSON.stringify('benchmark') },
    build: { outDir, emptyOutDir: true, target: 'esnext', rollupOptions: { input: entry } },
    worker: { format: 'es' },
  });
  // The solver's worker loads this bundle at runtime relative to /assets/.
  await cp(join(root, 'src/lib/wasm'), join(outDir, 'wasm'), { recursive: true });
  server = await preview({ configFile: false, root, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No benchmark server address');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', error => console.error(error));
  await page.goto(`http://127.0.0.1:${address.port}/${basename(entry)}`);
  await page.waitForFunction(() => typeof window.runBenchmark === 'function');
  console.log(JSON.stringify(await page.evaluate(() => window.runBenchmark()), null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  await rm(entry, { force: true });
  await rm(outDir, { recursive: true, force: true });
}
