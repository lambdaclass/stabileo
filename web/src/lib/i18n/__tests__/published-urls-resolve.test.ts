/**
 * PROOF that every URL the site publishes is a URL the host actually serves.
 *
 * ── The defect ──
 *
 * The pages are directories on disk, and GitHub Pages answers a directory
 * request with a 301 to the slashed form. That cannot be disabled. The URL
 * builders emitted the UNSLASHED form, so the site published eighteen
 * addresses it does not serve:
 *
 *   sitemap says      https://stabileo.com/en/blog
 *   the host answers  301 -> https://stabileo.com/en/blog/
 *   and that page declared  <link rel="canonical" href=".../en/blog">
 *
 * — a canonical pointing at a URL that redirects back to the page declaring
 * it, and an hreflang set built the same way. Google resolves the chain in
 * practice, but it is explicit that the canonical and the hreflang have to
 * agree or it may ignore the hreflang, which is the three-language linkage
 * the whole prefix scheme exists to express.
 *
 * ── Why this checks the artifact, and on disk ──
 *
 * Because the thing being asserted IS the disk layout. GitHub Pages serves
 * `/a/b/` from `a/b/index.html` with no redirect, and `/a/b` with one. A local
 * preview server does not reproduce that — `vite preview` happily serves both
 * — so a test over HTTP would pass on exactly the bug that reached production.
 * The file must exist at the path the URL names.
 *
 * ── Why it builds its own, rather than reading dist/ ──
 *
 * It used to read a checked-out `dist/` and `describe.skip` itself when that
 * was absent. Measured on this branch: with `dist/sitemap.xml` moved aside the
 * whole file reported `4 skipped` and the run went green. A gate that skips
 * itself when the artifact is missing reports success on precisely the machine
 * where nobody has checked — and reading whatever build ran last is barely
 * better, since a stale `dist/` can satisfy it while the current tree is
 * broken.
 *
 * So it spawns its own build into a throwaway directory, like
 * `no-dev-assets-in-build.test.ts` and `e2e-hook-gating.test.ts` do, and is
 * declared in PRODUCTION_BUILD_TESTS for the same reason. It cannot go inert.
 *
 * Living under `src/` is part of that: `harness-architecture.test.ts` only
 * walks `src/`, so in `scripts/__tests__/` this file was invisible to the rule
 * that a process-spawning test must be declared. Now the harness polices this
 * declaration itself.
 *
 * Cost: one `vite build` plus one prerender pass, and the prerender drives a
 * headless Chromium over nineteen pages. That is the price of an assertion
 * about the artifact rather than about the intention; the build pass is serial
 * for exactly this kind of thing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '../../../..');
const OUT = '.dist-publishedurls';
const DIST = resolve(WEB_ROOT, OUT);
const SITEMAP = join(DIST, 'sitemap.xml');
const ORIGIN = 'https://stabileo.com';

const execFileAsync = promisify(execFile);

/**
 * A real file, not a directory.
 *
 * `existsSync` answers true for a directory, and a directory is precisely what
 * GitHub Pages redirects. The first version of this gate used it and passed
 * against the very defect it was written for: `en/blog` exists — as a folder —
 * so `/en/blog` looked served.
 */
function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

/** Every <loc> in the sitemap, as an absolute URL. */
function publishedUrls(): string[] {
  const xml = readFileSync(SITEMAP, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

/** The file GitHub Pages would serve for a path, or null if it would redirect. */
function fileServedWithoutRedirect(pathname: string): string | null {
  // A path ending in '/' is served from <dir>/index.html, directly.
  if (pathname.endsWith('/')) {
    const file = join(DIST, pathname, 'index.html');
    return isFile(file) ? file : null;
  }
  // Otherwise only an exact file (or its .html form) avoids the redirect.
  for (const candidate of [join(DIST, pathname), `${join(DIST, pathname)}.html`]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

describe('every published URL is served, not redirected', () => {
  beforeAll(async () => {
    await execFileAsync(
      'npx',
      ['vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'],
      { cwd: WEB_ROOT, timeout: 300_000, maxBuffer: 32 * 1024 * 1024 },
    );
    // The sitemap and the prerendered pages both come from this step, and
    // PRERENDER_OUT keeps it off the developer's own dist/.
    await execFileAsync('npx', ['tsx', 'scripts/prerender.ts'], {
      cwd: WEB_ROOT,
      timeout: 300_000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, PRERENDER_OUT: DIST },
    });
  }, 660_000);

  afterAll(() => rmSync(DIST, { recursive: true, force: true }));

  it('the build produced a sitemap with URLs in it', () => {
    // Without this the three assertions below would pass vacuously on an empty
    // list — the way a gate of this shape usually rots.
    expect(isFile(SITEMAP), `no sitemap at ${SITEMAP}`).toBe(true);
    expect(publishedUrls().length).toBeGreaterThan(0);
  });

  it('every sitemap URL resolves to a file with no redirect', () => {
    const unserved = publishedUrls().filter((url) => {
      const { pathname } = new URL(url);
      return fileServedWithoutRedirect(pathname) === null;
    });
    expect(unserved, `these URLs answer 301 before they answer 200:\n${unserved.join('\n')}`).toEqual([]);
  });

  it('each page declares itself as canonical, at the address it is served from', () => {
    const mismatched: string[] = [];
    for (const url of publishedUrls()) {
      const file = fileServedWithoutRedirect(new URL(url).pathname);
      if (!file) continue; // reported by the test above
      const html = readFileSync(file, 'utf8');
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      if (canonical !== url) mismatched.push(`${url}\n    declares ${canonical ?? '(none)'}`);
    }
    expect(mismatched, `canonical disagrees with the served URL:\n${mismatched.join('\n')}`).toEqual([]);
  });

  it('every hreflang target is itself a served URL', () => {
    // The rule Google states plainly: if the canonical and the hreflang do not
    // agree, it may ignore the hreflang. Both must name served addresses.
    const broken: string[] = [];
    for (const url of publishedUrls()) {
      const file = fileServedWithoutRedirect(new URL(url).pathname);
      if (!file) continue;
      const html = readFileSync(file, 'utf8');
      for (const [, href] of html.matchAll(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)"/g)) {
        if (!href.startsWith(ORIGIN)) { broken.push(`${url} -> ${href} (foreign origin)`); continue; }
        if (fileServedWithoutRedirect(new URL(href).pathname) === null) {
          broken.push(`${url} -> ${href} (redirects)`);
        }
      }
    }
    expect(broken, `hreflang points at URLs that redirect:\n${broken.join('\n')}`).toEqual([]);
  });
});
