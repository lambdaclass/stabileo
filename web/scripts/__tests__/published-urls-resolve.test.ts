/**
 * Every URL the site publishes must be a URL the host serves.
 *
 * ── The defect this exists for ──
 *
 * The pages are directories on disk, and GitHub Pages answers a directory
 * request with a 301 to the slashed form. That cannot be disabled. The URL
 * builders emitted the UNSLASHED form, so the site published eighteen
 * addresses it does not serve:
 *
 *   sitemap says      https://stabileo.com/en/blog
 *   the host answers  301 → https://stabileo.com/en/blog/
 *   and that page declared  <link rel="canonical" href=".../en/blog">
 *
 * — a canonical pointing at a URL that redirects back to the page declaring
 * it, and an hreflang set built the same way. Google resolves the chain in
 * practice, but it is explicit that the canonical and the hreflang have to
 * agree or it may ignore the hreflang, which is the three-language linkage
 * the whole prefix scheme exists to express.
 *
 * ── Why it is checked on disk and not over HTTP ──
 *
 * Because the thing being asserted IS the disk layout. GitHub Pages serves
 * `/a/b/` from `a/b/index.html` with no redirect, and `/a/b` with one. A
 * local preview server does not reproduce that — `vite preview` happily
 * serves both — so a test over HTTP would pass on exactly the bug that
 * reached production. The file must exist at the path the URL names.
 *
 * Requires `dist/`: run after a build. It is part of the `build` vitest
 * project for that reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const ORIGIN = 'https://stabileo.com';
const SITEMAP = join(DIST, 'sitemap.xml');

const hasBuild = existsSync(SITEMAP);

/**
 * A real file, not a directory.
 *
 * `existsSync` answers true for a directory, and a directory is precisely
 * what GitHub Pages redirects. The first version of this test used it and
 * passed against the very defect it was written for: `dist/en/blog` exists —
 * as a folder — so `/en/blog` looked served. Caught by reverting the fix and
 * watching the test not fail.
 */
function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}
const describeBuilt = hasBuild ? describe : describe.skip;

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

describeBuilt('every published URL is served, not redirected', () => {
  it('the sitemap is not empty', () => {
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
        if (!href.startsWith(ORIGIN)) { broken.push(`${url} → ${href} (foreign origin)`); continue; }
        if (fileServedWithoutRedirect(new URL(href).pathname) === null) {
          broken.push(`${url} → ${href} (redirects)`);
        }
      }
    }
    expect(broken, `hreflang points at URLs that redirect:\n${broken.join('\n')}`).toEqual([]);
  });
});
