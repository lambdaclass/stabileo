/**
 * PROOF that the built site carries nothing that only exists on a developer's machine.
 *
 * ── The defect ──
 *
 * index.html swapped in the yellow development favicon with an inline script that
 * checked `location.hostname`. The script was correct. It still shipped the wrong icon
 * to everybody, because scripts/prerender.ts drives the built site in a headless
 * browser served from localhost: the swap fired, and the capture of `document.head`
 * happened after it. Nineteen pages went out declaring `/favicon-dev.svg`, and it sat
 * in the tab on stabileo.com until somebody noticed by eye.
 *
 * ── Why this is not an e2e test ──
 *
 * It was one, and driving a browser over seven pages to read seven strings cost seven
 * contexts. CI answered with `browser.newContext: Test ended` and took two unrelated
 * @smoke specs down with it — the known wedge documented in .github/workflows/ci.yml.
 *
 * ── Why it asserts on the bundle, not on `dist/` ──
 *
 * The prerendered pages are photographs of the bundle. If the dev swap is absent from
 * the emitted JavaScript, no browser driving it can produce a page that names the dev
 * icon — so the bundle is the property worth asserting, and the nineteen photographs
 * follow. Reading a checked-out `dist/` would prove less and cost more: it is
 * gitignored, is rewritten by `build`, `build:only` and Playwright's `VITE_E2E=1`
 * webServer alike, and is simply absent on a fresh clone. A test that reads it either
 * asserts against whichever build ran last, or skips itself — and a gate that skips
 * itself when the artifact is missing reports green on precisely the machine where
 * nobody has checked.
 *
 * So this spawns its own build, like `e2e-hook-gating.test.ts` does, and is declared in
 * PRODUCTION_BUILD_TESTS for the same reason. It cannot go inert.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '../../../..');
const OUT = '.dist-devassets';

const execFileAsync = promisify(execFile);

/**
 * Strings that must not reach a shipped PAGE.
 *
 * Scoped to HTML on purpose. The JavaScript bundle legitimately contains
 * `http://localhost:3001` — the `VITE_AI_BACKEND_URL` default in lib/ai/client.ts — so
 * grepping the bundle for it would fail on main today for an unrelated reason. What the
 * bundle must not contain is the dev icon, which is asserted separately below.
 */
const LOCAL_ONLY_IN_HTML = ['favicon-dev', 'localhost', '127.0.0.1'];

/** Every emitted file, absolute, recursively. */
function emitted(sub = ''): string[] {
  const root = resolve(WEB_ROOT, OUT, sub);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...emitted(sub ? `${sub}/${entry.name}` : entry.name));
    else out.push(resolve(root, entry.name));
  }
  return out;
}

describe('the build carries nothing that is local-only', () => {
  afterAll(() => rmSync(resolve(WEB_ROOT, OUT), { recursive: true, force: true }));

  it(
    'a production build leaks no local-only string and no local-only file',
    async () => {
      await execFileAsync(
        'npx',
        ['vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'],
        { cwd: WEB_ROOT, timeout: 240_000, maxBuffer: 32 * 1024 * 1024 },
      );

      const files = emitted();
      expect(files.length, 'the build emitted nothing').toBeGreaterThan(0);

      // THE proof: the dev swap is gone from the bundle, so no browser driving the
      // built app can photograph a page that names the dev icon.
      const js = files
        .filter((f) => f.endsWith('.js'))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n');
      // Without this the grep below would pass vacuously on an empty string.
      expect(js.length, 'no JavaScript was emitted').toBeGreaterThan(10_000);
      expect(js.includes('favicon-dev'), 'the bundle still names the dev icon').toBe(false);

      const html = files
        .filter((f) => f.endsWith('.html'))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n');
      expect(html.length, 'no HTML was emitted').toBeGreaterThan(0);
      for (const needle of LOCAL_ONLY_IN_HTML) {
        expect(html.includes(needle), `a shipped page leaks "${needle}"`).toBe(false);
      }

      // `public/` is copied verbatim, so a dev-only file placed there ships and deploys.
      const leaked = files.filter((f) => /favicon-dev/.test(f));
      expect(leaked, `these dev-only assets would be deployed:\n${leaked.join('\n')}`).toEqual([]);

      // Two separate claims about the icon. Asserting only "the href is not the dev one"
      // would pass a page that declares no icon at all, which is how this class of test
      // rots: drop the <link> and the assertion is silently satisfied.
      const index = readFileSync(resolve(WEB_ROOT, OUT, 'index.html'), 'utf8');
      const link = index.match(/<link[^>]*\brel="icon"[^>]*>/)?.[0];
      expect(link, 'the built index.html declares no <link rel="icon">').toBeDefined();
      expect(link).toMatch(/href="\/favicon\.svg"/);
    },
    300_000,
  );

  it('the dev swap is gated on the build-time flag, so the bundler can drop it', () => {
    const src = readFileSync(resolve(WEB_ROOT, 'src/dev-favicon.ts'), 'utf8');
    expect(src).toContain('import.meta.env.DEV');
    // A runtime hostname test is the original defect: it fires inside the headless
    // browser of the prerender, which drives the built app from a local HTTP server.
    // Comments are stripped first — the module explains that defect in prose.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('location.hostname');
  });

  it('main.ts imports the swap before the CSS and component graph', () => {
    const main = readFileSync(resolve(WEB_ROOT, 'src/main.ts'), 'utf8');
    const imports = [...main.matchAll(/^import .*$/gm)].map((m) => m[0]);
    expect(imports[0], 'the dev favicon swap must be the first import').toContain('./dev-favicon');
  });

  it('index.html carries no icon-swapping script of its own', () => {
    const html = readFileSync(resolve(WEB_ROOT, 'index.html'), 'utf8');
    for (const needle of LOCAL_ONLY_IN_HTML) {
      expect(html.includes(needle), `index.html mentions "${needle}"`).toBe(false);
    }
  });

  it('public/ holds no development-only asset', () => {
    // The cheap half of the build assertion above: catches a dev asset being put back
    // without waiting 40 s for a build to prove it would ship.
    const pub = readdirSync(resolve(WEB_ROOT, 'public'));
    expect(pub.filter((f) => /-dev\./.test(f))).toEqual([]);
  });
});
