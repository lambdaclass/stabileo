/**
 * Write real HTML for every public route, so the site can be indexed.
 *
 * ── The problem this exists for ──
 *
 * GitHub Pages serves files. `dist/` held exactly two — index.html and
 * 404.html — so every address except the homepage answered **404** to anyone
 * who asked, and 404.html bounced browsers to `/?route=…` where JavaScript
 * drew the page. A person never noticed. A crawler got a 404 and dropped the
 * URL, which is why `/demo` has been live for months and indexed never. And
 * the homepage, which does answer 200, answered it with zero characters of
 * text: an empty shell that only becomes a page once a script runs.
 *
 * After this, `dist/es/blog/x/index.html` exists, Pages answers 200, and the
 * text is in the file.
 *
 * ── Why a browser and not a template ──
 *
 * The obvious alternative is to render the markup from the post data with a
 * small template. It would be faster and it would be a second implementation
 * of every page — one that drifts from the Svelte components the moment
 * anyone edits them, silently, because nothing compares the two. Driving the
 * real application means the captured HTML is by construction the page we
 * ship. Playwright is already a dev dependency, so this costs no new one.
 *
 * ── Why the markup is not hydrated ──
 *
 * It is captured from a running browser, so it carries none of the anchors
 * Svelte's hydration needs. It goes into `<div id="prerender">`, outside
 * `#app`, and main.ts removes it before mounting. A crawler reads it; a
 * browser sees it for one paint and then the application takes over with its
 * own render. The prerender is a photograph for machines, never a second
 * implementation.
 *
 * Usage (runs as part of `npm run build`):
 *   npx tsx scripts/prerender.ts
 */
import { chromium, type Browser } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const ORIGIN = 'https://stabileo.com';
const LOCALES = ['en', 'es', 'pt'] as const;
/** Build day, for the sitemap's lastmod. */
const TODAY = new Date().toISOString().slice(0, 10);
type Locale = (typeof LOCALES)[number];

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/**
 * A static server with SPA fallback, for the capture only.
 *
 * Note the irony worth naming: this server behaves exactly the way GitHub
 * Pages does NOT — unknown path falls back to index.html — which is precisely
 * why the bug it fixes was invisible in local testing for so long. Here the
 * fallback is wanted: we are asking the app to render each route.
 */
function serveDist(port: number) {
  return new Promise<{ server: import('node:http').Server; port: number }>((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let file = join(DIST, decodeURIComponent(url.pathname));
      if (!extname(file) || !existsSync(file)) file = join(DIST, 'index.html');
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: typeof addr === 'object' && addr ? addr.port : port });
    });
  });
}

/** Every public route, without its language prefix. Posts are read from the bundle. */
async function publicPaths(): Promise<string[]> {
  const source = await readFile(join(ROOT, 'src/lib/blog/index.ts'), 'utf8');
  const imports = [...source.matchAll(/from '\.\/posts\/([\w-]+)'/g)].map((m) => m[1]);
  const slugs: string[] = [];
  for (const file of imports) {
    const post = await readFile(join(ROOT, `src/lib/blog/posts/${file}.ts`), 'utf8');
    const slug = post.match(/slug:\s*'([^']+)'/)?.[1];
    if (slug) slugs.push(slug);
  }
  if (slugs.length === 0) throw new Error('prerender: found no blog posts — the scan is broken');
  return ['/', '/blog', ...slugs.map((s) => `/blog/${s}`)];
}

/**
 * The script the bare root carries.
 *
 * GitHub Pages cannot answer a 302, so the language handoff is JavaScript. It
 * must NOT fire when 404.html has bounced an application route through
 * `?route=`, or a person opening a shared model link would be thrown onto the
 * marketing page instead.
 */
const ROOT_REDIRECT = `
(function () {
  var p = new URLSearchParams(location.search);
  if (p.has('route') || p.has('embed') || location.pathname !== '/') return;
  var want = 'en';
  var langs = navigator.languages || [navigator.language || 'en'];
  for (var i = 0; i < langs.length; i++) {
    var code = String(langs[i]).split('-')[0].toLowerCase();
    if (code === 'es' || code === 'pt') { want = code; break; }
    if (code === 'en') break;
  }
  if (want !== 'en') location.replace('/' + want + location.hash);
})();
`.trim();

