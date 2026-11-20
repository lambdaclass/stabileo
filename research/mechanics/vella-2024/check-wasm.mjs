import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '../../..');
const bundle = path.join(root, 'web/public/research-wasm/vella-2024');
const { default: init, simulation_run } = await import(pathToFileURL(path.join(bundle, 'snap.js')));
await init({ module_or_path: fs.readFileSync(path.join(bundle, 'snap_bg.wasm')) });
const replay = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'reference-results/replay.json')));

// Bands: README, "WASM parity".
const PRE = { coordinate: 1.5e-7, value: 1e-9 };
const POST = { coordinate: 1e-6, value: 1e-6 };
const near = (a, b, abs, rel = 0) => Math.abs(a - b) <= abs + rel * Math.max(Math.abs(a), Math.abs(b));

export function compare(run, reference) {
  const problems = [];
  const check = (ok, what) => { if (!ok) problems.push(what); };
  for (const key of ['muA', 'muStar', 'heightA', 'heightStar']) check(near(run.critical[key], reference.critical[key], 1e-9), `critical.${key}`);
  for (const key of ['amplification', 'amplificationFromMuA', 'tSnap', 'muSnap', 'tEnd', 'thetaBefore', 'thetaDuring']) {
    check(near(run.outcome[key], reference.outcome[key], 1e-8, 1e-6), `outcome.${key}`);
  }
  check(run.frames.length === reference.frames.length, 'frame count');
  const snap = reference.frames.findIndex(f => f.height > 0);
  run.frames.forEach((f, i) => {
    const r = reference.frames[i];
    if (!r) return;
    const band = i < snap ? PRE : POST;
    for (const key of ['t', 'mu']) check(near(f[key], r[key], 1e-9), `frame ${i} ${key}`);
    for (const key of ['theta', 'height']) check(near(f[key], r[key], band.value), `frame ${i} ${key}`);
    for (const key of ['x', 'z']) {
      check(f[key].length === r[key].length, `frame ${i} ${key} length`);
      f[key].forEach((v, j) => check(near(v, r[key][j], band.coordinate), `frame ${i} ${key}[${j}]`));
    }
  });
  return problems;
}

const run = JSON.parse(simulation_run(JSON.stringify(replay.settings)));
assert.deepEqual(compare(run, replay), []);
const shifted = structuredClone(replay);
shifted.frames[3].x[10] += 1e-5;
assert.deepEqual(compare(run, shifted), ['frame 3 x[10]']);
const tilted = structuredClone(replay);
tilted.frames[2].theta += 1e-6;
assert.deepEqual(compare(run, tilted), ['frame 2 theta']);
assert.throws(() => simulation_run(JSON.stringify({ ...replay.settings, rate: -1 })));
assert.throws(() => simulation_run('{}'));
console.log('production-mode WASM: replay agrees in critical points, outcome and every frame (t, mu, theta, height, x, z); bad settings are refused');
