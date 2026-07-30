/**
 * PROOF that the browser-test hooks are build-time gated.
 *
 * A production artifact must not expose `window.__stabileo` even if a user appends
 * `?e2e=1`. This is enforced by a statically-replaced `import.meta.env.VITE_E2E === '1'`
 * check in `main.ts`, which lets the bundler eliminate the dynamic import entirely.
 *
 * Rather than trust that reasoning, this test runs BOTH real Vite builds into throwaway
 * output directories and greps the emitted JavaScript:
 *
 *   without VITE_E2E → the hook module must be ABSENT from the bundle
 *   with VITE_E2E=1  → the hook module must be PRESENT
 *
 * Two production builds are slow (~35 s total), hence the extended timeout. This is the
 * only test in the suite that shells out to a build.
 *
 * The builds run ASYNCHRONOUSLY on purpose. A synchronous `execFileSync` blocks the
 * Vitest worker's event loop for the whole build, which starves its RPC heartbeat and
 * makes the run die with `[vitest-worker]: Timeout calling "onTaskUpdate"` even though
 * every test passed. Awaiting `execFile` keeps the worker responsive.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '../../../..');

/** Strings that exist ONLY inside the hook module.
 *  (Deliberately not `orientationSuspectCount` — that is a real verificationStore
 *  getter the design toolbar uses, so it legitimately ships in production.) */
const HOOK_MARKERS = ['__stabileoActions', 'canvasInkRatio', 'e2eQueryEnabled'];
const OUT_OFF = '.dist-hookgate-off';
const OUT_ON = '.dist-hookgate-on';

const execFileAsync = promisify(execFile);

async function build(outDir: string, env: Record<string, string>): Promise<void> {
  await execFileAsync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: WEB_ROOT,
    env: { ...process.env, ...env },
    timeout: 240_000,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function bundleText(outDir: string): string {
  const assets = resolve(WEB_ROOT, outDir, 'assets');
  if (!existsSync(assets)) return '';
  let all = '';
  for (const f of readdirSync(assets)) {
    if (!f.endsWith('.js')) continue;
    all += readFileSync(resolve(assets, f), 'utf8');
  }
  return all;
}

function cleanup(): void {
  for (const d of [OUT_OFF, OUT_ON]) {
    rmSync(resolve(WEB_ROOT, d), { recursive: true, force: true });
  }
}

describe('E2E hook build-time gating', () => {
  afterAll(cleanup);

  it('a normal production build contains NO test-hook code', async () => {
    await build(OUT_OFF, {});
    const js = bundleText(OUT_OFF);
    expect(js.length, 'the build must produce JavaScript assets').toBeGreaterThan(10_000);
    for (const marker of HOOK_MARKERS) {
      expect(js.includes(marker), `production bundle must not contain "${marker}"`).toBe(false);
    }
    // The window property assignment itself must be gone too.
    expect(js.includes('__stabileo')).toBe(false);
  }, 300_000);

  it('a VITE_E2E=1 build DOES contain the test-hook code', async () => {
    await build(OUT_ON, { VITE_E2E: '1' });
    const js = bundleText(OUT_ON);
    expect(js.length).toBeGreaterThan(10_000);
    for (const marker of HOOK_MARKERS) {
      expect(js.includes(marker), `e2e bundle must contain "${marker}"`).toBe(true);
    }
  }, 300_000);

  it('main.ts gates the import on the build-time flag, not only on the query flag', () => {
    const main = readFileSync(resolve(WEB_ROOT, 'src/main.ts'), 'utf8');
    expect(main).toContain("import.meta.env.VITE_E2E === '1'");
    // A dynamic import is what lets the bundler drop the module.
    expect(main).toMatch(/import\(['"]\.\/lib\/utils\/e2e-hooks['"]\)/);
    // A static top-level import would defeat the gate.
    expect(main).not.toMatch(/^import .*e2e-hooks/m);
  });

  it('the hook module requires BOTH gates and exposes a frozen, read-only surface', () => {
    const src = readFileSync(resolve(WEB_ROOT, 'src/lib/utils/e2e-hooks.ts'), 'utf8');
    expect(src).toContain('return e2eBuildEnabled() && e2eQueryEnabled();');
    expect(src).toContain("import.meta.env.VITE_E2E === '1'");
    expect(src).toContain('Object.freeze(hooks)');
    expect(src).toContain('Object.freeze(actions)');
    // The read-only query object must not carry mutating members.
    const hooksIface = src.slice(src.indexOf('export interface StabileoTestHooks'), src.indexOf('export interface StabileoTestActions'));
    for (const banned of ['loadExample', 'solve(', 'openDesignTab', 'designAll', 'autoDesign']) {
      expect(hooksIface.includes(banned), `__stabileo must not expose "${banned}"`).toBe(false);
    }
  });

  it('Playwright builds its preview server with VITE_E2E=1', () => {
    const cfg = readFileSync(resolve(WEB_ROOT, 'playwright.config.ts'), 'utf8');
    expect(cfg).toContain('VITE_E2E=1 npm run build');
  });
});
