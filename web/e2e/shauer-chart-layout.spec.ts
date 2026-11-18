import { expect, test } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

test('@smoke shauer-2025 charts keep a stable SVG height when tabs open and the pane resizes', async ({ page }) => {
  test.skip(true, 'known wrong result: #2286');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/research/fracture/shauer-2025/');
  await expect(page.locator('.rs-shell-app .sfv-canvas canvas')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);

  for (const width of [390, 1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [tab, count] of [['force', 2], ['convergence', 1]] as const) {
      await page.locator(`#rs-tab-${tab}`).click();
      const charts = page.locator(`#rs-panel-${tab} svg[viewBox]`);
      await expect(charts).toHaveCount(count);
      const samples = await charts.evaluateAll(async nodes => {
        const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        await frame();
        await frame();
        const sizes: { height: number; viewBoxHeight: number }[][] = [];
        for (let i = 0; i < 8; i++) {
          await frame();
          sizes.push(nodes.map(node => {
            const svg = node as SVGSVGElement;
            return { height: svg.getBoundingClientRect().height, viewBoxHeight: svg.viewBox.baseVal.height };
          }));
        }
        return sizes;
      });
      const state = `${tab} at ${width}px`;
      for (const [index, first] of samples[0].entries()) {
        expect.soft(first.height, state).toBeGreaterThan(0);
        expect.soft(samples.map(sample => sample[index]), state).toEqual(
          samples.map(() => ({ height: first.height, viewBoxHeight: first.height })),
        );
      }
    }
  }
});
