/**
 * The copy and paste buttons beside the delete button: in the options bar on a desktop, over the
 * model on a phone, where a tap places the copy.
 */
import { test, expect, type Page } from '@playwright/test';

const nodeCount = (page: Page) => page.evaluate(() => window.__stabileo.nodeCount());
const elementCount = (page: Page) => page.evaluate(() => window.__stabileo.elementIds().length);

async function portal(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await expect.poll(() => nodeCount(page)).toBe(4);
}

test.describe('@smoke copy and paste buttons on a desktop', () => {
  test('copy shows with a selection, paste once something is copied, and it places through the bar', async ({ page }) => {
    await portal(page);
    await expect(page.getByTestId('selection-copy')).toHaveCount(0);
    await expect(page.getByTestId('selection-paste')).toHaveCount(0);
    await page.evaluate(() => window.__stabileoActions.selectNodes([1, 2, 3]));
    const bar = page.getByTestId('tool-options-bar');
    await bar.getByTestId('selection-copy').click();
    await page.evaluate(() => window.__stabileoActions.clearSelection());
    await expect(bar.getByTestId('selection-copy')).toHaveCount(0);
    await bar.getByTestId('selection-paste').click();
    const hud = page.getByTestId('placement-hud');
    await expect(hud).toBeVisible();
    await expect(bar.getByTestId('selection-paste')).toBeDisabled();
    await hud.getByTestId('placement-x').fill('10');
    await hud.getByTestId('placement-y').fill('0');
    await hud.getByTestId('placement-y').press('Enter');
    await expect(hud).toHaveCount(0);
    expect(await nodeCount(page)).toBe(7);
    expect(await elementCount(page)).toBe(3);
  });
});

test.describe('@smoke copy and paste buttons on a phone', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test('2D: the buttons sit by the delete button over the model, and a tap places the copy', async ({ page }) => {
    await portal(page);
    await page.evaluate(() => window.__stabileoActions.selectElements([1, 2]));
    await expect(page.getByTestId('tool-options-bar')).toHaveCount(0);
    const copy = page.getByTestId('selection-copy');
    await expect(copy).toBeVisible();
    const del = (await page.getByTestId('selection-delete').boundingBox())!;
    const c = (await copy.boundingBox())!;
    expect(Math.abs(c.y - del.y)).toBeLessThan(4);
    await copy.tap();
    await page.getByTestId('selection-paste').tap();
    await expect(page.getByTestId('placement-hud')).toBeVisible();
    const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    const elementsBefore = await elementCount(page);
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.75);
    await expect(page.getByTestId('placement-hud')).toHaveCount(0);
    expect(await elementCount(page)).toBe(elementsBefore + 2);
  });

  test('3D: a tap places the copy too', async ({ page }) => {
    await portal(page);
    await page.getByTestId('rb-cmd-dim').tap();
    await expect.poll(() => page.evaluate(() => window.__stabileo.cameraState() !== null), { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__stabileoActions.selectElements([1, 2]));
    await page.getByTestId('selection-copy').tap();
    await page.getByTestId('selection-paste').tap();
    await expect(page.getByTestId('placement-hud')).toBeVisible();
    const p = (await page.evaluate(() => window.__stabileo.worldScreenPos(3, 0, 0)))!;
    const elementsBefore = await elementCount(page);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.getByTestId('placement-hud')).toHaveCount(0);
    expect(await elementCount(page)).toBe(elementsBefore + 2);
  });
});
