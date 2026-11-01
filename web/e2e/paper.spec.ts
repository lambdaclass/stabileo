import { test, expect } from '@playwright/test';

/**
 * /paper: the JAIE 2026 paper in full, in English, set as its LaTeX article (KaTeX), between Changelog
 * and Research in the site header, with the typeset PDF and the Spanish original.
 *
 *   npx playwright test --grep "@smoke paper"
 */
test.describe('@smoke paper', () => {
  test('the header links Blog, Changelog, Paper, Research in that order and Paper opens the paper', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/es/blog/');
    const nav = page.locator('nav.site-header [data-nav]');
    const ids = await nav.evaluateAll((els) => els.map((e) => e.getAttribute('data-nav')));
    expect(ids.slice(ids.indexOf('blog'), ids.indexOf('blog') + 4)).toEqual(['blog', 'changelog', 'paper', 'research']);
    const link = page.locator('nav.site-header [data-nav="paper"]');
    await expect(link).toHaveText('Paper');
    await link.click();
    await expect(page).toHaveURL(/\/es\/paper\/$/);
    await expect(page.locator('[data-testid="paper"] h1')).toContainText('Developing a structural calculation agent on top of a verified solver');
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
    await expect(page.locator('nav.site-header [data-nav="paper"][aria-current="page"]')).toHaveCount(1);
  });

  test('fits a phone without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/es/paper/');
    await expect(page.locator('[data-testid="paper"] .pp-eq').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
