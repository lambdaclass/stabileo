#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

export function parseArgs(argv) {
  const o = { base: null, runs: 3, preset: 'mobile', write: false, check: true, out: join(webRoot, '.perf', 'lighthouse'), urls: null, json: null, baseline: join(webRoot, 'perf-lighthouse.json') };
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
    else if (a === '--baseline') o.baseline = resolve(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.base) throw new Error('--base is required');
  if (!Number.isInteger(o.runs) || o.runs < 1) throw new Error('--runs must be a positive integer');
  if (!['mobile', 'desktop'].includes(o.preset)) throw new Error('--preset is mobile or desktop');
  return o;
}

export function median(xs) {
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

export function summarize(lhr) {
  const a = lhr.audits;
  const reqs = a['network-requests']?.details?.items ?? [];
  const bytes = {};
  for (const r of reqs) {
    const k = kind(r);
    bytes[k] = (bytes[k] ?? 0) + (r.transferSize ?? 0);
  }
  const origin = new URL(lhr.finalDisplayedUrl).origin;
  const scores = {};
  for (const c of CATEGORIES) {
    const score = lhr.categories[c]?.score;
    if (typeof score !== 'number') throw new Error(`lighthouse gave no ${c} score for ${lhr.finalDisplayedUrl}`);
    scores[c] = Math.round(score * 100);
  }
  return {
    scores,
    lcpMs: Math.round(a['largest-contentful-paint']?.numericValue ?? 0),
    fcpMs: Math.round(a['first-contentful-paint']?.numericValue ?? 0),
    tbtMs: Math.round(a['total-blocking-time']?.numericValue ?? 0),
    cls: Number((a['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
    siMs: Math.round(a['speed-index']?.numericValue ?? 0),
    totalBytes: Math.round(a['total-byte-weight']?.numericValue ?? 0),
    requests: reqs.length,
    bytes,
    thirdParty: [...new Set(reqs.filter((r) => /^https?:/.test(r.url)).map((r) => new URL(r.url).origin).filter((o) => o !== origin))].sort(),
  };
}

export function aggregate(runs) {
  const med = (f) => median(runs.map(f));
  const keys = new Set(runs.flatMap((r) => Object.keys(r.bytes)));
  return {
    scores: Object.fromEntries(CATEGORIES.map((c) => [c, med((r) => r.scores[c])])),
    lcpMs: med((r) => r.lcpMs),
    fcpMs: med((r) => r.fcpMs),
    tbtMs: med((r) => r.tbtMs),
    cls: med((r) => r.cls),
    siMs: med((r) => r.siMs),
    totalBytes: med((r) => r.totalBytes),
    requests: med((r) => r.requests),
    bytes: Object.fromEntries([...keys].map((k) => [k, med((r) => r.bytes[k] ?? 0)])),
    thirdParty: [...new Set(runs.flatMap((r) => r.thirdParty))].sort(),
    runs: runs.map((r) => r.scores),
  };
}

export function compare(baseline, preset, results) {
  const rows = [];
  const failures = [];
  for (const [path, result] of Object.entries(results)) {
    const want = baseline.scores[preset]?.[path] ?? {};
    for (const c of CATEGORIES) {
      const base = want[c];
      const m = want.margin?.[c] ?? baseline.margin[c];
      if (!Number.isInteger(m) || m < 0) throw new Error(`margin.${c} for ${path} must be a non-negative integer`);
      const got = result.scores[c];
      const status = base === undefined ? 'no baseline' : got < base - m ? 'FAIL' : got > base + m ? 'RAISE' : 'ok';
      if (status !== 'ok') failures.push(`${path} ${c}: ${status} (baseline ${base ?? '-'}, median ${got}, margin ${m})`);
      rows.push({ path, category: c, base, got, margin: m, status });
    }
  }
  return { rows, failures };
}

export function raised(baseline, preset, results) {
  const next = structuredClone(baseline);
  let changed = false;
  for (const [path, result] of Object.entries(results)) {
    for (const c of CATEGORIES) {
      const base = next.scores[preset]?.[path]?.[c];
      if (base === undefined || result.scores[c] > base) {
        next.scores[preset] ??= {};
        next.scores[preset][path] ??= {};
        next.scores[preset][path][c] = result.scores[c];
        changed = true;
      }
    }
  }
  return { next, changed };
}

function runOnce(url, preset, outFile) {
  const bin = process.env.LIGHTHOUSE_BIN ?? join(webRoot, 'lighthouse', 'node_modules', '.bin', 'lighthouse');
  if (!existsSync(bin)) throw new Error(`no lighthouse at ${bin}: run make perf.lighthouse.deps`);
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

function main(argv) {
  const opt = parseArgs(argv);
  const baseline = JSON.parse(readFileSync(opt.baseline, 'utf8'));
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

  const { rows, failures } = compare(baseline, opt.preset, results);
  const table = [
    '| URL | category | baseline | median | margin | status |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.path} | ${r.category} | ${r.base ?? '-'} | ${r.got} | ${r.margin} | ${r.status} |`),
  ].join('\n');
  const report = `### Lighthouse (${opt.preset}, median of ${opt.runs}) against ${opt.base}\n\n${table}\n`;
  console.log(`\n${report}`);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, report, { flag: 'a' });

  if (opt.write) {
    const { next, changed } = raised(baseline, opt.preset, results);
    if (changed) {
      writeFileSync(opt.baseline, JSON.stringify(next, null, 2) + '\n');
      console.log(`raised ${opt.baseline}`);
    } else console.log('baseline unchanged: nothing improved');
    const regressions = compare(next, opt.preset, results).failures;
    for (const f of regressions) console.error(f);
    return regressions.length ? 1 : 0;
  }
  if (opt.check && failures.length) {
    for (const f of failures) console.error(f);
    console.error(`more than its margin away from ${opt.baseline}, or not in it: a FAIL is a regression; a RAISE is an improvement to record with --write from the workflow's numbers`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
