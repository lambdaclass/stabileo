import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedBuild, SHARED_PLAIN_BUILD } from './shared-build';

const execFileAsync = promisify(execFile);
const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const FIRST = resolve(WEB_ROOT, '.dist-reproducible-a');
const SECOND = resolve(WEB_ROOT, '.dist-reproducible-b');
const MATTIASSON = '/research/benchmarks/mattiasson-elastica';
const PAGES = ['/', '/research/fracture/shauer-2025', '/research/benchmarks/newmark-1959', '/research/form-finding/pastrana-2026', '/tools/simply-supported-beam'];

function files(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((path) => statSync(join(root, path)).isFile())
    .sort();
}

function difference(path: string): string {
  const a = readFileSync(join(FIRST, path));
  const b = readFileSync(join(SECOND, path));
  let offset = 0;
  while (offset < a.length && offset < b.length && a[offset] === b[offset]) offset++;
  const context = (buffer: Buffer) => JSON.stringify(buffer.subarray(Math.max(0, offset - 100), offset + 100).toString('utf8'));
  return `${path}: first difference at byte ${offset} (sizes ${a.length} and ${b.length})\n  concurrency 1: ${context(a)}\n  concurrency 4: ${context(b)}`;
}

async function prepareBuild(out: string) {
  const shared = sharedBuild(SHARED_PLAIN_BUILD);
  if (shared) {
    cpSync(shared, out, { recursive: true });
  } else {
    await execFileAsync('npx', ['vite', 'build', '--outDir', relative(WEB_ROOT, out), '--emptyOutDir', '--logLevel', 'error'], {
      cwd: WEB_ROOT, timeout: 300_000, maxBuffer: 32 * 1024 * 1024,
    });
  }
}

async function prerender(out: string, concurrency: string, paths = PAGES) {
  await execFileAsync('npx', ['tsx', 'scripts/prerender.ts'], {
    cwd: WEB_ROOT,
    timeout: 300_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PRERENDER_OUT: out, PRERENDER_ONLY: paths.join(','), PRERENDER_GITHUB_STARS: '1234', PRERENDER_CONCURRENCY: concurrency },
  });
}

describe('two prerenders of one build are byte-identical (#875)', () => {
  let entry: string;

  beforeAll(async () => {
    await prepareBuild(FIRST);
    entry = readFileSync(join(FIRST, 'index.html'), 'utf8');
    cpSync(FIRST, SECOND, { recursive: true });
    await prerender(FIRST, '1');
    await prerender(SECOND, '4');
  }, 900_000);

  afterAll(() => {
    rmSync(FIRST, { recursive: true, force: true });
    rmSync(SECOND, { recursive: true, force: true });
  });

  it('both runs wrote the same files, the prerendered pages among them', () => {
    expect(files(SECOND)).toEqual(files(FIRST));
    for (const page of ['index.html', 'en/index.html', 'es/research/fracture/shauer-2025/index.html', 'pt/tools/simply-supported-beam/index.html']) {
      expect(readFileSync(join(FIRST, page), 'utf8')).toContain('<div id="prerender">');
    }
  });

  it('every file is byte-identical', () => {
    const differing = files(FIRST).filter((path) => !readFileSync(join(FIRST, path)).equals(readFileSync(join(SECOND, path))));
    expect(differing, differing.map(difference).join('\n')).toEqual([]);
  });

  async function withDelayedSolver(pages: string[], check: (html: (locale: string, path: string) => string) => void) {
    const out = mkdtempSync(join(WEB_ROOT, '.dist-live-benchmarks-'));
    try {
      cpSync(FIRST, out, { recursive: true });
      const delaySolver = `<script>
        document.currentScript.remove();
        if (location.pathname.includes('/research/benchmarks/')) {
          const fetchResource = window.fetch.bind(window);
          window.fetch = async (...args) => {
            const response = await fetchResource(...args);
            if (/dedaliano_engine_bg-.*\\.wasm$/.test(response.url)) {
              await response.clone().arrayBuffer();
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            return response;
          };
        }
      </script>`;
      writeFileSync(join(out, 'index.html'), entry.replace('<head>', `<head>${delaySolver}`));
      await prerender(out, '4', pages);
      check((locale, path) => readFileSync(join(out, locale, path, 'index.html'), 'utf8'));
    } finally {
      rmSync(out, { recursive: true });
    }
  }

  it('known wrong result: #2365 — captures completed Mattiasson results when the solver starts late', async () => {
    await withDelayedSolver([MATTIASSON], html => {
      for (const locale of ['en', 'tr', 'zh']) {
        expect(html(locale, MATTIASSON), locale).toMatch(/data-testid="mattiasson-summary"[^>]*>[^<]*5\/5/);
      }
    });
  }, 300_000);

  it('known wrong result: #2365 — waits for the other research benchmarks that compute on page load', async () => {
    const shell = '/research/benchmarks/shell-obstacle-course';
    const macneal = '/research/benchmarks/macneal-harder-1985';
    const plastic = '/research/benchmarks/plastic-collapse';
    await withDelayedSolver([shell, macneal, plastic], html => {
      expect(html('en', shell)).toMatch(/data-testid="shell-summary"[^>]*>Finest selected meshes passing: \d+\/3/);
      expect(html('en', macneal)).toContain('data-testid="summary-frame"');
      expect(html('en', plastic)).toMatch(/data-testid="source"[^>]*>Live computation/);
    });
  }, 300_000);

  it('the pinned star count reached the header instead of a per-page fetch', () => {
    expect(readFileSync(join(FIRST, 'en/index.html'), 'utf8')).toMatch(/>1\.2k</);
  });
});

