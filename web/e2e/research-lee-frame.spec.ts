import { expect, test } from '@playwright/test';
for (const width of [360, 390, 810]) {
  test(`@smoke Lee frame replay and live peak at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/research/benchmarks/lee-frame-1968/');
    await expect(page.getByRole('heading', { name: 'Lee frame (1968)', exact: true })).toBeVisible();
    await expect(page.getByText('First version · 0 reviews', { exact: true })).toBeVisible();
    await expect(page.getByTestId('lee-limit')).toHaveText('1.8658');
    await expect(page.locator('.lee-pane canvas').first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('lee-frame.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    await expect(page.getByTestId('lee-source')).toContainText('Cached result · 90/90', { timeout: 100_000 });
    await expect(page.getByTestId('lee-limit')).toHaveText('1.8658');
    await page.getByRole('button', { name: 'Restart replay', exact: true }).click();
    await expect(page.getByTestId('lee-source')).toContainText('Precomputed replay');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
  });
}
