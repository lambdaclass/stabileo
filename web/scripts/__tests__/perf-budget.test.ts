import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROUTES, compare, engineWasm, htmlRefs, measure, sizeOf, staticClosure, written } from '../perf-budget.mjs';

const script = new URL('../perf-budget.mjs', import.meta.url).pathname;

const routes = {
  '/en/': { html: 'en/index.html' },
  '/app/basic': { html: 'index.html', loaders: ['src/load-app.ts'] },
};

function fixture() {
  const dist = mkdtempSync(join(tmpdir(), 'perf-budget-'));
  const files: Record<string, string> = {
    'index.html': '<script type="module" src="/assets/index-a.js"></script><link rel="stylesheet" href="/assets/index-a.css"><link rel="canonical" href="https://stabileo.com/">',
    'en/index.html': '<script type="module" src="/assets/index-a.js"></script><link rel="modulepreload" href="/assets/public-a.js"><link rel="alternate" href="/es/">',
    'assets/index-a.js': 'import "./shared-a.js"; import("./load-app-a.js");',
    'assets/load-app-a.js': 'import("./App-a.js");',
    'assets/index-a.css': 'body{}',
    'assets/shared-a.js': 'export const shared = 1;',
    'assets/public-a.js': 'export const pub = "x".repeat(40);',
    'assets/App-a.js': 'import "./three-a.js"; import("./lazy-a.js");',
    'assets/App-a.css': '.app{}',
    'assets/three-a.js': 'export const three = 3;',
    'assets/lazy-a.js': 'export const lazy = "never counted";',
    'assets/dedaliano_engine_bg-abc123.wasm': '\0asm wasm bytes',
  };
  for (const route of Object.values(ROUTES)) files[route.html] ??= files['en/index.html'];
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(join(dist, f, '..'), { recursive: true });
    writeFileSync(join(dist, f), body);
  }
  const chunk = (module: string | null, imports: string[] = [], css: string[] = [], dynamicImports: string[] = [], assets: string[] = []) => ({ name: 'x', module, imports, dynamicImports, css, assets });
  const graph = {
    outDir: dist,
    chunks: {
      'assets/index-a.js': chunk('index.html', ['assets/shared-a.js'], ['assets/index-a.css'], ['assets/load-app-a.js']),
      'assets/load-app-a.js': chunk('src/load-app.ts', [], [], ['assets/App-a.js']),
      'assets/shared-a.js': chunk(null),
      'assets/public-a.js': chunk('src/public.ts'),
      'assets/App-a.js': chunk(null, ['assets/three-a.js'], ['assets/App-a.css'], ['assets/lazy-a.js']),
      'assets/three-a.js': chunk(null, [], [], [], ['assets/dedaliano_engine_bg-abc123.wasm', 'assets/KaTeX_Main-a.woff']),
      'assets/lazy-a.js': chunk('src/lazy.ts'),
    },
    assets: ['assets/KaTeX_Main-a.woff', 'assets/dedaliano_engine_bg-abc123.wasm', 'assets/index-a.css', 'assets/App-a.css', 'index.html'],
  };
  const graphFile = join(dist, '..', `${dist.split('/').pop()}-graph.json`);
  writeFileSync(graphFile, JSON.stringify(graph));
  const size = (list: string[]) => list.reduce((a, f) => ({ raw: a.raw + sizeOf(readFileSync(join(dist, f))).raw, gzip: a.gzip + sizeOf(readFileSync(join(dist, f))).gzip }), { raw: 0, gzip: 0 });
  return { dist, graph, graphFile, files, size };
}

