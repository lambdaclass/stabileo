import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as wasm from '../src/lib/wasm/dedaliano_engine.js';
import { gravityDensityCases } from './gravity-density.mjs';

wasm.initSync({ module: readFileSync(new URL('../src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });

test('density station results are bit-identical across browsers', async ({ page }) => {
  const reference = gravityDensityCases(wasm);
  for (const c of reference.cases) {
    const spatial = c.name.startsWith('spatial');
    expect(c.diagrams[spatial ? 'torsion' : 'shear'][0].maxValue).toBeCloseTo(spatial ? 1 / 48 : 0.25, 10);
  }
  await page.goto('/determinism/serve.mjs');
  const actual = await page.evaluate(async () => {
    const wasmPath = '/wasm/dedaliano_engine.js', casesPath = '/determinism/gravity-density.mjs';
    const engine = await import(wasmPath);
    await engine.default({ module_or_path: '/wasm/dedaliano_engine_bg.wasm' });
    return (await import(casesPath)).gravityDensityCases(engine).text;
  });
  expect(actual).toBe(reference.text);
});
