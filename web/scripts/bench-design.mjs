#!/usr/bin/env node
// npm run bench:design -- [example ids]
// COLLISION_KERNEL=ts selects the reference implementation for full-design comparisons.
// npm run bench:design -- --compare [example ids] checks complete design output parity.
// npm run bench:design -- --compare-repair compares full Rust sweeps with incremental repair.
// npm run bench:design -- --compare-column compares cached and uncached column verification.
// npm run bench:design -- --columns isolates column capacity preparation and reuse.
// npm run bench:design -- --compare-station compares compact station transfer with grouped JSON.
// npm run bench:design -- --stations measures isolated station transfer and governing extraction.
// npm run bench:design -- --compare-fused compares separate and fused Rust collision queries.
// npm run bench:design -- --query-kernels alternates both query paths on identical cages.
// Add --reverse to a full-design comparison to run the optimized path first.
// npm run bench:kernels alternates both numeric backends on identical inputs.
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

const columns = process.argv.includes('--columns');
const compareColumn = process.argv.includes('--compare-column');
const numerical = process.argv.includes('--numerical');
const stations = process.argv.includes('--stations');
const compareStation = process.argv.includes('--compare-station');
const queryKernels = process.argv.includes('--query-kernels');
const kernels = process.argv.includes('--kernels') || queryKernels;
const compareFused = process.argv.includes('--compare-fused');
const reverse = process.argv.includes('--reverse');
const compareRepair = process.argv.includes('--compare-repair');
const compare = process.argv.includes('--compare') || compareColumn || compareRepair || compareStation || compareFused;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = await mkdtemp(join(tmpdir(), 'stabileo-design-'));
const entry = join(root, `.${basename(outDir)}.html`);
let server, browser, watchdog;
try {
  const module = queryKernels ? 'collision-query-benchmark' : stations ? 'station-transfer-benchmark' : columns ? 'column-capacity-benchmark' : numerical ? 'numerical-workflows-benchmark' : kernels ? 'numeric-kernel-benchmark' : 'design-benchmark';
  await writeFile(entry, `<!doctype html><title>Design benchmark</title><script type="module">import { benchmark } from "/scripts/${module}.ts"; window.runBenchmark = benchmark;</script>`);
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
  const examples = process.argv.slice(2).filter(arg => !['--columns', '--compare-column', '--compare-repair', '--numerical', '--kernels', '--compare', '--stations', '--compare-station', '--query-kernels', '--compare-fused', '--reverse'].includes(arg));
  const run = async (kernel, columnCapacity = true, incremental = true, compactStations = true, fused = true) => {
    // Fresh pages give both backends the same store revision counters and JIT warmup.
    const page = await browser.newPage();
    page.on('crash', () => { console.error('Benchmark page crashed'); void browser.close(); });
    page.on('pageerror', error => console.error(error));
    try {
      await page.goto(`http://127.0.0.1:${address.port}/${basename(entry)}`);
      await page.waitForFunction(() => typeof window.runBenchmark === 'function');
      return await page.evaluate(({ examples, capture, kernel, columnCapacity, incremental, compactStations, fused }) => window.runBenchmark(examples, capture, kernel, columnCapacity, incremental, compactStations, fused), {
        examples: examples.length ? examples : ['pro-edificio-7p', 'rc-design-qa-8', 'rc-design-qa-row2'],
        capture: compare || !!process.env.BENCH_OUTPUT, kernel, columnCapacity, incremental, compactStations, fused,
      });
    } finally { await page.close(); }
  };
  let result;
  if (compare && !kernels && !numerical && !columns && !stations) {
    const reference = () => run(compareColumn || compareRepair || compareStation || compareFused, !compareColumn, !compareRepair, !compareStation, !compareFused);
    const first = await (reverse ? run(true) : reference());
    const second = await (reverse ? reference() : run(true));
    const [ts, rust] = reverse ? [second, first] : [first, second];
    result = rust.map((row, i) => {
      if (row.outputs !== ts[i].outputs) throw new Error(`${row.example}: full design differs between reference and optimized paths`);
      return { example: row.example, bars: row.bars,
        [compareFused ? 'separateMedianDesignMs' : compareColumn || compareStation ? 'referenceMedianDesignMs' : compareRepair ? 'fullSweepMedianDesignMs' : 'tsMedianDesignMs']: ts[i].medianDesignMs,
        [compareFused ? 'fusedMedianDesignMs' : compareStation ? 'compactStationMedianDesignMs' : compareColumn ? 'preparedColumnMedianDesignMs' : compareRepair ? 'incrementalMedianDesignMs' : 'rustMedianDesignMs']: row.medianDesignMs,
        speedup: ts[i].medianDesignMs / row.medianDesignMs,
        rows: { reference: ts[i].rows, optimized: row.rows }, equivalent: true,
        outputs: process.env.BENCH_OUTPUT ? row.outputs : undefined };
    });
  } else result = await run(process.env.COLLISION_KERNEL !== 'ts');
  if (process.env.BENCH_OUTPUT) await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(result));
  console.log(JSON.stringify(result.map(({ outputs, ...timings }) => timings), null, 2));
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  await rm(entry, { force: true });
  await rm(outDir, { recursive: true, force: true });
}
