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

  test('a nested address is a missing post, not the index', async ({ page }) => {
    // App.svelte routes anything under /blog/ here, so this address IS the
    // blog's to answer. It used to answer with the INDEX: the slug pattern
    // required a single segment, missed entirely, and fell through to the
    // "no slug" branch — which draws a working-looking page under an address
    // that promised a post.
    await boot(page, '/blog/no-such-post/and-deeper');

    await expect(page.locator('.blog-head h1')).toHaveText('That post does not exist.');
    await expect(page.locator('.post-card')).toHaveCount(0);
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

  test('the CIRSOC post opens PRO on the check it describes', async ({ page }) => {
    /*
     * The other half of the embed contract: this post's subject lives in PRO's
     * design workflow, not in Basic's section panel, so it opens `/app/pro`.
     *
     * The caption names the three buttons the reader has to press, and the
     * editor inside the frame runs in the reader's language — so the caption
     * has to name them in that language too. An English caption on a Spanish
     * page sends someone hunting for a button that says something else.
     */
    /*
     * Booted explicitly in Spanish. `boot`'s init script runs in EVERY frame,
     * the embedded editor included, so leaving the default would have the
     * harness itself force the iframe into English and then assert it is not.
     */
    await boot(page, '/es/blog/verificacion-flexion-cirsoc-201', 'es');

    const embed = page.locator('.post-embed');
    await embed.scrollIntoViewIfNeeded();
    await expect(embed.locator('iframe')).toHaveCount(0);

    const caption = await embed.locator('figcaption').innerText();
    expect(caption).toContain('Calcular solicitaciones');
    expect(caption).toContain('Verificar según norma');
    expect(caption).toContain('Diseñar todo');

    await embed.locator('.post-embed-start').click();
    await expect(embed.locator('iframe')).toHaveAttribute('src', /\/app\/pro\?/);

    const app = page.frameLocator('.post-embed iframe');
    await expect(app.locator('body')).toContainText('CIRSOC 201', { timeout: 60_000 });
    // The buttons the caption promises are really there, in this language.
    await expect(app.getByTestId('cmd-compute-demands')).toHaveText('Calcular solicitaciones');
    await expect(app.getByTestId('cmd-code-check')).toHaveText('Verificar según norma');
  });

  /*
   * The caption promises a RESULT, not just two labelled buttons — and that is
   * the half that broke. It used to name two buttons and quote D/C = 0.81; the
   * two buttons leave the table reading "no reinforcement / not verified", and
   * 0.81 never appeared on screen at all. Asserting the labels exist could not
   * catch that. This runs the flow the caption describes, to the end, and reads
   * the number back.
   */
  test('the CIRSOC embed reaches the state its caption promises', async ({ page }) => {
    test.slow();
    await boot(page, '/es/blog/verificacion-flexion-cirsoc-201', 'es');

    const embed = page.locator('.post-embed');
    await embed.scrollIntoViewIfNeeded();
    await embed.locator('.post-embed-start').click();

    const app = page.frameLocator('.post-embed iframe');
    await expect(app.locator('body')).toContainText('CIRSOC 201', { timeout: 60_000 });

    // Exactly the three presses the caption asks for, in its order. Each wait is
    // the toolbar's own disabled state — the workflow's real gate: code check arms
    // only once demands exist and the previous run is no longer busy. A bare
    // `toBeVisible` on the body would wait on nothing.
    await app.getByTestId('cmd-compute-demands').click();
    await expect(app.getByTestId('cmd-code-check')).toBeEnabled({ timeout: 60_000 });
    await app.getByTestId('cmd-code-check').click();
    await expect(app.getByTestId('cmd-design-all')).toBeEnabled({ timeout: 60_000 });
    await app.getByTestId('cmd-design-all').click();

    // Verified, not "sin verificar", and at the utilisation the caption quotes.
    const table = app.locator('body');
    await expect(table).toContainText('0.89', { timeout: 90_000 });
    await expect(table).toContainText('0.86');
    await expect(table).toContainText('1.2D+1.6L');
    await expect(table).not.toContainText('sin armadura');
  });

  /*
   * The kinematic embed, checked the way the CIRSOC one had to be: by driving
   * it to the end and reading the panel back, not by asserting a button exists.
   *
   * Two real defects were found this way while writing the post. The fixture
   * was missing `plates`, which threw inside the example loader and was
   * swallowed by an empty catch — the model half-loaded and the deep link
   * never ran. And `?kin=1` raised the panel flag without opening the Advanced
   * tab that hosts the report on desktop Basic, so it worked on a phone and
   * did nothing on a laptop.
   */
  test('the kinematic embed reaches the state its caption promises', async ({ page }) => {
    test.slow();
    await boot(page, '/es/blog/conceptual-side-advanced-tools', 'es');

    const embed = page.locator('.post-embed');
    await embed.scrollIntoViewIfNeeded();
    await embed.locator('.post-embed-start').click();
    await expect(embed.locator('iframe')).toHaveAttribute('src', /example=hidden-mechanism&kin=1/);

    const app = page.frameLocator('.post-embed iframe');
    // The report is docked in the Advanced tab; if the deep link fails to open
    // it, nothing below this line can pass.
    // 'Avanzado' in the DOM; the ribbon uppercases it in CSS.
    await expect(app.getByTestId('bp-title')).toHaveText('Avanzado', { timeout: 60_000 });

    const body = app.locator('body');
    await expect(body).toContainText('g = 3×2 + 3 − 3×3 = 0');
    /*
     * Generous timeouts on the rank check, and the reason is worth keeping.
     *
     * Step 3 needs the WASM engine, and `?kin=1` opens the panel before it has
     * loaded. The panel says "not verified yet" and retries until the engine
     * arrives — so this waits for the answer rather than for the first paint.
     * CI failed here once with the panel claiming the structure was STABLE,
     * which was the bug this timeout must not hide: see rankChecked in
     * kinematic-report.ts.
     */
    await expect(body).toContainText('NO suficiente', { timeout: 30_000 });
    await expect(body).toContainText('1 modo de mecanismo', { timeout: 30_000 });
    // And it must never have settled on the opposite claim.
    await expect(body).not.toContainText('La estructura es estable');
    // The verdict the post's table quotes, in the words the panel uses.
    await expect(body).toContainText('no se puede resolver');
  });

  test('a post offers the way back to the index, and the index does not', async ({ page }) => {
    /*
     * There was no way back. The logo goes to the landing, so returning to the
     * index from a post meant landing → scroll to the blog section → enter
     * again. The link is deliberately absent on the index itself, which is
     * what made the landing's "Blog" nav item useless here in the first place.
     */
    await boot(page, `/es/blog/${SLUG}`, 'es');
    const back = page.locator('.landing.blog .nav-blog-link');
    await expect(back).toBeVisible();
    await expect(back).toHaveText('Blog');
    // A real href, so it is crawlable and middle-clickable, not a button.
    await expect(back).toHaveAttribute('href', '/es/blog');
    // And it sits before the GitHub box, where the ask put it.
    const order = await page.locator('.landing.blog .nav-actions > *').evaluateAll((els) =>
      els.map((e) => e.className.toString().split(' ')[0]),
    );
    expect(order[0]).toBe('nav-blog-link');
    expect(order[1]).toBe('nav-gh');

    await back.click();
    await expect(page).toHaveURL(/\/es\/blog$/);
    await expect(page.locator('.post-card')).not.toHaveCount(0);
    // Now on the index, it is gone.
    await expect(page.locator('.landing.blog .nav-blog-link')).toHaveCount(0);
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
