import { test, expect } from '@playwright/test';

for (const width of [360, 390, 810]) {
  test(`@smoke plastic portal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/research/benchmarks/plastic-collapse');
    await expect(page.getByRole('heading', { name: 'Classic plastic collapse', exact: true })).toBeVisible();
    await expect(page.getByText('First version · 0 reviews', { exact: true })).toBeVisible();
    await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
    await expect(page.getByTestId('collapse-factor')).toContainText('85.714286');
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    await expect(page.getByTestId('source')).toHaveText('Live computation');
    await expect(page.getByTestId('collapse-factor')).toContainText('85.714286');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
