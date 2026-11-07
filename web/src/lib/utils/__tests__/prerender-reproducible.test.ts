import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cpSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const FIRST = resolve(WEB_ROOT, '.dist-reproducible-a');
const SECOND = resolve(WEB_ROOT, '.dist-reproducible-b');
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

async function prerender(out: string, concurrency: string) {
  await execFileAsync('npx', ['tsx', 'scripts/prerender.ts'], {
    cwd: WEB_ROOT,
    timeout: 300_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PRERENDER_OUT: out, PRERENDER_ONLY: PAGES.join(','), PRERENDER_GITHUB_STARS: '1234', PRERENDER_CONCURRENCY: concurrency },
  });
}

describe('two prerenders of one build are byte-identical (#875)', () => {
  beforeAll(async () => {
    await execFileAsync('npx', ['vite', 'build', '--outDir', relative(WEB_ROOT, FIRST), '--emptyOutDir', '--logLevel', 'error'], {
      cwd: WEB_ROOT, timeout: 300_000, maxBuffer: 32 * 1024 * 1024,
    });
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

  it('the pinned star count reached the header instead of a per-page fetch', () => {
    expect(readFileSync(join(FIRST, 'en/index.html'), 'utf8')).toMatch(/>1\.2k</);
  });
});
