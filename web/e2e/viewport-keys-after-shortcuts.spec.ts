/**
 * The 3D view's held-key navigation (WASD, Q/E, arrows) and the shortcuts that share its letters.
 *
 * Ctrl/Cmd+S opens the save dialog, which takes the key's release with it, and on a Mac no letter
 * is released to the page while Cmd is down: the view kept panning for good.
 */
import { test, expect, type Page } from '@playwright/test';
import { test as proTest, loadModel } from './fixtures';

type Cam = { pos: [number, number, number]; target: [number, number, number] } | null;
const camera = (page: Page) => page.evaluate(() => window.__stabileo.cameraState() as Cam);
const moved = (a: Cam, b: Cam) => !a || !b || a.pos.some((v, i) => Math.abs(v - b.pos[i]!) > 1e-6) || a.target.some((v, i) => Math.abs(v - b.target[i]!) > 1e-6);

/** A key pressed and never released, as the page sees it when a dialog takes the release. */
const pressOnly = (page: Page, key: string, mods: { ctrlKey?: boolean; metaKey?: boolean } = {}) =>
  page.evaluate(([k, m]) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k as string, bubbles: true, cancelable: true, ...(m as object) })); }, [key, mods] as const);

async function basic3D(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 60_000 }).toBe(true);
  await loadModel(page, 'two-story-frame');
  await page.getByTestId('rb-cmd-dim').click();
  await expect.poll(() => camera(page).then(Boolean), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(1000);
}

async function staysStill(page: Page) {
  const before = await camera(page);
  await page.waitForTimeout(800);
  expect(moved(before, await camera(page)), 'the view stayed where it was').toBe(false);
}

test.describe('@smoke shortcuts do not leave the 3D view moving', () => {
  test('Basic 3D: Ctrl+S, Cmd+S and Cmd+A whose release never arrives', async ({ page }) => {
    page.on('download', () => {});
    await basic3D(page);
    for (const [key, mods] of [['s', { ctrlKey: true }], ['s', { metaKey: true }], ['a', { metaKey: true }]] as const) {
      await pressOnly(page, key, mods);
      await staysStill(page);
    }
  });

  test('Basic 3D: a navigation key held when the window loses focus stops there', async ({ page }) => {
    await basic3D(page);
    const start = await camera(page);
    await pressOnly(page, 'w');
    await page.waitForTimeout(300);
    expect(moved(start, await camera(page)), 'W moves the view').toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(100);
    await staysStill(page);
  });

  test('Basic 3D: letting go of Cmd stops a navigation key whose release a Mac never sent', async ({ page }) => {
    await basic3D(page);
    await pressOnly(page, 'd');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta', bubbles: true })));
    await page.waitForTimeout(100);
    await staysStill(page);
  });
});

proTest.describe('@smoke shortcuts do not leave the PRO view moving', () => {
  proTest('PRO: Ctrl+S whose release never arrives', async ({ pro: page }) => {
    page.on('download', () => {});
    await loadModel(page, '3d-portal-frame');
    await page.waitForTimeout(1000);
    await pressOnly(page, 's', { ctrlKey: true });
    await staysStill(page);
  });
});