it('prerenders the Chinese slab tool after its delayed worker response', async () => {
  const out = mkdtempSync(join(WEB_ROOT, '.dist-prerender-model-'));
  try {
    await prepareBuild(out);
    const assets = join(out, 'assets');
    const workers = readdirSync(assets).filter(name => /^run\.worker-.*\.js$/.test(name));
    expect(workers.length).toBeGreaterThan(0);
    for (const name of workers) {
      const worker = join(assets, name);
      const source = readFileSync(worker, 'utf8');
      writeFileSync(worker, `const postModelResult = self.postMessage.bind(self);
self.postMessage = (...args) => { setTimeout(() => postModelResult(...args), 3500); };
${source}`);
    }

    await execFileAsync('npx', ['tsx', 'scripts/prerender.ts'], {
      cwd: WEB_ROOT, timeout: 300_000, maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, PRERENDER_OUT: out, PRERENDER_ONLY: '/tools/slab-on-columns', PRERENDER_GITHUB_STARS: 'none' },
    });
    const html = readFileSync(join(out, 'zh/tools/slab-on-columns/index.html'), 'utf8');
    expect(html.includes('data-testid="readout-maxDeflection"'), 'the rendered slab result is missing').toBe(true);
  } finally {
    rmSync(out, { recursive: true });
  }
}, 600_000);

it('Ferrari prerenders omit live WebGL diagnostics (#2483)', async () => {
  const path = '/research/stability/ferrari-sigmund-2025';
  const out = mkdtempSync(join(WEB_ROOT, '.dist-prerender-ferrari-'));
  try {
    await prepareBuild(out);
    await prerender(out, '4', [path]);
    for (const locale of ['es', 'en', 'pt', 'zh', 'hu']) {
      const html = readFileSync(join(out, locale + path, 'index.html'), 'utf8');
      const canvas = html.match(/<canvas data-engine="three\.js [^"]+"[^>]*>/)?.[0];
      expect(canvas, locale).toBeDefined();
      expect(canvas?.match(/\bdata-[\w-]+=/g), locale).toEqual(['data-engine=']);
      expect(html).toContain('data-testid="ferrari-buckling"');
      expect(html).toContain('data-testid="ferrari-reference"');
      expect(html).toContain('<table><caption>');
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}, 600_000);