describe('perf-budget', () => {
  it('reads only the files an HTML page loads', () => {
    expect(htmlRefs('<script src="/assets/a.js?v=1"></script><link rel="stylesheet" href="/assets/a.css"><link rel="preload" as="font" href="/fonts/x.woff2"><link rel="icon" href="/favicon.svg"><link rel="alternate" href="/es/"><link rel="canonical" href="https://stabileo.com/"><script src="https://challenges.cloudflare.com/x.js"></script><a href="/app/basic">')).toEqual(['assets/a.js', 'assets/a.css', 'fonts/x.woff2', 'favicon.svg']);
  });

  it('follows static imports and their CSS, never dynamic imports or assets fetched on use', () => {
    const { graph } = fixture();
    expect([...staticClosure(graph, ['assets/App-a.js'])].sort()).toEqual(['assets/App-a.css', 'assets/App-a.js', 'assets/three-a.js']);
  });

  it('sums each route: HTML closure, its loader and what the loader imports, never the engine WASM', () => {
    const { dist, graph, size } = fixture();
    const m = measure(dist, graph, routes);
    expect(m['/en/']).toEqual({ ...size(['en/index.html', 'assets/index-a.js', 'assets/shared-a.js', 'assets/index-a.css', 'assets/public-a.js']), files: 5 });
    expect(m['/app/basic']).toEqual({ ...size(['index.html', 'assets/index-a.js', 'assets/shared-a.js', 'assets/index-a.css', 'assets/load-app-a.js', 'assets/App-a.js', 'assets/App-a.css', 'assets/three-a.js']), files: 8 });
    expect(engineWasm(graph)).toBe('assets/dedaliano_engine_bg-abc123.wasm');
    expect(engineWasm({ ...graph, assets: [] })).toBeNull();
  });

  it('refuses a graph of another build, a missing file and a moved chunk', () => {
    const { dist, graph } = fixture();
    expect(() => measure(join(dist, 'other'), graph, routes)).toThrow(/bundle graph is of/);
    expect(() => measure(dist, { ...graph, chunks: { ...graph.chunks, 'assets/index-a.js': { ...graph.chunks['assets/index-a.js'], imports: ['assets/gone.js'] } } }, routes)).toThrow(/gone\.js is not in/);
    expect(() => measure(dist, graph, { '/x': { html: 'index.html', loaders: ['src/moved.ts'] } })).toThrow(/one chunk for src\/moved\.ts/);
  });

  it('passes within the margin and fails growth, shrinkage, a missing baseline and a missing route', () => {
    const baseline = { margin_gzip_bytes: 10, routes: { '/en/': { gzip: 1000, raw: 3000 }, '/app/basic': { gzip: 5000, raw: 9000 } } };
    const at = (en: number, app: number) => ({ '/en/': { gzip: en, raw: 1 }, '/app/basic': { gzip: app, raw: 1 } });
    expect(compare(baseline, at(1010, 4990)).failures).toEqual([]);
    expect(compare(baseline, at(1011, 5000)).failures).toEqual(['/en/: GREW (baseline 1000, measured 1011 gzip bytes, margin 10)']);
    expect(compare(baseline, at(1000, 4989)).failures).toEqual(['/app/basic: SHRANK (baseline 5000, measured 4989 gzip bytes, margin 10)']);
    expect(compare(baseline, { '/en/': { gzip: 1000, raw: 1 } }).failures[0]).toMatch(/routes differ/);
    expect(compare({ margin_gzip_bytes: 10, routes: { '/en/': {} } }, { '/en/': { gzip: 1, raw: 1 } }).failures[0]).toMatch(/no baseline/);
    expect(() => compare({ routes: {} }, {})).toThrow(/margin_gzip_bytes/);
  });

  it('--write only lowers; --accept-growth records growth', () => {
    const baseline = { margin_gzip_bytes: 0, routes: { '/en/': { gzip: 1000, raw: 3000 }, '/app/basic': { gzip: 5000, raw: 9000 } } };
    const measured = { '/en/': { gzip: 900, raw: 2900, files: 1 }, '/app/basic': { gzip: 5100, raw: 9100, files: 1 } };
    expect(written(baseline, measured, false).routes).toEqual({ '/en/': { gzip: 900, raw: 2900 }, '/app/basic': { gzip: 5000, raw: 9000 } });
    expect(written(baseline, measured, true).routes).toEqual({ '/en/': { gzip: 900, raw: 2900 }, '/app/basic': { gzip: 5100, raw: 9100 } });
  });

  it('the committed baseline covers every route with a measured size and a margin', () => {
    const committed = JSON.parse(readFileSync(new URL('../../perf-budget.json', import.meta.url), 'utf8'));
    expect(Object.keys(committed.routes).sort()).toEqual(Object.keys(ROUTES).sort());
    for (const r of Object.values(committed.routes) as { gzip: number; raw: number }[]) {
      expect(Number.isInteger(r.gzip) && r.gzip > 0 && r.raw > r.gzip).toBe(true);
    }
    expect(Number.isInteger(committed.margin_gzip_bytes)).toBe(true);
  });

  it('the CLI fails without a build, passes its own measurement, fails growth and ratchets', () => {
    const { dist, graphFile } = fixture();
    const baselineFile = join(dist, '..', `${dist.split('/').pop()}-budget.json`);
    const run = (...extra: string[]) => spawnSync(process.execPath, [script, '--dist', dist, '--graph', graphFile, '--baseline', baselineFile, ...extra], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
    const missing = spawnSync(process.execPath, [script, '--dist', dist, '--graph', join(dist, 'none.json')], { encoding: 'utf8' });
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toMatch(/no bundle graph/);

    writeFileSync(baselineFile, JSON.stringify({ margin_gzip_bytes: 0, routes: {} }));
    expect(run().status).toBe(1);
    expect(run('--accept-growth').status).toBe(0);
    const measured = JSON.parse(readFileSync(baselineFile, 'utf8'));
    expect(Object.keys(measured.routes).sort()).toEqual(Object.keys(ROUTES).sort());
    expect(run().status).toBe(0);

    writeFileSync(join(dist, 'assets/three-a.js'), 'export const three = "' + 'grown '.repeat(500) + '";');
    const grew = run();
    expect(grew.status).toBe(1);
    expect(grew.stderr).toMatch(/\/app\/basic: GREW/);
    expect(grew.stderr).not.toMatch(/\/en\/: GREW/);
    expect(run('--write').status).toBe(1);
    expect(JSON.parse(readFileSync(baselineFile, 'utf8'))).toEqual(measured);

    writeFileSync(join(dist, 'assets/three-a.js'), '');
    const shrank = run();
    expect(shrank.status).toBe(1);
    expect(shrank.stderr).toMatch(/\/app\/basic: SHRANK/);
    expect(run('--write').status).toBe(0);
    const tightened = JSON.parse(readFileSync(baselineFile, 'utf8'));
    expect(tightened.routes['/app/basic'].gzip).toBeLessThan(measured.routes['/app/basic'].gzip);
    expect(tightened.routes['/en/']).toEqual(measured.routes['/en/']);
    expect(run().status).toBe(0);
  });
});
