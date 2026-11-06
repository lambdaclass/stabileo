import { test, expect, type Page } from '@playwright/test';

const VIEWPORTS = [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 900 }];

const appBackground = (page: Page) => page.locator('#app').evaluate((el) => getComputedStyle(el).backgroundImage);

for (const viewport of VIEWPORTS) {
  for (const path of ['/app/basic', '/app/pro']) {
    test(`@smoke ${path} paints before the application downloads at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      await page.route(/\/assets\/App-[^/]+\.js$/, async (route) => { await held; await route.continue(); });
      await page.goto(path);
      await expect(page.locator('html')).toHaveClass(/\bapp-boot\b/);
      await expect(page.locator('#prerender')).toHaveCount(0);
      await expect(page.locator('#app')).toBeVisible();
      expect(await appBackground(page)).toContain('data:image/svg+xml');
      expect(await page.locator('#app').boundingBox()).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
      await expect.poll(() => page.evaluate(() => performance.getEntriesByName('first-contentful-paint').length)).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      release();
      await expect(page.locator('.app-container')).toBeVisible();
      expect(await appBackground(page)).toBe('none');
    });
  }
}

test('@smoke the landing keeps its prerendered page and never shows the application mark', async ({ page }) => {
  await page.goto('/en/');
  await expect(page.locator('#app .landing h1').first()).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/\bapp-boot\b/);
});
