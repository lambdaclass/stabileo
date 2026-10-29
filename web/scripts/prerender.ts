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
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootHandoffScript } from './root-handoff';
import { PUBLIC_LOCALES, type Locale } from '../src/lib/i18n/offered';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * Where the prerendered site is written, and where the static server serves from.
 *
 * `dist/` for a real build. `PRERENDER_OUT` overrides it so a test can point this
 * at a throwaway directory and check the published URLs against a build it made
 * itself. The alternative — reading a checked-out `dist/` — proves less and costs
 * more: it is gitignored, is rewritten by `build`, `build:only` and Playwright's
 * `VITE_E2E=1` webServer alike, and is absent on a fresh clone. A gate that reads
 * it either asserts against whichever build ran last, or skips itself.
 */
const DIST = process.env.PRERENDER_OUT
  ? resolve(process.env.PRERENDER_OUT)
  : join(ROOT, 'dist');
const ORIGIN = 'https://stabileo.com';
const LOCALES = PUBLIC_LOCALES;
/**
 * The language a browser we do not speak is sent to, and the one the root
 * serves. Kept beside LOCALES because `ROOT_REDIRECT` is built from both.
 */
const DEFAULT_LOCALE = 'en';
/** Build day, for the sitemap's lastmod. */
const TODAY = new Date().toISOString().slice(0, 10);

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

/**
 * A post's last change, for its sitemap entry: `updated` when the post states one, else its
 * publication date. The build day said every post changed on every deploy, which teaches a
 * crawler to ignore lastmod.
 */
const POST_LASTMOD = new Map<string, string>();
/** The blog index's description in each language, for its feed. */
const BLOG_LEAD = new Map<string, string>();

/** A post's publication day, for its feed entry and its card. */
const POST_DATE = new Map<string, string>();

/** The languages always written; the others count for a post or standing page only once its translation file exists. */
const BASE_LOCALES: readonly Locale[] = ['en', 'es', 'pt'];

/** The languages a public path is written in, which are the only ones the sitemap and the feeds publish it under. */
function writtenIn(path: string): Locale[] {
  if (path === '/' || path === '/blog') return [...LOCALES];
  const id = path.startsWith('/blog/') ? path.slice('/blog/'.length) : `page-${path.slice(1)}`;
  return LOCALES.filter(
    (l) => BASE_LOCALES.includes(l) || existsSync(join(ROOT, `src/lib/blog/translations/${l}/${id}.ts`)),
  );
}

