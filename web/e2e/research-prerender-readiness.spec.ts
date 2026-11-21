import { expect, test } from '@playwright/test';
import { waitForRenderedApp } from '../scripts/prerender-pool';

const benchmarks = [
  ['mattiasson-elastica', 'mattiasson-summary', 'Computing'],
  ['macneal-harder-1985', 'benchmark-summary', 'Running production engine'],
  ['shell-obstacle-course', 'shell-summary', 'Running production engine'],
] as const;

for (const [benchmark, summaryId, pending] of benchmarks) {
  test(`@smoke prerender waits for ${benchmark} results`, async ({ page }) => {
    let release = () => {};
    const engine = new Promise<void>(resolve => { release = resolve; });
    await page.route(/dedaliano_engine_bg[^/]*\.wasm$/, async route => {
      await engine;
      await route.continue();
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const summary = page.getByTestId(summaryId);
    try {
      await page.goto(`/en/research/benchmarks/${benchmark}/`, { waitUntil: 'domcontentloaded' });
      await expect(summary).toContainText(pending);
      await expect.poll(() => page.evaluate(() => (globalThis as { __prerenderHolds?: number }).__prerenderHolds ?? 0)).toBeGreaterThan(0);
    } finally {
      release();
    }
    await waitForRenderedApp(page);
    await expect(summary).not.toContainText(pending);
    await expect(page.locator('#app [role=alert]')).toHaveCount(0);
  });
}
