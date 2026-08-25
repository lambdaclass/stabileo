import { test, expect, type Page } from '@playwright/test';

/**
 * The blog at /blog.
 *
 * What makes this worth a browser rather than a unit test is the routing. The
 * site is a static bundle on GitHub Pages: there is no server that knows what
 * /blog/<slug> is, so `public/404.html` redirects to `/?route=<path>` and
 * App.svelte puts the address back with `replaceState`. Three things can only
 * be checked by driving that path — a shared deep link arriving cold, the
 * address bar staying on the post instead of being rewritten to /app/basic by
 * the editor's own URL sync, and the browser's back button.
 *
 * Tagging: `@smoke`, so CI's blocking job runs it. It sits with landing.spec.ts
 * conceptually but not by tag: the landing suite wedges the browser in CI (see
 * the note in .github/workflows/ci.yml), and these twelve cases passed there in
 * the run that proved it. Twelve fast cases over the blog are worth having
 * enforced; they are not worth attaching to a suite that cannot run yet.
 *
 * Run locally:
 *   npx playwright test --grep "@smoke blog"
 */

const SLUG = 'the-determinism-boundary';

async function boot(page: Page, path: string, locale = 'en') {
  await page.addInitScript((l) => {
    try {
      localStorage.clear();
      localStorage.setItem('stabileo-lang', l);
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch {
      /* private mode */
    }
  }, locale);
  await page.goto(path);
}

test.describe('@smoke blog', () => {
  test('renders the index at /blog', async ({ page }) => {
    await boot(page, '/blog');

    await expect(page.locator('.landing.blog')).toBeVisible();
    await expect(page.locator('.landing.blog h1')).toHaveText('Blog');
    await expect(page.locator('.post-card')).not.toHaveCount(0);
    // The three index pages used to share one title, which made them
    // indistinguishable in a result list. Each names its language's copy now.
    await expect(page).toHaveTitle(/Blog — notes on the solver/);
    // The application stays mounted behind it, as it does behind the landing.
    await expect(page.locator('.app-container.hidden-behind-landing')).toHaveCount(1);
  });

  test('opens a post and keeps its address', async ({ page }) => {
    await boot(page, '/blog');

    // By slug, not by position: the index is newest-first, so "the first card"
    // is whatever was published last.
    await page.locator(`.post-card[data-slug="${SLUG}"] .post-card-title`).click();

    await expect(page.locator('.post-title')).toBeVisible();
    // The editor syncs the URL to its own mode on every render. If that sync
    // ever stops excluding the blog, the page will be right and the address
    // will say /app/basic — which is the link a reader copies.
    await expect(page).toHaveURL(new RegExp(`/blog/${SLUG}$`));
    await expect(page).toHaveTitle(/— Stabileo$/);
  });

  test('a cold deep link renders the post', async ({ page }) => {
    // How a shared link arrives in production: 404.html hands the path over as
    // ?route=, and App.svelte restores it.
    await boot(page, `/?route=%2Fblog%2F${SLUG}`);

    await expect(page.locator('.post-title')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/blog/${SLUG}$`));
  });

  test('the browser back button returns to the post', async ({ page }) => {
    await boot(page, `/blog/${SLUG}`);
    await expect(page.locator('.post-title')).toBeVisible();

    await page.locator('.post-back').click();
    await expect(page.locator('.post-card')).not.toHaveCount(0);

    await page.goBack();
    await expect(page.locator('.post-title')).toBeVisible();
  });

  test('an unknown slug says so instead of rendering nothing', async ({ page }) => {
    await boot(page, '/blog/no-such-post');

    await expect(page.locator('.blog-head h1')).toHaveText('That post does not exist.');
    await expect(page.locator('.post-title')).toHaveCount(0);
  });

  test('the post reads in each offered language', async ({ page }) => {
    const first: Record<string, string> = {
      en: 'The determinism boundary: why an AI agent must not do the arithmetic',
      es: 'La frontera de determinismo: por qué un agente de IA no debe calcular',
      pt: 'A fronteira de determinismo: por que um agente de IA não deve calcular',
    };
    for (const [locale, title] of Object.entries(first)) {
      await boot(page, `/blog/${SLUG}`, locale);
      await expect(page.locator('.post-title')).toHaveText(title);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    }
  });

  /**
   * Switching language has to move the ADDRESS, not only the text.
   *
   * This is the defect multilingual sites ship most often: the page translates
   * and the URL keeps naming the language you left, so what the reader copies,
   * shares and what a crawler stores all disagree with what is on screen. It
   * is asserted in both directions and on all three surfaces because a
   * one-directional fix reads as working right up until someone goes back.
   */
  const TITLES = {
    en: 'The determinism boundary: why an AI agent must not do the arithmetic',
    es: 'La frontera de determinismo: por qué un agente de IA no debe calcular',
    pt: 'A fronteira de determinismo: por que um agente de IA não deve calcular',
  } as const;

  for (const [from, to] of [['pt', 'es'], ['es', 'pt'], ['en', 'es']] as const) {
    test(`a post switched from ${from} to ${to} moves both the page and the URL`, async ({ page }) => {
      await boot(page, `/${from}/blog/${SLUG}`);
      await expect(page.locator('.post-title')).toHaveText(TITLES[from]);

      await page.locator('.landing.blog select.nav-lang').selectOption(to);

      await expect(page.locator('.post-title')).toHaveText(TITLES[to]);
      await expect(page).toHaveURL(new RegExp(`/${to}/blog/${SLUG}$`));
      await expect(page.locator('html')).toHaveAttribute('lang', to);
      // The picker reports where you are, not where you were.
      await expect(page.locator('.landing.blog select.nav-lang')).toHaveValue(to);
    });
  }

  test('the blog index switches language too, body and all', async ({ page }) => {
    // The index's h1 is the word "Blog" in all three languages, so asserting
    // the heading would pass on a page that never translated. The lead does
    // the work here.
    await boot(page, '/es/blog');
    const lead = page.locator('.landing.blog .lead');
    await expect(lead).toContainText(/verificaciones normativas/i);

    await page.locator('.landing.blog select.nav-lang').selectOption('en');

    await expect(page).toHaveURL(/\/en\/blog$/);
    await expect(lead).toContainText(/code checks/i);
    await expect(page.locator(`.post-card[data-slug="${SLUG}"] .post-card-title`)).toHaveText(TITLES.en);
  });

  test('the browser back button undoes a language switch', async ({ page }) => {
    await boot(page, `/pt/blog/${SLUG}`);
    await page.locator('.landing.blog select.nav-lang').selectOption('es');
    await expect(page).toHaveURL(new RegExp(`/es/blog/${SLUG}$`));

    await page.goBack();

    await expect(page).toHaveURL(new RegExp(`/pt/blog/${SLUG}$`));
    await expect(page.locator('.post-title')).toHaveText(TITLES.pt);
  });

  test('the URL wins over a stored preference', async ({ page }) => {
    // Someone whose last choice was Spanish opens a Portuguese link they were
    // sent. They must get the page they were sent, not the one they last read.
    await boot(page, `/pt/blog/${SLUG}`, 'es');
    await expect(page.locator('.post-title')).toHaveText(TITLES.pt);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt');
  });

  test('an unprefixed link still opens the post', async ({ page }) => {
    // Every link shared before the prefixes existed looks like this.
    await boot(page, `/blog/${SLUG}`, 'es');
    await expect(page.locator('.post-title')).toHaveText(TITLES.es);
  });

  test('the embedded editor waits to be asked, then shows the post’s own numbers', async ({ page }) => {
    /*
     * The landing carried an embed like this once and it taught two lessons:
     * a second application booting on every visit, and an iframe under the
     * pointer swallowing the wheel. So the first assertion here is that
     * nothing loads until someone asks for it.
     *
     * The second is the one that makes the embed worth having: the figures on
     * screen are the figures in the prose. If the fixture, the solver or the
     * text ever drift apart, this fails.
     */
    await boot(page, '/es/blog/torsion-bredt-saint-venant');

    const embed = page.locator('.post-embed');
    await embed.scrollIntoViewIfNeeded();
    await expect(embed.locator('iframe')).toHaveCount(0);
    await expect(embed.locator('.post-embed-start')).toBeVisible();

    await embed.locator('.post-embed-start').click();
    await expect(embed.locator('iframe')).toHaveCount(1);

    const app = page.frameLocator('.post-embed iframe');
    // The model is the one the post describes: a tube under 1 kN·m.
    await expect(app.locator('body')).toContainText('1.00', { timeout: 60_000 });
    // And the three theories, with the two values the table quotes.
    await expect(app.locator('body')).toContainText('Cauchy', { timeout: 60_000 });
    await expect(app.locator('body')).toContainText('13.34');
    await expect(app.locator('body')).toContainText('12.73');
  });

  test('a post describes itself to a search engine', async ({ page }) => {
    // The byline on screen is prose; this is the only machine-readable
    // statement of who wrote the post and when. Without it a result is a page
    // of text; with it, it can carry an author and a date.
    await boot(page, `/es/blog/${SLUG}`);

    const raw = await page.locator('script[type="application/ld+json"]').textContent();
    const data = JSON.parse(raw!);
    expect(data['@type']).toBe('BlogPosting');
    expect(data.inLanguage).toBe('es');
    expect(data.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.author.map((a: { name: string }) => a.name)).toContain('Bautista Chesta');
    // It must claim the address it is actually served at, in this language.
    expect(data.url).toBe(`https://stabileo.com/es/blog/${SLUG}`);
    expect(data.mainEntityOfPage['@id']).toBe(data.url);
  });

  test('the index is not an article, and the post is not the homepage', async ({ page }) => {
    // Two mistakes that look like nothing and cost the whole point of the
    // exercise: structured data on a page that is not an article, and a
    // canonical that hands a post's credit to the front page.
    await boot(page, '/es/blog');
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://stabileo.com/es/blog',
    );

    await boot(page, `/pt/blog/${SLUG}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://stabileo.com/pt/blog/${SLUG}`,
    );
    // And it points at its siblings, which is how they get discovered at all.
    const alts = await page
      .locator('link[rel="alternate"][hreflang]')
      .evaluateAll((els) => els.map((e) => `${e.getAttribute('hreflang')} ${e.getAttribute('href')}`).sort());
    expect(alts).toEqual([
      `en https://stabileo.com/en/blog/${SLUG}`,
      `es https://stabileo.com/es/blog/${SLUG}`,
      `pt https://stabileo.com/pt/blog/${SLUG}`,
      // x-default names the English version of THIS POST. English because the
      // root declares /en as its canonical, so pointing the default at the
      // root would name a URL that is not canonical for itself — and this
      // post's path because a default that jumps to the home page sends every
      // unmatched reader away from the thing they were about to be shown.
      `x-default https://stabileo.com/en/blog/${SLUG}`,
    ]);
  });

  test('the tables render as tables, with every row filled', async ({ page }) => {
    await boot(page, `/blog/${SLUG}`);

    const tables = page.locator('.post-table');
    await expect(tables).toHaveCount(2);

    const first = tables.first();
    const cols = await first.locator('thead th').count();
    const widths = await first.locator('tbody tr').evaluateAll((rows) =>
      rows.map((r) => r.querySelectorAll('th,td').length),
    );
    expect(widths.every((w) => w === cols)).toBe(true);

    // The demand rises when the section grows — the whole argument of the post.
    await expect(first).toContainText('80.8');
    await expect(first).toContainText('105.6');
  });

  test('no horizontal overflow at the QA widths', async ({ page }) => {
    // A seven-column table on a phone must scroll inside its own box. If it
    // ever widens the document instead, the whole article slides sideways.
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await boot(page, `/blog/${SLUG}`);
      await expect(page.locator('.post-title')).toBeVisible();
      const overflow = await page.evaluate(() => {
        const el = document.querySelector('.landing.blog') as HTMLElement;
        return { scroll: el.scrollWidth, client: el.clientWidth };
      });
      expect(overflow.scroll, `overflows at ${width}px`).toBeLessThanOrEqual(overflow.client + 1);
    }
  });

  test('the hero carries a quiet way in, on the first screen', async ({ page }) => {
    await boot(page, '/');

    const link = page.locator('.landing .hero-blog');
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/read our blog/i);
    // A link, not another button: the hero's job is still to get someone into
    // the editor, and one button plus a link is one decision with a footnote.
    // (It was two buttons until /demo was retired — see landing.spec.ts.)
    await expect(page.locator('.landing .hero-ctas .btn')).toHaveCount(1);
    await expect(page.locator('.landing .hero-ctas .hero-blog')).toHaveCount(0);

    await link.click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.locator('.post-card')).not.toHaveCount(0);
  });

  test('the landing offers a way in, at the foot of the deck', async ({ page }) => {
    await boot(page, '/');

    const section = page.locator('.landing section[data-section="blog"]');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();

    await section.locator('.btn-primary').click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.locator('.post-card')).not.toHaveCount(0);
  });

  test('the editor is one click away and leaves the blog behind', async ({ page }) => {
    await boot(page, `/blog/${SLUG}`);

    await page.locator('.landing.blog .nav .btn-primary').click();

    await expect(page.locator('.landing.blog')).toHaveCount(0);
    await expect(page.locator('.app-container')).not.toHaveClass(/hidden-behind-landing/);
    await expect(page).toHaveURL(/\/app\//);
  });
});
