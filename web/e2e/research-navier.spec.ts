import { test, expect } from '@playwright/test';

for (const width of [360, 390, 810]) {
  test(`@smoke Navier plate at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/research/benchmarks/navier-plate');
    await expect(page.getByRole('heading', { name: 'Navier plate: mesh convergence' })).toBeVisible();
    await expect(page.getByTestId('navier-results').locator('tbody tr')).toHaveCount(6);
    await expect(page.getByTestId('navier-source')).toContainText('Precomputed replay');
    await page.getByRole('button', { name: 'Recompute live' }).click();
    await expect(page.getByTestId('navier-source')).toContainText('Cached result', { timeout: 120000 }); // slow-ok: The WASM worker solves all six plate meshes before publishing convergence results.
    const rows = page.getByTestId('navier-results').locator('tbody tr');
    await expect(rows).toHaveCount(6);
    const value = Number(await rows.last().locator('td').nth(2).textContent());
    expect(Math.abs(value / 1.283748114 - 1)).toBeLessThan(.05);
    await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('navier.png'), fullPage: true });
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(page.getByTestId('navier-source')).toContainText('Precomputed replay');
  });
}
