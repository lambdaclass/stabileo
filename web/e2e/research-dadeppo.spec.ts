import { test, expect, type Page } from '@playwright/test';
import replay from '../../research/benchmarks/dadeppo-arch-1975/results/stabileo_results.json' with { type: 'json' };

const LOCALES = ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const;
const SIZES = [[360, 800], [390, 844], [844, 390], [810, 1080]] as const;
const fmt = (locale: string, n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 5 }).format(n);

async function smallTextAndTargets(page: Page) {
  return page.locator('.rs-shell').evaluate(root => {
    const errors: string[] = [];
    for (const el of root.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      if (!rect.width || !rect.height || style.visibility === 'hidden') continue;
      const text = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      const scale = el instanceof SVGGraphicsElement ? (el.getScreenCTM()?.a ?? 1) : 1;
      if (text && parseFloat(style.fontSize) * scale < 12) errors.push(`text ${style.fontSize}: ${el.tagName}.${el.getAttribute('class') ?? ''} "${el.textContent?.trim().slice(0, 30)}"`);
      if (el.matches('button, input, select, summary, [role="button"]') && (rect.height < 44 || rect.width < 44)) errors.push(`target ${Math.round(rect.width)}x${Math.round(rect.height)}: ${el.tagName}.${el.getAttribute('class') ?? ''}`);
    }
    return errors;
  });
}

test.describe('@smoke DaDeppo arch', () => {
  for (const width of [360, 390, 810]) {
    test(`replay and live production result at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/en/research/benchmarks/dadeppo-arch-1975/');
      await expect(page.locator('.rs-review')).toHaveText('2 review rounds');
      await expect(page.locator('.rs-verify')).toContainText('4 of 4');
      await expect(page.locator('.arch-app')).toHaveAttribute('data-source', 'replay');
      await expect(page.getByTestId('arch-peak')).toHaveText('9.01129');
      await expect(page.getByTestId('check-loadFactor')).toContainText('9.0113');
      await expect(page.getByTestId('check-loadFactor')).toContainText('+0.46%');
      await expect(page.getByTestId('check-loadFactor').locator('td').nth(3)).toHaveText('0.6%');
      await expect(page.getByTestId('check-rotation').locator('td').nth(3)).toHaveText('4%');
      await expect(page.getByTestId('check-uOverR')).toContainText('0.61189');
      await expect(page.getByTestId('check-vOverR')).toContainText('1.13781');
      await expect(page.getByTestId('check-rotation')).toContainText('0.05135');
      await expect(page.getByTestId('arch-verdict')).toHaveText('All four within tolerance; descending branch reached');
      await expect(page.getByTestId('study-loadFactor')).toContainText('8.97264');
      await expect(page.locator('.sfv canvas').first()).toBeVisible();
      if (width === 810) await page.locator('.sfv').screenshot({ path: testInfo.outputPath('arch-viewer.png') });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.getByRole('combobox', { name: 'Live path', exact: true }).selectOption('20');
      await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
      await expect(page.locator('.arch-app')).toHaveAttribute('data-busy', 'true');
      await expect(page.locator('.arch-app')).toHaveAttribute('data-source', 'cached', { timeout: 15_000 });
      const peak = Math.max(...replay.steps.slice(0, 20).map(step => step.loadFactor));
      await expect(page.getByTestId('arch-peak')).toHaveText(fmt('en', peak));
      await expect(page.getByTestId('arch-verdict')).toHaveText('Incomplete path: 20 of 400 steps');
      await expect(page.getByTestId('check-uOverR')).toContainText('—');
      await expect(page.locator('.arch-app')).toHaveAttribute('data-busy', 'false');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: 'Restart', exact: true }).click();
      await expect(page.locator('.arch-app')).toHaveAttribute('data-source', 'replay');
      await expect(page.getByTestId('arch-verdict')).toHaveText('All four within tolerance; descending branch reached');
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
    });
  }
});

for (const [width, height] of SIZES) {
  for (const locale of LOCALES) {
    test(`@smoke DaDeppo direct visit ${locale} ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/${locale}/research/benchmarks/dadeppo-arch-1975/`);
      await expect(page.locator('.sfv canvas').first()).toBeVisible();
      await expect(page.locator('.arch-app .sfv')).toBeInViewport({ ratio: 0.5 });
      if (locale === 'en' || locale === 'de') await page.screenshot({ path: testInfo.outputPath(`arch-${locale}-${width}x${height}.png`) });
      await expect(page.getByTestId('arch-peak')).toHaveText(fmt(locale, 9.0112911888175));
      await expect(page.locator('.rs-shell')).not.toContainText(/scalarViewer\.|Questions for the authors|provisional|not checked|pending|not accessible/i);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await smallTextAndTargets(page)).toEqual([]);
      await page.locator('.arch-app .cam-cube').click();
      expect(await smallTextAndTargets(page)).toEqual([]);
      await page.locator('.arch-app .cam-backdrop').dispatchEvent('click');
      await expect(page.locator('.arch-app .cam-backdrop')).toHaveCount(0);
      const slider = page.getByRole('slider').first();
      await slider.fill('12');
      await expect(slider).toHaveAttribute('aria-valuetext', new RegExp(`260\\D.*PR²/EI = ${fmt(locale, replay.frames[12].loadFactor).replace('.', '\\.')}`));
      await page.locator('.arch-app details summary').click();
      await expect(page.getByTestId('arch-curve-data').locator('tbody tr')).toHaveCount(20);
      expect(await smallTextAndTargets(page)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

test('@slow DaDeppo full live benchmark reaches the descending branch and the limit point', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/en/research/benchmarks/dadeppo-arch-1975/');
  await page.getByRole('combobox', { name: 'Live path', exact: true }).selectOption('400');
  await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
  await expect(page.locator('.arch-app')).toHaveAttribute('data-source', 'cached', { timeout: 200_000 }); // slow-ok: twenty production arc-length prefixes up to 400 steps plus the three limit-point runs in WASM.
  await expect(page.getByTestId('arch-peak')).toHaveText('9.01129');
  await expect(page.getByTestId('check-rotation')).toContainText('0.05135');
  await expect(page.getByTestId('arch-verdict')).toHaveText('All four within tolerance; descending branch reached');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
