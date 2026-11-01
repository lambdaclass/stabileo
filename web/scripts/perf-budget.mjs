#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants, gzipSync } from 'node:zlib';

const webRoot = fileURLToPath(new URL('..', import.meta.url));

export const ROUTES = {
  '/en/': { html: 'en/index.html' },
  '/es/': { html: 'es/index.html' },
  '/pt/': { html: 'pt/index.html' },
  '/en/blog/how-stabileo-checks-its-results/': { html: 'en/blog/how-stabileo-checks-its-results/index.html' },
  '/app/basic': { html: 'index.html', loaders: ['src/load-app.ts'] },
};

const ENGINE_WASM = /^assets\/dedaliano_engine_bg-[\w-]+\.wasm$/;
const LOADED_LINK = /\brel=["']?(?:stylesheet|modulepreload|preload|icon)\b/i;

export function htmlRefs(html) {
  const refs = [];
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const isLink = /^<link/i.test(tag);
    if (isLink && !LOADED_LINK.test(tag)) continue;
    const m = tag.match(isLink ? /\bhref=["']([^"']+)["']/i : /\bsrc=["']([^"']+)["']/i);
    if (!m || /^(?:[a-z]+:)?\/\//i.test(m[1]) || m[1].startsWith('data:')) continue;
    refs.push(m[1].replace(/^\//, '').split(/[?#]/)[0]);
  }
  return refs;
}

export function staticClosure(graph, start) {
  const files = new Set();
  const visit = (file) => {
    if (files.has(file)) return;
    files.add(file);
    const chunk = graph.chunks[file];
    if (!chunk) return;
    for (const f of chunk.css) files.add(f);
    for (const dep of chunk.imports) visit(dep);
  };
  for (const f of start) visit(f);
  return files;
}

function chunkFor(graph, module) {
  const hits = Object.entries(graph.chunks).filter(([, c]) => c.module === module);
  if (hits.length !== 1) throw new Error(`expected one chunk for ${module}, found ${hits.length}: the route definitions in perf-budget.mjs no longer match the app`);
  return hits[0][0];
}

export function routeFiles(graph, route, readHtml) {
  const start = htmlRefs(readHtml(route.html));
  for (const module of route.loaders ?? []) {
    const loader = chunkFor(graph, module);
    start.push(loader, ...graph.chunks[loader].dynamicImports);
  }
  return [...staticClosure(graph, start)].sort();
}

export function engineWasm(graph) {
  const wasm = graph.assets.filter((f) => ENGINE_WASM.test(f));
  return wasm.length === 1 ? wasm[0] : null;
}

export function sizeOf(bytes) {
  return { raw: bytes.length, gzip: gzipSync(bytes, { level: constants.Z_BEST_COMPRESSION }).length };
}

export function measure(dist, graph, routes = ROUTES) {
  if (resolve(graph.outDir) !== resolve(dist)) throw new Error(`the bundle graph is of ${graph.outDir}, not ${dist}: rebuild with npm run build`);
  const cache = new Map();
  const bytes = (f) => {
    const p = join(dist, f);
    if (!existsSync(p)) throw new Error(`${f} is not in ${dist}: the bundle graph is stale, rebuild with npm run build`);
    return readFileSync(p);
  };
  const size = (f) => {
    if (!cache.has(f)) cache.set(f, sizeOf(bytes(f)));
    return cache.get(f);
  };
  const out = {};
  for (const [path, route] of Object.entries(routes)) {
    const files = routeFiles(graph, route, (f) => bytes(f).toString('utf8'));
    const sizes = files.map(size);
    out[path] = { gzip: sizes.reduce((a, s) => a + s.gzip, 0), raw: sizes.reduce((a, s) => a + s.raw, 0), files: files.length };
  }
  return out;
}

export function compare(baseline, measured) {
  const margin = baseline.margin_gzip_bytes;
  if (!Number.isInteger(margin) || margin < 0) throw new Error('margin_gzip_bytes must be a non-negative integer');
  const want = Object.keys(baseline.routes).sort();
  const got = Object.keys(measured).sort();
  const failures = [];
  if (JSON.stringify(want) !== JSON.stringify(got)) failures.push(`routes differ: baseline ${want.join(' ')}, measured ${got.join(' ')}`);
  const rows = [];
  for (const path of got) {
    const base = baseline.routes[path]?.gzip;
    const now = measured[path].gzip;
    let status = 'ok';
    if (!Number.isInteger(base)) status = 'no baseline';
    else if (now > base + margin) status = 'GREW';
    else if (now < base - margin) status = 'SHRANK';
    if (status !== 'ok') failures.push(`${path}: ${status} (baseline ${base ?? '-'}, measured ${now} gzip bytes, margin ${margin})`);
    rows.push({ path, base, now, delta: Number.isInteger(base) ? now - base : null, raw: measured[path].raw, status });
  }
  return { failures, rows };
}

export function written(baseline, measured, acceptGrowth) {
  const routes = {};
  for (const [path, m] of Object.entries(measured)) {
    const base = baseline.routes[path];
    routes[path] = acceptGrowth || !base || m.gzip < base.gzip ? { gzip: m.gzip, raw: m.raw } : base;
  }
  return { ...baseline, routes };
}

function table(rows) {
  const kb = (n) => (n / 1024).toFixed(1);
  return [
    '| route | baseline gzip KB | measured gzip KB | delta bytes | raw KB | status |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.path} | ${r.base === undefined ? '-' : kb(r.base)} | ${kb(r.now)} | ${r.delta ?? '-'} | ${kb(r.raw)} | ${r.status} |`),
  ].join('\n');
}

function main(argv) {
  const opt = { dist: join(webRoot, 'dist'), graph: join(webRoot, '.perf', 'bundle-graph.json'), baseline: join(webRoot, 'perf-budget.json'), write: false, acceptGrowth: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dist') opt.dist = resolve(argv[++i]);
    else if (a === '--graph') opt.graph = resolve(argv[++i]);
    else if (a === '--baseline') opt.baseline = resolve(argv[++i]);
    else if (a === '--write') opt.write = true;
    else if (a === '--accept-growth') opt.acceptGrowth = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!existsSync(opt.graph)) throw new Error(`no bundle graph at ${opt.graph}: run npm run build first`);
  const graph = JSON.parse(readFileSync(opt.graph, 'utf8'));
  const baseline = JSON.parse(readFileSync(opt.baseline, 'utf8'));
  const measured = measure(opt.dist, graph);
  const { failures, rows } = compare(baseline, measured);
  const wasm = engineWasm(graph);
  const wasmLine = wasm ? `Engine WASM, loaded by /app/* and not gated: ${(sizeOf(readFileSync(join(opt.dist, wasm))).gzip / 1024).toFixed(1)} KB gzip.` : 'No engine WASM in this build (make wasm).';
  const report = `### Route sizes (gzip -9, margin ${baseline.margin_gzip_bytes} bytes)\n\n${table(rows)}\n\n${wasmLine}\n`;
  console.log(report);
  console.log(`measured: ${JSON.stringify(Object.fromEntries(Object.entries(measured).map(([p, m]) => [p, { gzip: m.gzip, raw: m.raw }])))}`);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, report, { flag: 'a' });
  if (opt.write || opt.acceptGrowth) {
    writeFileSync(opt.baseline, JSON.stringify(written(baseline, measured, opt.acceptGrowth), null, 2) + '\n');
    const grew = rows.filter((r) => r.status === 'GREW');
    if (!opt.acceptGrowth && grew.length) {
      console.error(`not raised (a ratchet only tightens): ${grew.map((r) => r.path).join(', ')}. If the growth is deliberate, run make perf.budget.accept and say why in the pull request.`);
      return 1;
    }
    console.log(`wrote ${opt.baseline}`);
    return 0;
  }
  if (failures.length) {
    for (const f of failures) console.error(f);
    console.error('A route grew: make it smaller, or run make perf.budget.accept and justify the growth in the pull request. A route shrank: run make perf.budget.write to tighten the baseline.');
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
