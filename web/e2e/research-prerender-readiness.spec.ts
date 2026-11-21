import { setTimeout as delay } from 'node:timers/promises';
import { expect, test, type Page } from '@playwright/test';
import { waitForRenderedApp } from '../scripts/prerender-pool';

const benchmarks = [
  ['mattiasson-elastica', 'mattiasson-summary', 'Computing', 'Analytical checks passed: 5/5'],
  ['macneal-harder-1985', 'benchmark-summary', 'Running production engine',
    'Shell cases (paper reference): 2/6 within 2%; 2 withheld by the engine · Frame adaptations (analytical reference): 6/6 within 2%'],
  ['shell-obstacle-course', 'shell-summary', 'Running production engine', 'Finest selected meshes passing: 1/3'],
] as const;

async function captureFirstRun(page: Page, benchmark: string, summaryId: string, pending: string, outcome: 'continue' | 'abort') {
  let release = () => {};
  const engine = new Promise<void>(resolve => { release = resolve; });
  const wasm = /dedaliano_engine_bg[^/]*\.wasm$/;
  await page.route(wasm, async route => {
    await engine;
    if (outcome === 'abort') await route.abort();
    else await route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const snapshot = () => page.evaluate(id => ({
    summary: document.querySelector(`#app [data-testid="${id}"]`)?.textContent?.trim(),
    alerts: [...document.querySelectorAll('#app [role=alert]')].map(alert => ({
      text: alert.textContent?.trim(),
      visible: alert.checkVisibility({ visibilityProperty: true }),
    })),
  }), summaryId);

  try {
    await Promise.all([
      page.waitForRequest(wasm),
      page.goto(`/en/research/benchmarks/${benchmark}/`, { waitUntil: 'domcontentloaded' }),
    ]);
    await expect(page.getByTestId(summaryId)).toContainText(pending);
    const ready = waitForRenderedApp(page);
    const observed = Promise.race([ready.then(() => false), delay(500, true)]).then(async stayedPending => {
      const holds = await page.evaluate(() => (globalThis as { __prerenderHolds?: number }).__prerenderHolds ?? 0);
      release();
      return { stayedPending, hasHold: holds > 0 };
    });
    const [captured, gate] = await Promise.all([ready.then(snapshot), observed]);
    return { ...gate, ...captured };
  } finally {
    release();
  }
}

for (const [benchmark, summaryId, pending, result] of benchmarks) {
  test(`@smoke prerender waits for ${benchmark} results`, async ({ page }) => {
    expect(await captureFirstRun(page, benchmark, summaryId, pending, 'continue')).toEqual({
      stayedPending: true,
      hasHold: true,
      summary: result,
      alerts: [],
    });
  });
}

test('@smoke prerender captures a failed first Mattiasson run', async ({ page }) => {
  expect(await captureFirstRun(page, 'mattiasson-elastica', 'mattiasson-summary', 'Computing', 'abort')).toMatchObject({
    stayedPending: true,
    hasHold: true,
    alerts: [{ text: 'Computation failed', visible: true }],
  });
});
