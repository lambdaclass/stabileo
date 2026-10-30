import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  for (const destination of ['research', 'tools']) {
    test(`@smoke public navigation to ${destination} stays visible and resets scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      // Disable speculative loads to exercise the cold-click path as well as a slow network.
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
      });
      await page.route('**/assets/*.js', async route => {
        if (/\/(?:load-page|ResearchPage|ToolsPage)-/.test(route.request().url())) {
          await new Promise(resolve => setTimeout(resolve, 750));
        }
        await route.continue();
      });
      await page.goto('/en/');
      const scroller = page.locator('#app .landing');
      await expect(scroller).toBeVisible();
      await scroller.evaluate(el => el.scrollTo({ top: 1000, behavior: 'instant' }));
      await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
      if (width === 390) await page.locator('#app .nav-toggle').click();
      await page.evaluate(() => {
        const state = { samples: [] as number[], timer: 0 };
        const sample = () => state.samples.push((document.querySelector<HTMLElement>('#app .landing')?.innerText ?? '').trim().length);
        sample();
        state.timer = window.setInterval(sample, 50);
        (window as typeof window & { navSamples?: typeof state }).navSamples = state;
      });
      await page.locator(`#app .site-header [data-nav="${destination}"]`).click();
      await expect(page.locator(`#app .site-header[data-current="${destination}"]`)).toBeVisible();
      await expect(page.locator('#app .landing h1')).toBeVisible();
      await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);
      const samples = await page.evaluate(() => {
        const state = (window as typeof window & { navSamples?: { samples: number[]; timer: number } }).navSamples!;
        clearInterval(state.timer);
        return state.samples;
      });
      expect(samples.length).toBeGreaterThan(1);
      expect(samples.every(length => length > 0), `Empty public page in samples: ${samples}`).toBe(true);
      // Back uses the same deferred router and deliberately resets to top.
      await page.goBack();
      await expect(page.locator('#app .nav-brand button, #app button.nav-brand').first()).toBeVisible();
      await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);
    });
  }
}
