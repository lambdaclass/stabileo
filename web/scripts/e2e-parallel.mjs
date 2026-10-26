/**
 * Run the e2e suite locally as N Playwright shards in parallel, from one worktree.
 *
 * ── Why not just start N `playwright test --shard=i/N` at once ─────
 *
 * Every Playwright main process transpiles the config, the specs and the helpers
 * they import, and keeps the result in ONE on-disk transform cache per user
 * ($TMPDIR/playwright-transform-cache-<uid>). The cache is keyed by file path and
 * content hash, and an entry is written with a plain `fs.writeFileSync` (truncate,
 * then write) — not written aside and renamed. Readers trust any entry they can
 * open. So when a file is new to the cache (any spec or fixture edited since the
 * last run), the N processes miss it together, one writes it, and another reads
 * the half-written file and dies before running a test with a SyntaxError
 * ("missing ) after argument list", "Unexpected end of input", "Invalid or
 * unexpected token"). Run alone, the shard passes: by then the entry is whole.
 * Measured with five parallel `--list` processes on a cold cache: 5 of 300
 * processes died this way (5 of 60 launches lost a shard); after one warming
 * `--list`, 0 of 200.
 *
 * Only main processes write entries (workers never do), and a warm cache is only
 * ever read, so this warms it once with `--list` over the same files and config,
 * then starts the shards.
 *
 * The shards also share two output folders that each run clears: `outputDir`
 * (e2e/.artifacts: traces, screenshots, diffs) and the HTML report (e2e/.report).
 * One shard's clean-up deleted another's report mid-write (ENOENT on
 * .report/index.html: 6 of 400 processes once the cache race was out of the way).
 * Each shard gets its own: e2e/.artifacts/shard-<i> and e2e/.report/shard-<i>,
 * inside the git-ignored folders.
 *
 * Start the preview server first (see playwright.config.ts): the shards then all
 * attach to it, instead of racing to build and bind the same port.
 *
 * Usage:
 *   node scripts/e2e-parallel.mjs [--shards N] [spec files…] [-- playwright args…]
 *   node scripts/e2e-parallel.mjs --shards 5 -- --grep @smoke
 * With no spec files it runs e2e/*.spec.ts. Exits non-zero if any shard did.
 */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const WEB = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash === -1 ? argv : argv.slice(0, dash);
const passthrough = dash === -1 ? [] : argv.slice(dash + 1);

let shards = 5;
const files = [];
for (let i = 0; i < own.length; i++) {
  if (own[i] === '--shards') shards = Number(own[++i]);
  else files.push(own[i]);
}
if (!Number.isInteger(shards) || shards < 1) {
  console.error('usage: node scripts/e2e-parallel.mjs [--shards N] [spec files…] [-- playwright args…]');
  process.exit(2);
}
if (files.length === 0) {
  for (const name of readdirSync(join(WEB, 'e2e')).sort()) {
    if (name.endsWith('.spec.ts')) files.push(`e2e/${name}`);
  }
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args, env, label) {
  return new Promise((done) => {
    const child = spawn(npx, ['playwright', 'test', ...args], {
      cwd: WEB, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', (line) => {
        if (label) process.stdout.write(`[${label}] ${line}\n`);
      });
    }
    child.on('close', (code, signal) => done(code ?? (signal ? 1 : 0)));
  });
}

// 1. Warm the transform cache: one process compiles everything the shards will load.
const warm = await run(['--list', ...files, ...passthrough], {}, null);
if (warm !== 0) {
  console.error(`e2e-parallel: the warming \`playwright test --list\` exited ${warm}; run it alone to see why`);
  process.exit(warm);
}

// 2. The shards, each with its own artifacts and report folder.
const codes = await Promise.all(Array.from({ length: shards }, (_, k) => {
  const i = k + 1;
  return run(
    [...files, `--shard=${i}/${shards}`, `--output=e2e/.artifacts/shard-${i}`, ...passthrough],
    { PLAYWRIGHT_HTML_OUTPUT_DIR: `e2e/.report/shard-${i}`, PLAYWRIGHT_HTML_OPEN: 'never' },
    `shard ${i}/${shards}`,
  );
}));

codes.forEach((c, k) => console.log(`e2e-parallel: shard ${k + 1}/${shards} exited ${c}`));
process.exit(codes.some((c) => c !== 0) ? 1 : 0);
