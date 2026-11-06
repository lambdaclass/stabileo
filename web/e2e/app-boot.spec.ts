import { test, expect } from '@playwright/test';

const VIEWPORTS = [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 900 }];

for (const viewport of VIEWPORTS) {
  for (const path of ['/app/basic', '/app/pro']) {
    test(`@smoke ${path} paints before the application downloads at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      await page.route(/\/assets\/App-[^/]+\.js$/, async (route) => { await held; await route.continue(); });
      await page.goto(path);
      const boot = page.getByTestId('app-boot');
      await expect(boot.locator('svg')).toBeVisible();
      await expect(page.locator('#prerender')).toHaveCount(0);
      expect(await boot.boundingBox()).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
      await expect.poll(() => page.evaluate(() => performance.getEntriesByName('first-contentful-paint').length)).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      release();
      await expect(page.locator('.app-container')).toBeVisible();
      await expect(boot).toHaveCount(0);
    });
  }
}
