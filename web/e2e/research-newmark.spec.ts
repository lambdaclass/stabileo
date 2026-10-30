import { expect, test } from '@playwright/test';

for (const width of [360, 390, 810]) {
  test(`@smoke Newmark production step response at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/research/benchmarks/newmark-1959/');
    await expect(page.getByRole('heading', { name: 'Newmark average acceleration' })).toBeVisible();
    await expect(page.getByText('First version · 0 reviews', { exact: true })).toBeVisible();
    await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
    await expect(page.getByTestId('source')).toContainText('Precomputed replay');
    const replayError = Number(await page.getByTestId('comparison').getAttribute('data-error'));
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    await expect(page.getByTestId('source')).toContainText('Live computation', { timeout: 60_000 }); // slow-ok: The production WASM engine computes the Newmark time-history response.
    const fine = Number(await page.getByTestId('comparison').getAttribute('data-error'));
    expect(Math.abs(fine - replayError)).toBeLessThan(1e-10);
    expect(fine).toBeGreaterThan(0);
    expect(fine).toBeLessThan(0.002);
    await page.getByLabel('Time step', { exact: true }).selectOption('0.2');
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    await expect(page.getByTestId('source')).toContainText('Live computation');
    expect(Number(await page.getByTestId('comparison').getAttribute('data-error'))).toBeGreaterThan(fine);
    await expect(page.getByRole('heading', { name: 'Not yet', exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/newmark-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
