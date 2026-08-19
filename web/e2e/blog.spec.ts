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
    await expect(page).toHaveTitle(/Blog — Stabileo/);
    // The application stays mounted behind it, as it does behind the landing.
    await expect(page.locator('.app-container.hidden-behind-landing')).toHaveCount(1);
  });

  test('opens a post and keeps its address', async ({ page }) => {
    await boot(page, '/blog');

    await page.locator('.post-card-title').first().click();

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

  test('switching language on a post keeps the reader on the post', async ({ page }) => {
    await boot(page, `/blog/${SLUG}`, 'en');

    await page.locator('.landing.blog select.nav-lang').selectOption('pt');

    await expect(page.locator('.post-title')).toHaveText(
      'A fronteira de determinismo: por que um agente de IA não deve calcular',
    );
    await expect(page).toHaveURL(new RegExp(`/blog/${SLUG}$`));
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
    // A link, not a third button: the hero's job is still to get someone into
    // the editor, and two buttons plus a link is one decision with a footnote.
    await expect(page.locator('.landing .hero-ctas .btn')).toHaveCount(2);
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
