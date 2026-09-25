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
 * 7.5 / 7.5 / 7.5 / 7.5 / 7.6 across five shards.
 *
 * Every spec file lands in exactly one shard, whatever the timings say — a file
 * missing from the table (a new one) gets the median weight — so stale timings
 * can only cost balance, never coverage. The weights are the @smoke suite's,
 * which is what the shards run; the small @slow and visual suites run in shard 1.
 *
 * Usage:
 *   node scripts/e2e-shard.mjs <index> <total>       # prints the files, one per line
 *   node scripts/e2e-shard.mjs --update results.json  # refresh e2e/shard-timings.json
 *
 * Refresh the table from a CI run's `playwright-artifacts-*` (the JSON reporter
 * writes e2e/.artifacts/results.json; merge the shards' files by passing each).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const E2E = join(WEB, 'e2e');
const TIMINGS = join(E2E, 'shard-timings.json');

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
  const walk = (suite, file) => {
    const f = suite.file ?? file;
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

function assign(total) {
  const timings = JSON.parse(readFileSync(TIMINGS, 'utf8'));
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

const [a, b, ...rest] = process.argv.slice(2);
if (a === '--update') {
  const reports = [b, ...rest].map((p) => JSON.parse(readFileSync(p, 'utf8')));
  writeFileSync(TIMINGS, JSON.stringify(durationsFrom(reports), null, 2) + '\n');
  console.log(`wrote ${relative(WEB, TIMINGS)}`);
} else {
  const index = Number(a);
  const total = Number(b);
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || index > total) {
    console.error('usage: node scripts/e2e-shard.mjs <index> <total>');
    process.exit(2);
  }
  const bins = assign(total);
  console.error(`e2e shard ${index}/${total}: ~${Math.round(bins[index - 1].s / 60 * 10) / 10} min over ${bins[index - 1].files.length} files`);
  for (const f of bins[index - 1].files.sort()) console.log(`e2e/${f}`);
}
