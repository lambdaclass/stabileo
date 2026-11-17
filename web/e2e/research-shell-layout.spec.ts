import { expect, test } from '@playwright/test';
import { EXPERIMENTS } from '../src/components/research/experiments';

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  for (const e of EXPERIMENTS) {
    test(`@smoke research shell: ${e.path} starts its experiment pane level with the title at ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/en${e.path}/`);
      await expect(page.locator('h1').first()).toBeVisible();
      const app = page.locator('.rs-shell-app');
      test.skip(await app.count() === 0, 'this page lays out its own panes');
      test.skip(await page.locator('.rs-shell-grid.rs-wide').count() > 0, 'a wide shell puts the app first, in one column');
      const head = (await page.locator('.rs-shell-head').boundingBox())!;
      const pane = (await app.boundingBox())!;
      const article = (await page.locator('.rs-shell-article').boundingBox())!;
      expect(Math.abs(pane.y - head.y)).toBeLessThan(2);
      expect(pane.x).toBeGreaterThan(head.x + head.width);
      expect(pane.x).toBeGreaterThan(article.x + article.width);
      expect(article.y).toBeGreaterThanOrEqual(head.y + head.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