/** What a captured post says about itself, read back from its own <head>: the feed and the card use it. */
type PostHead = { path: string; locale: Locale; title: string; description: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function headMeta(head: string, attr: string, name: string): string | undefined {
  const re = new RegExp(`<meta[^>]*${attr}="${name}"[^>]*content="([^"]*)"`);
  return head.match(re)?.[1];
}

/**
 * One RSS 2.0 feed per language, newest first, at /<locale>/blog/feed.xml. Pages on the blog
 * advertise it with <link rel="alternate" type="application/rss+xml"> (src/lib/page-meta.ts).
 */
function feedXml(locale: Locale, posts: PostHead[]): string {
  const items = posts
    .filter((p) => p.locale === locale && writtenIn(p.path).includes(locale))
    .sort((a, b) => (POST_DATE.get(b.path) ?? '').localeCompare(POST_DATE.get(a.path) ?? ''))
    .map((p) => {
      const url = `${ORIGIN}/${locale}${p.path}/`;
      const date = new Date(`${POST_DATE.get(p.path) ?? TODAY}T12:00:00Z`).toUTCString();
      return `    <item>\n      <title>${xmlEscape(p.title)}</title>\n      <link>${url}</link>\n      <guid isPermaLink="true">${url}</guid>\n      <pubDate>${date}</pubDate>\n      <description>${xmlEscape(p.description)}</description>\n    </item>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>Stabileo — Blog</title>\n    <link>${ORIGIN}/${locale}/blog/</link>\n    <atom:link href="${ORIGIN}/${locale}/blog/feed.xml" rel="self" type="application/rss+xml"/>\n    <description>${xmlEscape(BLOG_LEAD.get(locale) ?? 'Stabileo')}</description>\n    <language>${locale}</language>\n    <lastBuildDate>${new Date(`${TODAY}T12:00:00Z`).toUTCString()}</lastBuildDate>\n${items.join('\n')}\n  </channel>\n</rss>\n`;
}

/**
 * A post's own social card, 1200×630, in the site's palette and type: the post's title, the
 * blog's eyebrow and the date. One per language (dist/og/blog/<slug>.<locale>.png); the post's
 * og:image and twitter:image point at it (postImageUrl in src/lib/page-meta.ts).
 */
async function renderPostCard(browser: Browser, base: string, post: PostHead, out: string) {
  const day = POST_DATE.get(post.path) ?? TODAY;
  const date = new Date(`${day}T12:00:00Z`).toLocaleDateString(post.locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family:'Space Grotesk'; src:url('${base}/fonts/space-grotesk.woff2') format('woff2'); font-weight:700; }
    @font-face { font-family:'IBM Plex Sans'; src:url('${base}/fonts/ibm-plex-sans.woff2') format('woff2'); font-weight:400; }
    @font-face { font-family:'IBM Plex Mono'; src:url('${base}/fonts/ibm-plex-mono-500.woff2') format('woff2'); font-weight:500; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { width:1200px; height:630px; background:#0c1620; color:#f4f7fa; font-family:'IBM Plex Sans',sans-serif; overflow:hidden; }
    .card { width:1200px; height:630px; padding:72px 80px; display:flex; flex-direction:column; }
    .eyebrow { display:flex; align-items:center; gap:16px; font-family:'IBM Plex Mono',monospace; font-size:20px; letter-spacing:.17em; text-transform:uppercase; color:#e5482a; }
    .rule { width:52px; height:3px; background:#e5482a; }
    h1 { font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:60px; line-height:1.08; letter-spacing:-.03em; margin-top:30px; max-width:1000px;
         display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
    .foot { margin-top:auto; display:flex; align-items:center; gap:22px; font-family:'IBM Plex Mono',monospace; font-size:20px; letter-spacing:.11em; color:#8fa3b3; text-transform:uppercase; }
    .logo { width:38px; height:38px; border-radius:5px; background:#e5482a; color:#fff; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:24px; display:grid; place-items:center; }
    .name { font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:29px; color:#f4f7fa; letter-spacing:-.015em; text-transform:none; }
    .dot { color:#e5482a; }
  </style><div class="card">
    <p class="eyebrow"><span class="rule"></span>Blog</p>
    <h1>${esc(post.title)}</h1>
    <div class="foot"><span class="logo">S</span><span class="name">Stabileo</span><span class="dot">&middot;</span><span>${esc(date)}</span><span class="dot">&middot;</span><span>stabileo.com</span></div>
  </div>`;
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  try {
    // Same origin as the fonts: a card set on about:blank cannot load them from the build server,
    // and falls back to the system faces.
    await page.goto(`${base}/en/`, { waitUntil: 'domcontentloaded' });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await mkdir(dirname(out), { recursive: true });
    await page.screenshot({ path: out });
  } finally {
    await page.close();
  }
}

/** Every public route, without its language prefix. Posts are read from the bundle. */
async function publicPaths(): Promise<string[]> {
  const source = await readFile(join(ROOT, 'src/lib/blog/index.ts'), 'utf8');
  const imports = [...source.matchAll(/from '\.\/posts\/([\w-]+)'/g)].map((m) => m[1]);
  const slugs: string[] = [];
  for (const file of imports) {
    const post = await readFile(join(ROOT, `src/lib/blog/posts/${file}.ts`), 'utf8');
    const slug = post.match(/slug:\s*'([^']+)'/)?.[1];
    if (slug) {
      slugs.push(slug);
      const published = post.match(/\bdate:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1];
      const day = post.match(/\bupdated:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1] ?? published;
      if (day) POST_LASTMOD.set(`/blog/${slug}`, day);
      if (published) POST_DATE.set(`/blog/${slug}`, published);
    }
  }
  if (slugs.length === 0) throw new Error('prerender: found no blog posts — the scan is broken');
  // Standing pages, read from their own files, with their last edit for the sitemap.
  const pageIndex = await readFile(join(ROOT, 'src/lib/blog/pages/index.ts'), 'utf8');
  const pageFiles = [...pageIndex.matchAll(/from '\.\/([\w-]+)'/g)].map((m) => m[1]);
  const pages: string[] = [];
  for (const file of pageFiles) {
    const src = await readFile(join(ROOT, `src/lib/blog/pages/${file}.ts`), 'utf8');
    const pagePath = src.match(/\bpath:\s*'(\/[\w-]+)'/)?.[1];
    if (!pagePath) continue;
    pages.push(pagePath);
    const day = src.match(/\bupdated:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1];
    if (day) POST_LASTMOD.set(pagePath, day);
  }
  // Stabileo Research: the gallery and each runnable paper (web/src/components/research).
  const research = ['/research', '/research/benchmarks/macneal-harder-1985', '/research/benchmarks/mattiasson-elastica', '/research/fracture/shauer-2025', '/research/metamaterials/grossman-2026'];
  return ['/', ...pages, '/blog', ...slugs.map((s) => `/blog/${s}`), ...research];
}

/**
 * The script the bare root carries, to hand a reader on to their language.
 *
 * Built by `scripts/root-handoff.ts`, which is where the reasoning and the
 * tests for it live. The LIST comes from `LOCALES` above, which is the application's own.
 */
const ROOT_REDIRECT = rootHandoffScript(LOCALES, DEFAULT_LOCALE);

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

  // Visited in the same slashed form the site publishes, so the capture
  // happens on the address a reader actually lands on.
  const href = path === '/' ? `/${locale}/` : `/${locale}${path}/`;
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

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    // Names the directory it actually looked in: with PRERENDER_OUT set that is
    // not `dist/`, and a message that says otherwise sends the reader hunting
    // through a tree this run never touched.
    throw new Error(`prerender: ${join(DIST, 'index.html')} is missing — run the build first`);
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
  const posts: PostHead[] = [];

  try {
    for (const locale of LOCALES) {
      for (const path of paths) {
        const { head, body, lang, href } = await capture(browser, base, locale, path);
        if (body.length < 500) throw new Error(`prerender: ${href} came back nearly empty (${body.length} chars)`);
        const out = join(DIST, href.slice(1), 'index.html');
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, page(head, body, lang));
        written.push(href);
        if (path === '/blog') {
          const lead = headMeta(head, 'name', 'description');
          if (lead) BLOG_LEAD.set(locale, decodeEntities(lead));
        }
        if (path.startsWith('/blog/')) {
          const title = headMeta(head, 'property', 'og:title')?.replace(/ — Stabileo$/, '');
          const description = headMeta(head, 'name', 'description');
          if (!title || !description) throw new Error(`prerender: ${href} has no og:title or description to put in its feed entry`);
          posts.push({ path, locale, title: decodeEntities(title), description: decodeEntities(description) });
        }
      }
    }

    // The root: the default language's content — the x-default — plus the
    // handoff script that sends everyone else on.
    const { head, body, lang } = await capture(browser, base, DEFAULT_LOCALE, '/');
    await writeFile(join(DIST, 'index.html'), page(head, body, lang, ROOT_REDIRECT));
    written.push('/');

    await writeFile(
      join(DIST, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
        LOCALES.flatMap((locale) =>
          paths.filter((path) => writtenIn(path).includes(locale)).map((path) => {
            // Trailing slash, matching the canonical the page declares — see
            // publicHref in src/lib/i18n/public-routes.ts. Without it every
            // entry in this file was a URL that answers 301.
            const loc = `${ORIGIN}/${locale}${path === '/' ? '' : path}/`;
            const alts = writtenIn(path).map(
              (l) =>
                `    <xhtml:link rel="alternate" hreflang="${l}" href="${ORIGIN}/${l}${path === '/' ? '' : path}/"/>`,
            ).join('\n');
            // x-default follows the page, exactly as it does in the pages'
            // own <head> — see alternateUrls() in src/lib/i18n/public-routes.ts.
            // This was `${ORIGIN}/${DEFAULT_LOCALE}` for every entry, which
            // pointed the default of every URL in the file at the English home
            // page instead of at the page declaring it.
            const xDefault = `${ORIGIN}/${DEFAULT_LOCALE}${path === '/' ? '' : path}/`;
            return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${POST_LASTMOD.get(path) ?? TODAY}</lastmod>\n${alts}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${xDefault}"/>\n  </url>`;
          }),
        ).join('\n') +
        `\n</urlset>\n`,
    );

    for (const locale of LOCALES) {
      await mkdir(join(DIST, locale, 'blog'), { recursive: true });
      await writeFile(join(DIST, locale, 'blog', 'feed.xml'), feedXml(locale, posts));
    }
    for (const post of posts) {
      const slug = post.path.slice('/blog/'.length);
      await renderPostCard(browser, base, post, join(DIST, 'og', 'blog', `${slug}.${post.locale}.png`));
    }

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
    console.log(`   · /sitemap.xml, /robots.txt, ${LOCALES.length} feeds, ${posts.length} post cards`);
  } finally {
    await browser.close();
    await stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
