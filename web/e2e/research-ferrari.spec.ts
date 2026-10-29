import { test, expect } from '@playwright/test';
test.describe('@smoke Ferrari research', () => {
  test('replays production results, recomputes and can stop and restart', async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/research/stability/ferrari-sigmund-2025/');
    await expect(page.getByTestId('ferrari-buckling')).toContainText('2.431356');
    await expect(page.getByTestId('ferrari-source')).toContainText('Precomputed replay');
    await expect(page.locator('.sfv canvas').first()).toBeVisible();
    await expect(page.getByText('Koiter comparison pending', { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    await expect(page.getByTestId('ferrari-source')).toContainText('Cached result', { timeout: 90_000 });
    await expect(page.getByTestId('ferrari-buckling')).toContainText('2.431356');
    await expect(page.getByTestId('ferrari-experiment')).toContainText('0.48837');
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Recompute live', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Restart replay', exact: true }).click();
    await expect(page.getByTestId('ferrari-source')).toContainText('Precomputed replay');
  });
  for (const [width, height] of [[360, 800], [390, 844], [844, 390], [810, 1080]]) {
    for (const locale of ['en', 'es', 'pt']) {
      test(`${locale} layout ${width}x${height}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(`/${locale}/research/stability/ferrari-sigmund-2025/`);
        const experiment = page.getByTestId('ferrari-experiment');
        await expect(experiment).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await experiment.evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(850);
        for (const control of await experiment.locator('.controls button, input').all()) {
          const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(await control.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
        }
        expect(await page.locator('.rs-shell-app').evaluate(el => getComputedStyle(el).order)).toBe('-1');
      });
    }
  }
});
