/**
 * The solve card and the toasts share one stack: the success toast never covers the card's
 * buttons, on a phone (with or without Basic's sheet open) or on a desktop.
 */
import { test, expect, type Page } from './fixtures';


type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function solveAndCheck(page: Page, shot: string, width: number, overSheet = false) {
  await page.evaluate(() => { void window.__stabileoActions.solve(); });
  const card = page.getByTestId('solve-progress');
  await expect(card).toHaveAttribute('data-phase', 'done', { timeout: 60_000 });
  const toasts = page.locator('.toast');
  await expect(toasts.first()).toBeVisible();
  if (overSheet) await expect(page.locator('.toast-container')).toHaveClass(/toast-over-sheet/);
  const cardBox = (await card.boundingBox())!;
  for (const toast of await toasts.all()) {
    const box = (await toast.boundingBox())!;
    expect(overlaps(cardBox, box), `card ${JSON.stringify(cardBox)} over toast ${JSON.stringify(box)}`).toBe(false);
  }
  expect(cardBox.x).toBeGreaterThanOrEqual(0);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(width);
  expect(cardBox.y).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: test.info().outputPath(`${shot}.png`) });
  await card.getByTestId('solve-progress-done').click();
  await expect(card).toHaveCount(0);
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('@smoke Basic on a phone: the solve card stands above the toasts, sheet closed and open', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('liveCalc', 'false'); } catch { /* private mode */ } });
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 45_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.waitForFunction(() => window.__stabileo.solverReady());
    await solveAndCheck(page, 'basic-390', 390);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('stabileo-open-panel', { detail: { panel: 'results', toggle: false } })));
    await expect(page.getByTestId('basic-panel')).toBeVisible();
    await solveAndCheck(page, 'basic-390-sheet', 390, true);
  });

  test('@smoke PRO on a phone: the solve card stands above the toasts', async ({ pro: page }) => {
    await page.evaluate(() => window.__stabileoActions.loadExample('rc-design-qa-8'));
    await page.waitForFunction(() => window.__stabileo.solverReady());
    await solveAndCheck(page, 'pro-390', 390);
  });
});

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('@smoke PRO at 1600 px: the toasts stack with the solve card, not over it', async ({ pro: page }) => {
    await page.evaluate(() => window.__stabileoActions.loadExample('rc-design-qa-8'));
    await page.waitForFunction(() => window.__stabileo.solverReady());
    await solveAndCheck(page, 'pro-1600', 1600);
  });
});
