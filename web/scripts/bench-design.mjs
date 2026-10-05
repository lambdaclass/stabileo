#!/usr/bin/env node
// npm run bench:design -- [example ids]
// BENCH_OUTPUT=/path/results.json also saves full outputs for before/after comparisons.
// Requires built WASM and Playwright Chromium. Builds a temporary, benchmark-only
// page with a production build (unminified for profiling); no benchmark code enters the app.
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { mkdtemp, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = await mkdtemp(join(tmpdir(), 'stabileo-design-'));
const entry = join(root, `.${basename(outDir)}.html`);
let server, browser, watchdog;
try {
  await writeFile(entry, '<!doctype html><title>Design benchmark</title><script type="module">import { benchmark } from "/scripts/design-benchmark.ts"; window.runBenchmark = benchmark;</script>');
  await build({
    configFile: false, root, plugins: [svelte()],
    define: { __STABILEO_COMMIT__: JSON.stringify('benchmark') },
    build: { outDir, emptyOutDir: true, target: 'esnext', minify: false, rollupOptions: { input: entry } },
    worker: { format: 'es' },
  });
  // The solver's worker loads this bundle at runtime relative to /assets/.
  await cp(join(root, 'src/lib/wasm'), join(outDir, 'wasm'), { recursive: true });
  server = await preview({ configFile: false, root, build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No benchmark server address');
  browser = await chromium.launch({ headless: true });
  watchdog = setTimeout(() => { console.error('Benchmark timed out'); void browser.close(); }, 300_000);
  const page = await browser.newPage();
  page.on('crash', () => { console.error('Benchmark page crashed'); void browser.close(); });
  page.on('pageerror', error => console.error(error));
  await page.goto(`http://127.0.0.1:${address.port}/${basename(entry)}`);
  await page.waitForFunction(() => typeof window.runBenchmark === 'function');
  const examples = process.argv.slice(2);
  const result = await page.evaluate(({ examples, capture }) => window.runBenchmark(examples, capture), {
    examples: examples.length ? examples : ['pro-edificio-7p', 'rc-design-qa-8', 'rc-design-qa-row2'],
    capture: !!process.env.BENCH_OUTPUT,
  });
  if (process.env.BENCH_OUTPUT) await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(result));
  console.log(JSON.stringify(result.map(({ outputs, ...timings }) => timings), null, 2));
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  await rm(entry, { force: true });
  await rm(outDir, { recursive: true, force: true });
}
