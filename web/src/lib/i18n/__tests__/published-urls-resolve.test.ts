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
import catalog from '../../../../../research/papers.json';
import { EXPERIMENTS } from '../../../components/research/experiments';
import { RESEARCH_GALLERY, RESEARCH_PAPER_PATHS, researchLastReview, researchLocales } from '../../../components/research/locales';

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
  it('the sitemap and each page declare the same hreflang set', () => {
    const xml = readFileSync(SITEMAP, 'utf8');
    const differ: string[] = [];
    for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const url = block.match(/<loc>([^<]+)<\/loc>/)![1];
      const file = fileServedWithoutRedirect(new URL(url).pathname);
      if (!file) continue;
      const listed = [...block.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map(([, l, h]) => `${l} ${h}`).sort();
      const declared = [...readFileSync(file, 'utf8').matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(([, l, h]) => `${l} ${h}`).sort();
      if (listed.join('\n') !== declared.join('\n')) differ.push(`${url}\n    sitemap: ${listed.join(', ')}\n    page:    ${declared.join(', ')}`);
    }
    expect(differ, `hreflang in the sitemap disagrees with the page:\n${differ.join('\n')}`).toEqual([]);
  });

  describe('research', () => {
    const published = [RESEARCH_GALLERY, ...RESEARCH_PAPER_PATHS].flatMap((path) => researchLocales(path).map((locale) => ({ path, locale, url: `${ORIGIN}/${locale}${path}/` })));
    const html = (url: string) => readFileSync(join(DIST, new URL(url).pathname, 'index.html'), 'utf8');
    const prerendered = (page: string) => page.match(/<div id="prerender">([\s\S]*)<div id="app">/)?.[1] ?? '';
    const text = (s: string) => s.replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '\n').replace(/&[a-z#0-9]+;/g, ' ');
    const lines = (s: string) => text(s).split('\n').map((l) => l.trim()).filter((l) => l.length >= 30 && /[a-z]{3}/.test(l));
    const title = (page: string) => page.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';

    it('lists every published research page in the sitemap, dated by its latest review', () => {
      const xml = readFileSync(SITEMAP, 'utf8');
      const missing = published.filter(({ url }) => !xml.includes(`<loc>${url}</loc>`)).map(({ url }) => url);
      expect(missing, `research pages missing from the sitemap:\n${missing.join('\n')}`).toEqual([]);
      for (const { path, url } of published) {
        const lastmod = xml.match(new RegExp(`<loc>${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>\\s*<lastmod>([^<]+)</lastmod>`))?.[1];
        expect(lastmod, url).toBe(researchLastReview(path));
      }
    });

    it('writes no research page in a language it is not published in', () => {
      const stray = [RESEARCH_GALLERY, ...RESEARCH_PAPER_PATHS].flatMap((path) =>
        ['en', 'es', 'pt', 'de', 'fr', 'tr'].filter((l) => !researchLocales(path).includes(l) && existsSync(join(DIST, l, path, 'index.html'))).map((l) => `/${l}${path}/`),
      );
      expect(stray).toEqual([]);
      expect(publishedUrls().filter((u) => /\/(de|fr|tr)\/research\//.test(u))).toEqual([]);
    });

    it.each(RESEARCH_PAPER_PATHS)('%s ships its content, a self canonical, no noindex and a citation of the paper', (path) => {
      const paperId = EXPERIMENTS.find((e) => e.path === path)!.paperId;
      const doi = catalog.papers.find((p) => p.id === paperId)!.doi;
      for (const locale of researchLocales(path)) {
        const url = `${ORIGIN}/${locale}${path}/`;
        const page = html(url);
        const body = prerendered(page);
        const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '').trim();
        expect(h1, `${url} has no h1 in its prerendered HTML`).toBeTruthy();
        expect(lines(body).length, `${url} prerendered almost no text`).toBeGreaterThan(10);
        expect(page.match(/<link rel="canonical" href="([^"]+)"/)?.[1]).toBe(url);
        expect(page).not.toMatch(/<meta[^>]*name="robots"[^>]*noindex/i);
        expect(title(page)).toMatch(/— Stabileo Research$/);
        const ld = [...page.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(([, j]) => JSON.parse(j)['@graph'] ?? []);
        const article = ld.find((n: { '@id'?: string }) => n['@id'] === `${url}#article`);
        expect(article, `${url} has no ScholarlyArticle`).toBeTruthy();
        expect(article.citation.identifier.value).toBe(doi);
        expect(body).toContain(`https://doi.org/${doi}`);
      }
    });

    it.each(RESEARCH_PAPER_PATHS.filter((path) => researchLocales(path).length > 1))('%s is translated wherever it is published', (path) => {
      const en = html(`${ORIGIN}/en${path}/`);
      const english = lines(prerendered(en));
      for (const locale of researchLocales(path).filter((l) => l !== 'en')) {
        const page = html(`${ORIGIN}/${locale}${path}/`);
        expect(title(page), `${locale}${path} keeps the English <title>`).not.toBe(title(en));
        const ownLines = new Set(lines(prerendered(page)));
        const same = english.filter((l) => ownLines.has(l)).reduce((n, l) => n + l.length, 0);
        const total = english.reduce((n, l) => n + l.length, 0);
        expect(same / total, `${locale}${path} repeats ${Math.round((100 * same) / total)}% of the English text`).toBeLessThan(0.35);
      }
    });

    it('links every paper from the gallery with a crawlable href to a URL it is published under', () => {
      for (const locale of researchLocales(RESEARCH_GALLERY)) {
        const body = prerendered(html(`${ORIGIN}/${locale}${RESEARCH_GALLERY}/`));
        for (const path of RESEARCH_PAPER_PATHS) {
          const target = researchLocales(path).includes(locale) ? locale : 'en';
          expect(body, `/${locale}/research/ does not link ${path}`).toContain(`href="/${target}${path}/"`);
        }
      }
    });
  });
});
