import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * What a crawler receives, with JavaScript switched off.
 *
 * ── Why this file exists ──
 *
 * `scripts/prerender.ts` writes thirteen HTML files by driving the real
 * application in a browser, and every one of them is the whole point of the
 * SEO work: a 200 with text in it, in the right language, naming its own
 * address. Until this spec, nothing that runs in CI looked at any of them.
 *
 * The blog suite next door exercises the same URLs, but with JavaScript ON —
 * so the application boots, `main.ts` removes the prerendered markup, and
 * every assertion is about the client render. A prerender that shipped
 * index.html's generic head on all thirteen pages, or that captured English
 * into `/pt`, would leave that suite entirely green. The deploy workflow's own
 * check counts characters, which catches an empty file and nothing else.
 *
 * The two existing no-JavaScript tests live in `landing.spec.ts`, cover `/`
 * alone, and sit behind the `@landing` tag that no CI job runs.
 *
 * So: `@smoke`, JavaScript off, and the three things a search engine actually
 * stores — the text, the language, and the canonical.
 *
 * ── Reading a failure ──
 *
 * A page here answering in the wrong language usually means the capture ran
 * before `applyPageMeta` did, or the localStorage seeding in `capture()`
 * stopped matching the store's keys. A page answering in ENGLISH at `/es`
 * specifically can also mean the static host stopped resolving `/es` to
 * `es/index.html` and fell back to the root — which is the production defect
 * this whole branch exists to fix, so it is worth failing on either way.
 *
 * ── One thing this file does NOT settle ──
 *
 * Every address the site advertises — canonical, hreflang, sitemap, and the
 * hrefs PublicLink renders — is the un-slashed form: `/es`, `/es/blog`. What
 * the prerender writes is `dist/es/index.html`, a directory index. Whether
 * `/es` reaches it is the HOST's business, and the two hosts disagree:
 * `vite preview` falls through to the SPA fallback, while GitHub Pages is
 * expected to redirect to `/es/`. If it does, then every canonical the site
 * declares is a 301 away from the URL that answers it, which is worth
 * confirming on a real deploy before this ships.
 *
 * These tests request the directory, so they pin the FILE regardless of how
 * that question is settled.
 *
 * Run locally:
 *   npm run build && npx playwright test --grep "@smoke prerender"
 */

const SLUG = 'the-determinism-boundary';
const ORIGIN = 'https://stabileo.com';

/** A sentence that only exists in one language, from `landing.heroP`. */
const HERO = {
  en: 'A free and open structural-analysis platform',
  es: 'Una plataforma gratuita y abierta de cálculo estructural',
  pt: 'Uma plataforma gratuita e aberta de cálculo estrutural',
} as const;

/** The same, for the blog index — `blog.lead`. */
const BLOG_LEAD = {
  en: 'the code checks and the decisions behind them',
  es: 'las verificaciones normativas y las decisiones detrás',
  pt: 'as verificações normativas e as decisões por trás',
} as const;

const POST_TITLE = {
  en: 'The determinism boundary: why an AI agent must not do the arithmetic',
  es: 'La frontera de determinismo: por qué un agente de IA no debe calcular',
  pt: 'A fronteira de determinismo: por que um agente de IA não deve calcular',
} as const;

const LOCALES = ['en', 'es', 'pt'] as const;
type Locale = (typeof LOCALES)[number];

/**
 * Open a URL with scripting disabled.
 *
 * A fresh context per page, because `javaScriptEnabled` is a context option:
 * the `page` fixture cannot be told to stop running scripts after the fact.
 *
 * ── The trailing slash is deliberate ──
 *
 * The prerender writes `dist/es/index.html`, and asking `vite preview` for
 * `/es` does NOT reach it: the SPA fallback answers first and returns the root
 * document. Measured against this build — `/es` came back 77,924 bytes, which
 * is dist/index.html, while `/es/` came back 79,370, which is the Spanish
 * page. So a test written without the slash passes at `/en` (the root IS
 * English and does declare /en as its canonical) and fails everywhere else,
 * for a reason that has nothing to do with the prerender.
 *
 * Requesting the directory is what pins the FILE. See the note in the describe
 * block below about the address the site advertises, which is the un-slashed
 * one and is a separate question from this.
 */
async function crawl(browser: Browser, path: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(path);
  return { page, close: () => ctx.close() };
}

/** The prerendered markup lives beside `#app`, never inside it. See main.ts. */
async function expectPrerenderedShape(page: Page) {
  await expect(page.locator('#prerender'), 'the captured markup is missing').toHaveCount(1);
  await expect(page.locator('#app'), 'the mount point must ship empty').toBeEmpty();
}

