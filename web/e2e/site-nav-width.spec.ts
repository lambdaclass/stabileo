import { test, expect } from '@playwright/test';
import { PUBLIC_LOCALES } from '../src/lib/i18n/offered';
import { SITE_NAV } from '../src/components/site/site-nav';

// The site nav shows its links whenever they fit (from 1081px), and never overlaps or overflows.
for (const lang of PUBLIC_LOCALES) {
  for (const width of [1081, 1280, 1440]) {
    test(`@smoke site nav in ${lang} at ${width}px shows every link without overlap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/${lang}/blog/`);
      const links = page.locator('nav.site-header .nav-links');
      const actions = page.locator('nav.site-header .nav-actions');
      await expect(links).toBeVisible();
      for (const id of SITE_NAV.map((item) => item.id)) await expect(page.locator(`nav.site-header [data-nav="${id}"]`)).toBeVisible();
      await expect(page.locator('nav.site-header .nav-menu-cta')).toBeHidden();
      const [l, a] = [await links.boundingBox(), await actions.boundingBox()];
      expect(l && a && l.x + l.width <= a.x).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
  test(`@smoke site nav in ${lang} at 1080px collapses into its menu`, async ({ page }) => {
    await page.setViewportSize({ width: 1080, height: 800 });
    await page.goto(`/${lang}/blog/`);
    await expect(page.locator('nav.site-header .nav-toggle')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
