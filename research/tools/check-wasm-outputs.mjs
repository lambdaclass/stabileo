// Runs each research bundle's Node check with every value that crosses the WASM boundary hashed,
// and compares the hash with wasm-output-hashes.json: a build change that moves any output by one
// bit fails here, even when the check's own tolerances still pass.
//   node research/tools/check-wasm-outputs.mjs [--update] <research-wasm dir>
import { cpSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TABLE = fileURLToPath(new URL('./wasm-output-hashes.json', import.meta.url));
const HASH = new URL('./wasm-output-hash.mjs', import.meta.url).href;
export const BUNDLES = {
  'shauer-2025': { glue: 'phasefield.js', check: (dir) => ['research/fracture/shauer-2025/wasm/check.mjs', dir, 'research/fracture/shauer-2025/reference-results/ex2_steps.csv'] },
  'grossman-2026': { glue: 'springs.js', check: (dir) => ['research/metamaterials/grossman-2026/wasm/check.mjs', dir] },
  'pastrana-2026': { glue: 'form.js', check: (dir) => ['research/form-finding/pastrana-2026/wasm/check.mjs', dir] },
  'fairclough-2026': { glue: 'gridshell_fairclough_2026.js', check: (dir) => ['research/optimisation/fairclough-2026/wasm/check.mjs', dir] },
};

export async function hashBundle(source, { glue, check }) {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-outputs-'));
  try {
    cpSync(source, dir, { recursive: true });
    renameSync(join(dir, glue), join(dir, 'glue.real.js'));
    const real = await import(pathToFileURL(join(dir, 'glue.real.js')).href);
    const names = Object.keys(real).filter((name) => name !== 'default');
    writeFileSync(join(dir, glue), [
      "import * as real from './glue.real.js';",
      "import realDefault from './glue.real.js';",
      `import { wrap } from ${JSON.stringify(HASH)};`,
      'export default realDefault;',
      ...names.map((name) => `export const ${name} = ${name === 'initSync' ? 'real.initSync' : `wrap(real.${name}, ${JSON.stringify(name)})`};`),
    ].join('\n'));
    const run = spawnSync(process.execPath, check(dir), { cwd: ROOT, encoding: 'utf8', maxBuffer: 64_000_000 });
    const line = run.stdout.split('\n').find((l) => l.startsWith('OUTPUT-HASH '));
    if (run.status !== 0 || !line) throw new Error(`check failed (exit ${run.status}):\n${run.stdout}\n${run.stderr}`);
    const [, hash, values] = line.split(' ');
    return { hash, values: Number(values.split('=')[1]) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const update = process.argv[2] === '--update';
  const root = process.argv[update ? 3 : 2];
  if (!root) { console.error('usage: node research/tools/check-wasm-outputs.mjs [--update] <research-wasm dir>'); process.exit(2); }
  const stored = JSON.parse(readFileSync(TABLE, 'utf8'));
  const measured = {};
  let failed = false;
  for (const [name, bundle] of Object.entries(BUNDLES)) {
    measured[name] = await hashBundle(join(root, name), bundle);
    const same = stored[name]?.hash === measured[name].hash && stored[name]?.values === measured[name].values;
    console.log(`${same ? 'ok  ' : 'DIFF'} ${name} ${measured[name].hash} (${measured[name].values} values)`);
    failed ||= !same;
  }
  if (update) {
    writeFileSync(TABLE, JSON.stringify(measured, null, 2) + '\n');
    console.log(`wrote ${TABLE}`);
  } else if (failed) {
    console.error('A research bundle returned different bits than recorded. If the change is intended (a solver or paper change, not a build setting), record it with --update and say why in the PR.');
    process.exit(1);
  }
}
