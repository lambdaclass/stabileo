import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const native = JSON.parse(readFileSync(new URL('../../research/stability/southwell-1932/results/stabileo_results.json', import.meta.url), 'utf8'));
for (const width of [360, 390, 810]) {
  test(`@smoke Southwell production column at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/en/research/stability/southwell-1932/');
    await expect(page.getByRole('heading', { name: 'Southwell: an imperfect column' })).toBeVisible();
    await expect(page.getByText('First version · 0 reviews', { exact: true })).toBeVisible();
    await expect(page.getByTestId('source')).toContainText('Live computation', { timeout: 60_000 });
    const comparison = page.getByTestId('comparison');
    const estimated = Number(await comparison.getAttribute('data-estimated'));
    expect(Math.abs(estimated / 219.324542246 - 1)).toBeLessThan(.01);
    expect(estimated).toBeCloseTo(native.estimated, 6);
    expect(Math.abs(Number(await comparison.getAttribute('data-linear')) / 219.324542246 - 1)).toBeLessThan(.001);
    await expect(page.locator('.experiment canvas').first()).toBeVisible();
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    await expect(page.getByTestId('source')).toContainText('Live computation');
    expect(Number(await comparison.getAttribute('data-estimated'))).toBeCloseTo(estimated, 7);
    await expect(page.getByRole('img', { name: 'Southwell plot', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Not yet', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/southwell-${width}.png`, fullPage: true });
  });
}
