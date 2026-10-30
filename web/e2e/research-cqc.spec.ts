import { test, expect } from '@playwright/test';

test.describe('@smoke CQC first version', () => {
  for (const width of [360, 390, 810]) {
    test(`replay and production WASM agree at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/en/research/benchmarks/cqc-1981/');
      await expect(page.getByText('First version · 0 reviews')).toBeVisible();
      await expect(page.getByTestId('result-CQC')).toHaveText('17.549732');
      await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
      await page.getByRole('button', { name: 'Recompute live' }).click();
      await expect(page.getByTestId('cqc-source')).toHaveText('Live result (production WASM)', { timeout: 60000 }); // slow-ok: The production WASM response-spectrum solve must finish before comparing CQC and SRSS.
      await expect(page.getByTestId('result-SRSS')).toHaveText('14.387571');
      await expect(page.getByTestId('result-CQC')).toHaveText('17.549732');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: 'Restart', exact: true }).click();
      await expect(page.getByTestId('cqc-source')).toHaveText('Precomputed replay (same solver)');
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
    });
  }
});
