import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
const bundle = path.join(root, 'web/public/research-wasm/biggins-2026');
const { default: init, simulation_run } = await import(pathToFileURL(path.join(bundle, 'arches.js')));
await init({ module_or_path: fs.readFileSync(path.join(bundle, 'arches_bg.wasm')) });
const replay = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'reference-results/replay.json')));
const run = JSON.parse(simulation_run(.7, .012));
assert.ok(Math.abs(run.threshold - replay.threshold) < 1e-8);
for (let i = 0; i < run.frames.length; i++) {
  for (let j = 0; j < run.frames[i].y.length; j++) assert.ok(Math.abs(run.frames[i].y[j] - replay.frames[i].y[j]) < 1e-8);
}
assert.throws(() => simulation_run(NaN, .012));
assert.ok(JSON.parse(simulation_run(.9, .012)).threshold > 4.8);
console.log('production-mode WASM: replay agrees at every node, parameter/domain checks pass');
