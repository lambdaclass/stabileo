import { test, expect } from '@playwright/test';

// The site nav shows its links whenever they fit (from 1141px), and never overlaps or overflows.
for (const lang of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
  for (const width of [1141, 1280, 1440]) {
    test(`@smoke site nav in ${lang} at ${width}px shows every link without overlap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/${lang}/blog/`);
      const links = page.locator('nav.site-header .nav-links');
      const actions = page.locator('nav.site-header .nav-actions');
      await expect(links).toBeVisible();
      await expect(page.locator('nav.site-header [data-nav="research"]')).toBeVisible();
      await expect(page.locator('nav.site-header [data-nav="blog"]')).toBeVisible();
      const [l, a] = [await links.boundingBox(), await actions.boundingBox()];
      expect(l && a && l.x + l.width <= a.x).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
  test(`@smoke site nav in ${lang} at 1100px collapses into its menu`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto(`/${lang}/blog/`);
    await expect(page.locator('nav.site-header .nav-toggle')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
