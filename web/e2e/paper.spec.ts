import { test, expect } from '@playwright/test';

/**
 * /paper: the JAIE 2026 paper in full, in English, set as its LaTeX article (KaTeX), linked from
 * the footer and filed under Research in the site header, with the typeset PDF and the Spanish original.
 *
 *   npx playwright test --grep "@smoke paper"
 */
test.describe('@smoke paper', () => {
  test('the footer links the paper, which the header files under Research', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/es/research/');
    await expect(page.locator('nav.site-header [data-nav="paper"]')).toHaveCount(0);
    const link = page.locator('footer a[href="/es/paper/"]');
    await expect(link).toHaveCount(1);
    await link.click();
    await expect(page).toHaveURL(/\/es\/paper\/$/);
    await expect(page.locator('[data-testid="paper"] h1')).toContainText('Developing a structural calculation agent on top of a verified solver');
  });

  test('the paper structured data is in the prerendered page and gone after leaving it', async ({ page }) => {
    const html = await (await page.request.get('/en/paper/')).text();
    expect(html).toContain('"@type":"ScholarlyArticle"');
    await page.goto('/en/paper/');
    await expect(page.locator('[data-testid="paper"] h1')).toBeVisible();
    const articles = () => page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].filter((s) => s.textContent?.includes('"ScholarlyArticle"')).length);
    expect(await articles()).toBe(1);
    await page.evaluate(() => { (window as { __samePage?: boolean }).__samePage = true; });
    await page.locator('nav.site-header [data-nav="blog"]').first().click();
    await expect(page).toHaveURL(/\/en\/blog\/$/);
    expect(await page.evaluate(() => (window as { __samePage?: boolean }).__samePage)).toBe(true);
    await expect.poll(articles).toBe(0);
  });

  test('renders the whole paper: sections, equations, tables, figures and references', async ({ page }) => {
    await page.goto('/es/paper/');
    const paper = page.locator('[data-testid="paper"]');
    await expect(paper.locator('h2.pp-h1:not(.pp-unnumbered)')).toHaveCount(9);
    await expect(paper.locator('.pp-eq .katex-display')).toHaveCount(4);
    await expect(paper.locator('.pp-eq .katex-error, .katex-error')).toHaveCount(0);
    await expect(paper.locator('figure.pp-table table')).toHaveCount(4);
    await expect(paper.locator('ol.pp-refs > li')).toHaveCount(18);
    await expect(paper.locator('a[href="https://code-aster.org"]')).toHaveCount(1);
    const figures = paper.locator('figure.pp-figure img');
    await expect(figures).toHaveCount(4);
    for (const img of await figures.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    }
    await expect(paper.locator('figure.pp-table figcaption').first()).toContainText('Table 1:');
    const cite = paper.locator('.pp-cite a[href="#ref-6"]').first();
    await cite.click();
    await expect(page).toHaveURL(/#ref-6$/);
    for (const id of ['paper-download', 'paper-original']) {
      const href = await page.getByTestId(id).getAttribute('href');
      const pdf = await page.request.get(href!);
      expect(pdf.status(), id).toBe(200);
      expect((await pdf.body()).subarray(0, 5).toString(), id).toBe('%PDF-');
    }
  });

  test('in Spanish the page around it is Spanish, the paper English, and the original is offered', async ({ page }) => {
    await page.goto('/es/paper/');
    await expect(page.locator('[data-testid="paper"]')).toHaveAttribute('lang', 'en');
    await expect(page.getByText('Esta es la traducción al inglés; el original en castellano se puede descargar.')).toBeVisible();
    await expect(page.getByTestId('paper-download')).toHaveText('Descargar PDF');
    await expect(page.getByTestId('paper-original')).toHaveText('Original en castellano (PDF)');
    await page.goto('/en/paper/');
    await expect(page.getByTestId('paper-download')).toHaveText('Download PDF');
    await expect(page.locator('nav.site-header [data-nav="research"][aria-current="page"]')).toHaveCount(1);
  });

  test('fits a phone without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/es/paper/');
    await expect(page.locator('[data-testid="paper"] .pp-eq').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
