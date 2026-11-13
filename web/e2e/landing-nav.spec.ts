import { test, expect } from '@playwright/test';

const ITEMS = [['basic', 'Product', '/en/#basic'], ['examples', 'Examples', '/en/examples/'], ['tools', 'Tools', '/en/tools/'], ['game', 'Game', '/en/diagram-game/'], ['research', 'Research', '/en/research/'], ['pricing', 'Pricing', '/en/#pricing'], ['blog', 'Blog', '/en/blog/']];

test.describe('@smoke landing nav', () => {
  test('seven items and the editor button on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/');
    const header = page.locator('nav.site-header');
    const items = await header.locator('.nav-links [data-nav]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-nav'), e.textContent?.trim(), e.getAttribute('href')]));
    expect(items).toEqual(ITEMS);
    for (const link of await header.locator('.nav-links [data-nav]').all()) {
      await expect(link).toBeVisible();
      const pad = await link.evaluate((e) => parseFloat(getComputedStyle(e).paddingLeft));
      expect(pad).toBeGreaterThanOrEqual(11);
    }
    const cta = header.getByRole('button', { name: 'Open the editor' });
    await expect(cta).toHaveCount(1);
    await expect(cta).toBeVisible();
    await expect(header.locator('.nav-menu-cta')).toBeHidden();
  });

  test('Product opens the landing at Basic from another page', async ({ page }) => {
    await page.goto('/en/tools/');
    await expect(page.locator('#prerender')).toHaveCount(0);
    await page.locator('nav.site-header [data-nav="basic"]').click();
    await expect(page).toHaveURL(/\/en\/#basic$/);
    await expect(page.locator('#basic-title')).toBeInViewport();
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    test(`the menu at ${viewport.width}px holds the six items${viewport.width < 761 ? ', then the editor button' : ''}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/en/research/');
      const header = page.locator('nav.site-header');
      await expect(header.locator('.nav-links')).toBeHidden();
      await header.locator('.nav-toggle').click();
      const children = await header.locator('.nav-links.open > :visible').evaluateAll((els) => els.map((e) => {
        const b = e.getBoundingClientRect();
        return { nav: e.getAttribute('data-nav'), text: e.textContent?.trim(), top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height, font: parseFloat(getComputedStyle(e).fontSize) };
      }));
      const phone = viewport.width < 761;
      expect(children.map((c) => c.nav)).toEqual([...ITEMS.map(([id]) => id), ...(phone ? [null] : [])]);
      if (phone) expect(children.at(-1)!.text).toBe('Open the editor');
      for (const c of children) {
        expect(c.height, `${c.text} tap target`).toBeGreaterThanOrEqual(44);
        expect(c.font, `${c.text} font size`).toBeGreaterThanOrEqual(12);
        expect(c.left).toBeGreaterThanOrEqual(0);
        expect(c.right).toBeLessThanOrEqual(viewport.width);
        expect(c.bottom).toBeLessThanOrEqual(viewport.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(header.locator('[aria-current="page"]')).toHaveAttribute('data-nav', 'research');
      if (phone) {
        await header.locator('.nav-menu-cta').click();
        await expect(page).toHaveURL(/\/app\/basic(\?|$)/);
      }
    });
  }

  test('the research gallery features the paper, which belongs to research', async ({ page }) => {
    await page.goto('/en/research/');
    const paper = page.locator('.rs-g-head a[href="/en/paper/"]');
    await expect(paper).toContainText('JAIE 2026');
    const box = (await paper.boundingBox())!;
    const firstH2 = (await page.locator('.rs-g-h2').first().boundingBox())!;
    expect(box.y).toBeLessThan(firstH2.y);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await paper.click();
    await expect(page).toHaveURL(/\/en\/paper\/$/);
    await expect(page.locator('nav.site-header [aria-current="page"]')).toHaveAttribute('data-nav', 'research');
  });
});
