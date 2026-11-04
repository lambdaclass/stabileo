/**
 * Which e2e spec files a CI shard runs, balanced by how long they take.
 *
 * ── Why not `playwright test --shard` ──────────────────────────────
 *
 * Playwright splits by test COUNT, in file order. The suite's heaviest files —
 * blog (4.2 min), detailing (2.4), basic-demos (2.0) — sort to the front, so
 * shard 1 of 4 got 12.6 min while shard 2 got 7.8, and adding shards barely
 * moved the maximum. This assigns whole files by measured duration instead
 * (longest first, each into the lightest shard): 38 min of smoke tests split
 * 7.5 / 7.5 / 7.5 / 7.5 / 7.6 across five shards, 5.6 / 5.7 across ten.
 *
 * The slow suite is balanced the same way from its own table: `--shard=N/5`
 * gave one shard 49 min and another 6, because the Basic advanced sweep (54 min
 * of the 120) was one file. It is seven files now, none over 10 min, so ten
 * shards carry about 12 min each.
 *
 * Every spec file lands in exactly one shard, whatever the timings say — a file
 * missing from the table (a new one) gets the median weight — so stale timings
 * can only cost balance, never coverage. Each suite has its own table, because
 * a file's weight in one says nothing about the other.
 *
 * Usage:
 *   node scripts/e2e-shard.mjs [--suite slow] <index> <total>   # the files, one per line
 *   node scripts/e2e-shard.mjs [--suite slow] --update a.json b.json ...
 *
 * `--suite smoke` (the default) reads e2e/shard-timings.json, `--suite slow`
 * e2e/shard-timings-slow.json. Refresh a table from a CI run's
 * `playwright-artifacts-*`: each shard's JSON report is e2e/.results/<suite>.json
 * there; pass all of them to merge the shards.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const E2E = join(WEB, 'e2e');
const TABLES = { smoke: 'shard-timings.json', slow: 'shard-timings-slow.json' };

function specFiles(dir = E2E) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...specFiles(full));
    else if (name.endsWith('.spec.ts')) out.push(relative(E2E, full));
  }
  return out.sort();
}

/** Seconds per spec file from Playwright JSON reports, first attempts only. */
function durationsFrom(reports) {
  const secs = {};
  // The OUTERMOST suite's file: a describe declared in a helper (the Basic advanced sweep's
  // harness) reports the helper as its file, and its time belongs to the spec that ran it.
  const walk = (suite, file) => {
    const f = file ?? suite.file;
    for (const s of suite.suites ?? []) walk(s, f);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        for (const r of t.results) {
          if ((r.retry ?? 0) === 0) secs[f] = (secs[f] ?? 0) + r.duration / 1000;
        }
      }
    }
  };
  for (const report of reports) for (const s of report.suites) walk(s);
  // Every spec file gets an entry. One the run did not execute (no @smoke tests
  // in it) weighs 0 rather than being left out, so only a file that did not
  // exist when the table was made falls back to the median.
  for (const f of specFiles()) secs[f] ??= 0;
  return Object.fromEntries(Object.entries(secs).sort().map(([f, s]) => [f, Math.round(s)]));
}

function assign(table, total) {
  const timings = JSON.parse(readFileSync(table, 'utf8'));
  // The median of files that ran something: a new spec file is presumably one.
  const known = Object.values(timings).filter((v) => v > 0).sort((a, b) => a - b);
  const median = known.length > 0 ? known[Math.floor(known.length / 2)] : 30;
  const files = specFiles().map((f) => ({ f, s: timings[f] ?? median }));
  // Longest first, ties by name, so every shard computes the same assignment.
  files.sort((a, b) => b.s - a.s || a.f.localeCompare(b.f));
  const bins = Array.from({ length: total }, () => ({ s: 0, files: [] }));
  for (const { f, s } of files) {
    let lightest = bins[0];
    for (const b of bins) if (b.s < lightest.s) lightest = b;
    lightest.s += s;
    lightest.files.push(f);
  }
  return bins;
}

let args = process.argv.slice(2);
let suite = 'smoke';
if (args[0] === '--suite') {
  suite = args[1];
  args = args.slice(2);
}
if (!(suite in TABLES)) {
  console.error(`unknown suite "${suite}": one of ${Object.keys(TABLES).join(', ')}`);
  process.exit(2);
}
const TIMINGS = join(E2E, TABLES[suite]);
const [a, b, ...rest] = args;
if (a === '--update') {
  const reports = [b, ...rest].map((p) => JSON.parse(readFileSync(p, 'utf8')));
  writeFileSync(TIMINGS, JSON.stringify(durationsFrom(reports), null, 2) + '\n');
  console.log(`wrote ${relative(WEB, TIMINGS)}`);
} else {
  const index = Number(a);
  const total = Number(b);
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || index > total) {
    console.error('usage: node scripts/e2e-shard.mjs [--suite smoke|slow] <index> <total>');
    process.exit(2);
  }
  const bins = assign(TIMINGS, total);
  console.error(`e2e ${suite} shard ${index}/${total}: ~${Math.round(bins[index - 1].s / 60 * 10) / 10} min over ${bins[index - 1].files.length} files`);
  for (const f of bins[index - 1].files.sort()) console.log(`e2e/${f}`);
}