async function expectLinks(page: Page, path: string, locale: Locale) {
  const canonicalPath = path === '/' ? '' : path;
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${ORIGIN}/${locale}${canonicalPath}`,
  );

  const alts = await page
    .locator('link[rel="alternate"][hreflang]')
    .evaluateAll((els) => els.map((e) => `${e.getAttribute('hreflang')} ${e.getAttribute('href')}`).sort());
  expect(alts, `hreflang set on /${locale}${canonicalPath}`).toEqual([
    `en ${ORIGIN}/en${canonicalPath}`,
    `es ${ORIGIN}/es${canonicalPath}`,
    `pt ${ORIGIN}/pt${canonicalPath}`,
    // x-default follows the page, not the home page.
    `x-default ${ORIGIN}/en${canonicalPath}`,
  ]);
}

test.describe('@smoke prerender', () => {

  for (const locale of LOCALES) {
    test(`/${locale} is served as ${locale}, with text, to a crawler`, async ({ browser }) => {
      const { page, close } = await crawl(browser, `/${locale}/`);
      try {
        await expectPrerenderedShape(page);
        await expect(page.locator('#prerender')).toContainText(HERO[locale]);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expectLinks(page, '/', locale);
      } finally {
        await close();
      }
    });

    test(`/${locale}/blog is served as ${locale}, with text, to a crawler`, async ({ browser }) => {
      const { page, close } = await crawl(browser, `/${locale}/blog/`);
      try {
        await expectPrerenderedShape(page);
        await expect(page.locator('#prerender')).toContainText(BLOG_LEAD[locale]);
        // The index lists the post, in this language — which is the internal
        // link a crawler walks to reach it.
        await expect(page.locator('#prerender')).toContainText(POST_TITLE[locale]);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expectLinks(page, '/blog', locale);
      } finally {
        await close();
      }
    });

    test(`/${locale}/blog/${SLUG} carries the post and its structured data`, async ({ browser }) => {
      const { page, close } = await crawl(browser, `/${locale}/blog/${SLUG}/`);
      try {
        await expectPrerenderedShape(page);
        await expect(page.locator('#prerender .post-title')).toHaveText(POST_TITLE[locale]);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expectLinks(page, `/blog/${SLUG}`, locale);

        // The byline on screen is prose; this is the machine-readable one, and
        // it has to survive into the file rather than only exist at runtime.
        const raw = await page.locator('script[type="application/ld+json"]').textContent();
        const data = JSON.parse(raw!);
        expect(data['@type']).toBe('BlogPosting');
        expect(data.inLanguage).toBe(locale);
        expect(data.url).toBe(`${ORIGIN}/${locale}/blog/${SLUG}`);
      } finally {
        await close();
      }
    });
  }

  test('a crawler that runs nothing still finds its way from the landing to a post', async ({ browser }) => {
    /*
     * The reason PublicLink exists. Before it, every navigation on the public
     * site was a <button>, so an audit of the built HTML found one crawlable
     * internal link across the whole site. A page nothing links to is a page
     * discovered only through the sitemap.
     */
    const { page, close } = await crawl(browser, '/es/');
    try {
      const hrefs = await page
        .locator('#prerender a[href^="/es"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
      expect(hrefs, 'the landing must link to the blog index').toContain('/es/blog');
      // Named by shape rather than by slug: the section previews whatever is
      // newest, so pinning a slug here would fail on the next post rather than
      // on a broken link.
      expect(
        hrefs.filter((h) => /^\/es\/blog\/[^/]+$/.test(h)),
        'and straight into a post, in the reader’s language',
      ).not.toHaveLength(0);
    } finally {
      await close();
    }
  });

  test('the root serves the default language and consolidates into /en', async ({ browser }) => {
    // `/` is a doorway: it carries English content and names /en as its
    // canonical rather than competing with it for the same page.
    const { page, close } = await crawl(browser, '/');
    try {
      await expectPrerenderedShape(page);
      await expect(page.locator('#prerender')).toContainText(HERO.en);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${ORIGIN}/en`);
    } finally {
      await close();
    }
  });

  test('the root hands a Portuguese browser on, without losing the query string', async ({ browser }) => {
    /*
     * This one needs JavaScript: GitHub Pages cannot answer a 302, so the
     * language handoff is the inline script prerender.ts writes into the root.
     *
     * The query string travels. It used to be dropped, and only for Spanish
     * and Portuguese browsers, since an English one is never redirected — so a
     * campaign link lost its attribution for precisely the audience the
     * prefixes were built to serve.
     */
    const ctx = await browser.newContext({ locale: 'pt-BR' });
    const page = await ctx.newPage();
    try {
      await page.goto('/?utm_source=review');
      // Generous: this is the only test here that boots the application.
      await expect(page).toHaveURL(/\/pt\?utm_source=review$/, { timeout: 30_000 });
    } finally {
      await ctx.close();
    }
  });

  test('the root does not hijack an application route bounced through 404.html', async ({ browser }) => {
    // A shared model link arrives as /?route=… . Redirecting it to /pt would
    // throw someone opening their own structure onto the marketing page.
    const ctx = await browser.newContext({ locale: 'pt-BR' });
    const page = await ctx.newPage();
    try {
      await page.goto('/?route=%2Fapp%2Fbasic');
      await expect(page).toHaveURL(/\/app\/basic/, { timeout: 30_000 });
    } finally {
      await ctx.close();
    }
  });
});
