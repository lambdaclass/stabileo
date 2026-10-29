import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('the WASM checker rejects unconverged, nonfinite or missing step results', () => {
  const dir = mkdtempSync(join(tmpdir(), 'research-wasm-check-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    writeFileSync(join(dir, 'phasefield_bg.wasm'), '');
    const csv = join(dir, 'steps.csv');
    writeFileSync(csv, 'reaction,staggered_iterations\n1,1\n');
    const good = { converged: true, step: 0, pseudotime: 1, displacement: 1, reaction: 1,
      iterations: 1, residual: 0, damage_max: 0, damage_min: 0, elastic_energy: 1, fracture_energy: 0 };
    for (const [patch, expected] of [[{}, 0], [{ converged: false }, 1], [{ residual: null }, 1], [{ residual: undefined }, 1], [{ elastic_energy: Infinity }, 1]]) {
      const result = JSON.stringify({ ...good, ...patch });
      writeFileSync(join(dir, 'phasefield.js'), `export function initSync() {}\nexport class Simulation {
        static referenceConfig() { return '{}'; } done = false;
        advance() { if (this.done) return; this.done = true; return ${JSON.stringify(result)}; }
      }`);
      const run = spawnSync(process.execPath, [fileURLToPath(new URL('./check.mjs', import.meta.url)), dir, csv], { encoding: 'utf8' });
      assert.equal(run.status, expected, run.stdout + run.stderr);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
