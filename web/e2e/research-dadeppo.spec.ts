import { test, expect } from '@playwright/test';
import replay from '../../research/benchmarks/dadeppo-arch-1975/results/stabileo_results.json' with { type: 'json' };

test.describe('@smoke DaDeppo arch first version', () => {
  for (const width of [360, 390, 810]) {
    test(`replay and live production result at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/en/research/benchmarks/dadeppo-arch-1975/');
      await expect(page.getByText('First version · 0 reviews').first()).toBeVisible();
      await expect(page.locator('.arch-app')).toHaveAttribute('data-source', 'replay');
      await expect(page.getByTestId('arch-peak')).toHaveText('9.01129');
      await expect(page.locator('.sfv canvas').first()).toBeVisible();
      if (width === 810) await page.locator('.sfv').screenshot({ path: testInfo.outputPath('arch-viewer.png') });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.getByRole('combobox', { name: 'Live path', exact: true }).selectOption('20');
      await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
      await expect(page.locator('.arch-app')).toHaveAttribute('data-busy', 'true');
      await expect(page.locator('.arch-app')).toHaveAttribute('data-source', 'cached', { timeout: 15_000 });
      const peak = Math.max(...replay.steps.slice(0, 20).map(step => step.loadFactor));
      await expect(page.getByTestId('arch-peak')).toHaveText(new Intl.NumberFormat('en', { maximumFractionDigits: 5 }).format(peak));
      await expect(page.getByTestId('arch-verdict')).toContainText('path incomplete');
      await expect(page.locator('.arch-app')).toHaveAttribute('data-busy', 'false');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: 'Restart', exact: true }).click();
      await expect(page.locator('.arch-app')).toHaveAttribute('data-source', 'replay');
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
    });
  }
});

test('@slow DaDeppo full live benchmark reaches the descending branch', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/en/research/benchmarks/dadeppo-arch-1975/');
  await page.getByRole('combobox', { name: 'Live path', exact: true }).selectOption('400');
  await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
  await expect(page.locator('.arch-app')).toHaveAttribute('data-source', 'cached', { timeout: 150_000 });
  await expect(page.getByTestId('arch-peak')).toHaveText('9.01129');
  await expect(page.getByTestId('arch-verdict')).toContainText('descending branch reached');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
