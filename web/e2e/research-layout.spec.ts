import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 810, height: 1080 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`gallery badges and captions stay inside cards at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/en/research/');
    const cards = page.locator('.rs-g-runcard');
    await expect(cards.first()).toBeVisible();
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      const bounds = await card.boundingBox();
      for (const badge of await card.locator('.rs-g-meta > span').all()) {
        const box = await badge.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
        expect(await badge.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }
      const img = card.locator('img');
      await expect(img).toHaveJSProperty('complete', true);
      expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
      await expect(img).toHaveCSS('object-fit', 'contain');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [390, 1440]) {
  test(`Newmark legend never overlaps camera controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/research/benchmarks/newmark-1959/');
    const viewer = page.locator('.rs-viewer-host');
    await expect(viewer.locator('canvas').first()).toBeVisible();
    const legend = viewer.locator('.shell-legend');
    await expect(legend).toBeVisible();
    const a = (await legend.boundingBox())!;
    for (const button of await viewer.locator('.camera-controls button').all()) {
      const b = (await button.boundingBox())!;
      expect(a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height || b.y >= a.y + a.height).toBe(true);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    if (width === 1440) {
      const article = (await page.locator('.rs-shell-article').boundingBox())!;
      const app = (await page.locator('.rs-shell-app').boundingBox())!;
      expect(Math.abs(article.y - app.y)).toBeLessThanOrEqual(1);
      const heading = (await page.locator('.rs-shell-head').boundingBox())!;
      expect(app.y - heading.y - heading.height).toBeLessThan(40);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
