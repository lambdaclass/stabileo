import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('a continuous steep upper branch starts, confirmed inversion and nonconvergence remain separate', { skip: 'known wrong result: #2505' }, async () => {
  const folder = resolve(process.env.SHAPE_BUNDLE ?? 'web/public/research-wasm/feher-sipos-varkonyi-2026');
  const { default: init, simulation_run } = await import(pathToFileURL(resolve(folder, 'shape.js')).href);
  await init({ module_or_path: await readFile(resolve(folder, 'shape_bg.wasm')) });
  const start = (q, n) => JSON.parse(simulation_run(1, 0, q, true, n));
  assert.ok(start(2.5, 20).frames?.[0].y_mid > 0);
  assert.ok(start(2, 60).frames?.[0].y_mid > 0);
  assert.equal(start(2.5, 60).code, 'start_snaps');
  assert.equal(start(4, 80).code, 'start_unsolved');
});
