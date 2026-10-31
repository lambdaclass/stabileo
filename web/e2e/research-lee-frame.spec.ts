import { expect, test, type Page } from '@playwright/test';

const URL = (locale: string) => `/${locale}/research/benchmarks/lee-frame-1968/`;

async function inspect(page: Page) {
  const errors = await page.locator('.rs-shell').evaluate(root => {
    const errors: string[] = [];
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    for (const el of root.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      if (!rect.width || !rect.height || style.visibility === 'hidden') continue;
      if ((rect.right > innerWidth + 1 || rect.left < -1) && !clipped(el)) errors.push(`overflow: ${el.tagName}.${el.className}`);
      const text = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      const scale = el instanceof SVGGraphicsElement ? (el.getScreenCTM()?.a ?? 1) : 1;
      if (text && parseFloat(style.fontSize) * scale < 12) errors.push(`text: ${el.tagName}.${el.className}`);
      if (el.matches('button, input, select, [role="button"]') && (rect.height < 44 || rect.width < 44)) errors.push(`target: ${el.tagName}.${el.className}`);
    }
    return errors;
  });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('@smoke Lee frame replay, reduced-motion live run and stop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL('en'));
  await expect(page.getByRole('heading', { name: 'Lee frame (1968)', exact: true })).toBeVisible();
  await expect(page.getByText('First version · 2 review rounds', { exact: true })).toBeVisible();
  await expect(page.getByTestId('lee-limit')).toHaveText('1.8658');
  await expect(page.getByTestId('lee-difference')).toHaveText('≈ +2%');
  await expect(page.getByTestId('lee-fine')).toHaveText('1.8563');
  await expect(page.getByTestId('lee-fine-difference')).toHaveText('≈ +1%');
  await expect(page.getByTestId('lee-convergence')).toContainText('1.8658 kN at step 47');
  await expect(page.getByTestId('lee-convergence')).toContainText('1.8582 and 1.8563 kN');
  await expect(page.getByTestId('lee-convergence')).toContainText('less than 0.0001 kN');
  const slider = page.getByRole('slider', { name: 'Step' });
  await expect(slider).toHaveValue('90');
  const chartPoint = page.getByTestId('chart-point');
  await expect(chartPoint).toHaveCount(1);
  const lastY = Number(await chartPoint.getAttribute('cy'));
  await slider.fill('47');
  await expect.poll(async () => Number(await chartPoint.getAttribute('cy'))).toBeLessThan(lastY - 50);
  await expect(slider).toHaveAttribute('aria-valuetext', 'Step 47: P = 1.8658 kN, downward displacement 48.525 cm');
  await expect(page.getByTestId('lee-readout')).toHaveText('Step 47: P = 1.8658 kN, downward displacement 48.525 cm');
  await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
  await expect(page.getByTestId('lee-source')).toContainText(/Live computation · ([3-9]|\d\d)\/90/, { timeout: 30_000 });
  await expect(slider).toHaveValue('1');
  await expect(page.getByTestId('lee-source')).toHaveText('Cached result · 90/90', { timeout: 100_000 }); // slow-ok: The WASM worker recomputes the nonlinear Lee frame path through all 90 steps.
  await expect(slider).toHaveValue('90');
  await expect(page.getByTestId('lee-limit')).toHaveText('1.8658');
  await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
  await expect(page.getByTestId('lee-source')).toContainText(/Live computation · [1-9]/, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByTestId('lee-source')).toHaveText(/^Stopped at \d+\/90$/);
  await page.getByRole('button', { name: 'Restart replay', exact: true }).click();
  await expect(page.getByTestId('lee-source')).toContainText('Precomputed replay');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

for (const [width, height] of [[360, 800], [390, 844], [844, 390], [810, 1080]]) {
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
    test(`Lee frame direct visit ${locale} ${width}x${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(URL(locale));
      await expect(page.getByTestId('lee-limit')).toHaveText(/^1[.,]8658$/);
      const viewer = page.locator('.lee-pane .sfv');
      await expect(viewer).toBeInViewport({ ratio: 0.5 });
      expect((await viewer.boundingBox())!.height).toBeLessThanOrEqual(height * .48 + 1);
      await expect(page.locator('.rs-shell')).not.toContainText(/scalarViewer\.|Questions for the authors|provisional|not checked|pending|First limit load/i);
      await inspect(page);
      await page.locator('.lee-pane .cam-cube').click();
      await inspect(page);
      await page.locator('.lee-pane .cam-backdrop').dispatchEvent('click');
      await expect(page.locator('.lee-pane .cam-backdrop')).toHaveCount(0);
      const slider = page.getByRole('slider');
      const chartPoint = page.getByTestId('chart-point');
      const lastY = Number(await chartPoint.getAttribute('cy'));
      await slider.fill('47');
      await expect.poll(async () => Number(await chartPoint.getAttribute('cy'))).toBeLessThan(lastY - 50);
      await expect(slider).toHaveAttribute('aria-valuetext', /47.*1[.,]8658.*48[.,]525/);
      await page.screenshot({ path: testInfo.outputPath(`lee-${locale}-${width}x${height}.png`), fullPage: true });
    });
  }
}