async function capture(browser: Browser, base: string, locale: Locale, path: string) {
  const page = await browser.newPage();
  await page.addInitScript((l) => {
    try {
      localStorage.clear();
      localStorage.setItem('stabileo-lang', l);
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch {
      /* private mode */
    }
  }, locale);

  const href = path === '/' ? `/${locale}` : `/${locale}${path}`;
  await page.goto(base + href, { waitUntil: 'networkidle' });
  // The landing reveals sections on scroll; a capture of the top of the page
  // would ship most of the copy inside elements that are still transparent.
  await page.evaluate(() => {
    const el = document.querySelector('.landing');
    if (el) el.scrollTo(0, el.scrollHeight);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.reveal:not(.visible)')) el.classList.add('visible');
    const scroller = document.querySelector('.landing');
    if (scroller) scroller.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);

  const { head, body } = await page.evaluate(() => ({
    head: document.head.innerHTML,
    body: document.querySelector('#app')?.innerHTML ?? '',
  }));
  const lang = await page.evaluate(() => document.documentElement.lang);
  await page.close();
  return { head, body, lang, href };
}

/**
 * Assemble the file. `#app` stays empty for the application to mount into;
 * the captured markup sits beside it, to be removed on mount.
 */
function page(head: string, body: string, lang: string, extraScript = '') {
  /*
   * No script tag is added here. Vite puts its module script in the <head>,
   * so the captured head already carries it — an earlier version emitted a
   * second one in the body and every prerendered page declared the same
   * 7 MB bundle twice. Modules are fetched once regardless, so nothing was
   * slower; the HTML was simply lying, and a reader of it would have
   * concluded the site downloads its application twice.
   */
  if (!/<script type="module"[^>]*src=/.test(head)) {
    throw new Error('prerender: the captured head has no module script — the page would never boot');
  }
  return `<!doctype html>
<html lang="${lang}">
<head>
${head.trim()}
${extraScript ? `<script>${extraScript}</script>` : ''}
</head>
<body>
<div id="prerender">${body}</div>
<div id="app"></div>
</body>
</html>
`;
}

/** Today, as an ISO day, for the sitemap. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error('prerender: dist/index.html is missing — run the build first');
  }
  /*
   * Port 0 asks the OS for a free one. A fixed port made the build fail with
   * `EADDRINUSE` whenever anything else happened to be listening — including
   * the throwaway server used to check this very output — which is a confusing
   * way for a build to break and has nothing to do with the build.
   */
  const { server, port } = await serveDist(0);
  const stop = () => new Promise<void>((done) => server.close(() => done()));
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const paths = await publicPaths();
  const written: string[] = [];

  try {
    for (const locale of LOCALES) {
      for (const path of paths) {
        const { head, body, lang, href } = await capture(browser, base, locale, path);
        if (body.length < 500) throw new Error(`prerender: ${href} came back nearly empty (${body.length} chars)`);
        const out = join(DIST, href.slice(1), 'index.html');
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, page(head, body, lang));
        written.push(href);
      }
    }

    // The root: English content — the x-default — plus the handoff script.
    const { head, body, lang } = await capture(browser, base, 'en', '/');
    await writeFile(join(DIST, 'index.html'), page(head, body, lang, ROOT_REDIRECT));
    written.push('/');

    await writeFile(
      join(DIST, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
        LOCALES.flatMap((locale) =>
          paths.map((path) => {
            const loc = `${ORIGIN}/${locale}${path === '/' ? '' : path}`;
            const alts = LOCALES.map(
              (l) =>
                `    <xhtml:link rel="alternate" hreflang="${l}" href="${ORIGIN}/${l}${path === '/' ? '' : path}"/>`,
            ).join('\n');
            return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n${alts}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/en"/>\n  </url>`;
          }),
        ).join('\n') +
        `\n</urlset>\n`,
    );

    /*
     * The editor is not content and must not be indexed: its routes 404 for a
     * crawler anyway, and a rule saying so is cheaper than explaining later.
     *
     * `/demo` is deliberately NOT disallowed. It is being retired by the
     * tutorials workstream and is expected back as the entry point someone can
     * use without an account — which is a page we would want indexed. A stale
     * Disallow is the kind of line nobody remembers to delete, and it would
     * quietly keep that page out of search for as long as it survived.
     */
    await writeFile(
      join(DIST, 'robots.txt'),
      `User-agent: *\nAllow: /\nDisallow: /app/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
    );

    console.log(`✅ prerendered ${written.length} pages`);
    for (const href of written) console.log(`   · ${href}`);
    console.log('   · /sitemap.xml, /robots.txt');
  } finally {
    await browser.close();
    await stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
