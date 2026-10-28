#!/usr/bin/env node
// Lighthouse ratchet: the median of N runs per URL against a stored baseline (docs/performance/README.md).
//
//   node scripts/perf-lighthouse.mjs --base http://127.0.0.1:4173            # measure and check
//   node scripts/perf-lighthouse.mjs --base ... --write                       # raise the baseline
//   node scripts/perf-lighthouse.mjs --base https://stabileo.com --preset desktop --runs 1 --no-check
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const BASELINE = join(webRoot, 'perf-lighthouse.json');
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

function args(argv) {
  const o = { base: null, runs: 3, preset: 'mobile', write: false, check: true, out: join(webRoot, '.perf', 'lighthouse'), urls: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') o.base = argv[++i].replace(/\/$/, '');
    else if (a === '--runs') o.runs = Number(argv[++i]);
    else if (a === '--preset') o.preset = argv[++i];
    else if (a === '--write') o.write = true;
    else if (a === '--no-check') o.check = false;
    else if (a === '--out') o.out = resolve(argv[++i]);
    else if (a === '--urls') o.urls = argv[++i].split(',');
    else if (a === '--json') o.json = resolve(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.base) throw new Error('--base is required');
  return o;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function kind(req) {
  const mime = req.mimeType || '';
  const url = req.url || '';
  if (mime === 'application/wasm' || url.endsWith('.wasm')) return 'wasm';
  if (req.resourceType === 'Script' || /javascript/.test(mime)) return 'js';
  if (req.resourceType === 'Stylesheet' || mime === 'text/css') return 'css';
  if (req.resourceType === 'Font' || /font/.test(mime)) return 'font';
  if (req.resourceType === 'Image' || /^image\//.test(mime)) return 'image';
  if (req.resourceType === 'Document') return 'html';
  return 'other';
}

function summarize(lhr) {
  const a = lhr.audits;
  const reqs = a['network-requests']?.details?.items ?? [];
  const bytes = {};
  for (const r of reqs) {
    const k = kind(r);
    bytes[k] = (bytes[k] ?? 0) + (r.transferSize ?? 0);
  }
  const third = reqs.filter((r) => !r.url.startsWith(lhr.finalDisplayedUrl.split('/').slice(0, 3).join('/'))).map((r) => r.url);
  return {
    scores: Object.fromEntries(CATEGORIES.map((c) => [c, Math.round((lhr.categories[c]?.score ?? 0) * 100)])),
    lcpMs: Math.round(a['largest-contentful-paint']?.numericValue ?? 0),
    fcpMs: Math.round(a['first-contentful-paint']?.numericValue ?? 0),
    tbtMs: Math.round(a['total-blocking-time']?.numericValue ?? 0),
    cls: Number((a['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
    siMs: Math.round(a['speed-index']?.numericValue ?? 0),
    ttiMs: Math.round(a['interactive']?.numericValue ?? 0),
    totalBytes: Math.round(a['total-byte-weight']?.numericValue ?? 0),
    requests: reqs.length,
    bytes,
    thirdParty: [...new Set(third.map((u) => new URL(u).host))],
  };
}

function runOnce(url, preset, outFile) {
  const bin = process.env.LIGHTHOUSE_BIN ?? join(webRoot, 'node_modules', '.bin', 'lighthouse');
  const flags = [
    url,
    '--quiet',
    '--output=json',
    `--output-path=${outFile}`,
    `--only-categories=${CATEGORIES.join(',')}`,
    '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage',
    '--max-wait-for-load=60000',
  ];
  if (preset === 'desktop') flags.push('--preset=desktop');
  const r = spawnSync(bin, flags, { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
  if (r.status !== 0 || !existsSync(outFile)) throw new Error(`lighthouse failed on ${url} (exit ${r.status})`);
  const lhr = JSON.parse(readFileSync(outFile, 'utf8'));
  if (lhr.runtimeError) throw new Error(`lighthouse runtime error on ${url}: ${lhr.runtimeError.code}`);
  return summarize(lhr);
}

function aggregate(runs) {
  const med = (f) => median(runs.map(f));
  const keys = new Set(runs.flatMap((r) => Object.keys(r.bytes)));
  return {
    scores: Object.fromEntries(CATEGORIES.map((c) => [c, med((r) => r.scores[c])])),
    lcpMs: med((r) => r.lcpMs),
    fcpMs: med((r) => r.fcpMs),
    tbtMs: med((r) => r.tbtMs),
    cls: med((r) => r.cls),
    siMs: med((r) => r.siMs),
    ttiMs: med((r) => r.ttiMs),
    totalBytes: med((r) => r.totalBytes),
    requests: med((r) => r.requests),
    bytes: Object.fromEntries([...keys].map((k) => [k, med((r) => r.bytes[k] ?? 0)])),
    thirdParty: runs[0].thirdParty,
    runs: runs.map((r) => r.scores),
  };
}

const opt = args(process.argv.slice(2));
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const paths = opt.urls ?? baseline.urls;
mkdirSync(opt.out, { recursive: true });

const results = {};
for (const path of paths) {
  const runs = [];
  for (let i = 0; i < opt.runs; i++) {
    const file = join(opt.out, `${opt.preset}-${path.replace(/[^a-z0-9]+/gi, '_')}-${i + 1}.json`);
    runs.push(runOnce(opt.base + path, opt.preset, file));
  }
  results[path] = aggregate(runs);
  const s = results[path].scores;
  console.log(`${path}: perf ${s.performance} a11y ${s.accessibility} bp ${s['best-practices']} seo ${s.seo}  runs ${JSON.stringify(runs.map((r) => r.scores.performance))}`);
}

if (opt.json) writeFileSync(opt.json, JSON.stringify({ base: opt.base, preset: opt.preset, runs: opt.runs, results }, null, 2) + '\n');

const margin = baseline.margin;
const rows = [];
let failed = false;
let raised = false;
for (const path of paths) {
  const got = results[path].scores;
  const want = baseline.scores[opt.preset]?.[path] ?? {};
  for (const c of CATEGORIES) {
    const base = want[c];
    const m = margin[c] ?? margin.default;
    const status = base === undefined ? 'new' : got[c] < base - m ? 'FAIL' : got[c] > base ? 'better' : 'ok';
    if (status === 'FAIL') failed = true;
    rows.push(`| ${path} | ${c} | ${base ?? '-'} | ${got[c]} | ${m} | ${status} |`);
    if (opt.write && (base === undefined || got[c] > base)) {
      baseline.scores[opt.preset] ??= {};
      baseline.scores[opt.preset][path] ??= {};
      baseline.scores[opt.preset][path][c] = got[c];
      raised = true;
    }
  }
}

const table = ['| URL | category | baseline | median | margin | status |', '|---|---|---|---|---|---|', ...rows].join('\n');
console.log(`\nLighthouse (${opt.preset}, median of ${opt.runs}) against ${opt.base}\n\n${table}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Lighthouse (${opt.preset}, median of ${opt.runs})\n\n${table}\n`, { flag: 'a' });
}

if (opt.write) {
  if (raised) {
    writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
    console.log(`raised ${BASELINE}`);
  } else console.log('baseline unchanged: nothing improved');
} else if (opt.check && failed) {
  console.error(`a score fell more than its margin below ${BASELINE}`);
  process.exit(1);
}
