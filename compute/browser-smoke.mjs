import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(new URL('../web/package.json', import.meta.url))('@playwright/test');
const allowed = new Set(['stabileo_compute.js', 'stabileo_compute_bg.wasm']);
const server = createServer(async (request, response) => {
  const file = request.url.slice(1);
  if (!file) { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Compute validation</title>'); return; }
  if (!allowed.has(file)) { response.writeHead(404).end(); return; }
  try {
    response.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
    response.end(await readFile(new URL(`../target/compute-webgpu/${file}`, import.meta.url)));
  } catch { response.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const report = await Promise.race([
    page.evaluate(async () => {
      const { default: init, ExperimentalSparseOperator } = await import('/stabileo_compute.js');
      await init();
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error('WebGPU adapter required; this test must not silently skip');
      const info = { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device };
      const operators = [];
      let batches = 0, maxRelativeError = 0;
      try {
        for (const n of [1, 3, 65, 257]) {
          const offsets = [0], rows = [], values = [];
          for (let col = 0; col < n; col++) {
            rows.push(col); values.push(4);
            if (col + 1 < n) { rows.push(col + 1); values.push(-1); }
            offsets.push(rows.length);
          }
          const op = await ExperimentalSparseOperator.create(n, new Uint32Array(offsets), new Uint32Array(rows), new Float64Array(values), 3);
          operators.push(op);
          if (op.precision !== 'experimental-f32') throw new Error('missing experimental precision');
          for (const count of [3, 1, 2, 3]) {
            const x = Float64Array.from({ length: n * count }, (_, i) => (i % 17 - 8) * 0.125);
            const gpu = await op.apply_batch(x), cpu = await op.reference_batch(x);
            if (gpu.length !== cpu.length || gpu.some((v, i) => v !== cpu[i])) throw new Error('binary-exact fixture mismatch');
            batches++;
          }
          const x = Float64Array.from({ length: n }, (_, i) => Math.sin(i + 1));
          const gpu = await op.apply_batch(x), cpu = await op.reference_batch(x);
          for (let i = 0; i < n; i++) {
            const error = Math.abs(gpu[i] - cpu[i]) / Math.max(1, Math.abs(cpu[i]));
            if (!Number.isFinite(error) || error > 2e-6) throw new Error('f32 experiment mismatch');
            maxRelativeError = Math.max(maxRelativeError, error);
          }
          if ((await op.apply_batch(new Float64Array(n))).some(v => v !== 0)) throw new Error('stale buffer contents');
          for (const value of [NaN, Infinity, Number.MAX_VALUE, 1e-300]) {
            let refused = false;
            try { await op.apply_batch(new Float64Array(n).fill(value)); } catch { refused = true; }
            if (!refused) throw new Error('unsafe numeric input accepted');
          }
        }
        return { info, batches, maxRelativeError, authoritativeSolver: 'unchanged CPU' };
      } finally { for (const op of operators) op.free(); }
    }),
    new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error('WebGPU smoke timed out')), 60_000); timeout.unref(); }),
  ]);
  assert.equal(report.batches, 16);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
