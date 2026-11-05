/**
 * The public viewer: an example opened read-only, its views, and "Duplicate and edit" turning it
 * into an ordinary PRO tab. Nothing is autosaved while it is only being looked at.
 */
import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });

test('@smoke an example in the viewer, seen in plan and split, then duplicated to edit', async ({ page }) => {
  await page.goto('/app/pro?view&example=3d-portal-frame&e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
  const viewer = page.getByTestId('pro-viewer');
  await expect(viewer).toBeVisible();
  await expect(page.getByTestId('pro-ribbon')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount()), { timeout: 30_000 }).toBeGreaterThan(0);

  // Only looked at: the keyboard edits nothing, and there is no scope to edit across storeys.
  const before = await page.evaluate(() => window.__stabileo.elementIds().length);
  await page.evaluate(() => window.__stabileoActions.selectElements([1]));
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => window.__stabileo.elementIds().length)).toBe(before);
  await expect(page.getByTestId('storey-scope')).toHaveCount(0);

  // Nor does the mouse: no menu on a member, no quick edit.
  const ends = await page.evaluate(() => window.__stabileo.elementEnds(1));
  const [p, q] = await page.evaluate(([i, j]) => [window.__stabileo.nodeScreenPos(i), window.__stabileo.nodeScreenPos(j)], [ends!.i, ends!.j]);
  const mid = { x: (p!.x + q!.x) / 2, y: (p!.y + q!.y) / 2 };
  await page.mouse.click(mid.x, mid.y, { button: 'right' });
  await expect(page.locator('.ctx-menu')).toHaveCount(0);
  await page.mouse.dblclick(mid.x, mid.y);
  await expect(page.getByTestId('quick-edit')).toHaveCount(0);
  expect(await page.evaluate(() => window.__stabileo.elementIds().length)).toBe(before);

  await page.getByTestId('viewer-mode-plan').click();
  await expect(page.getByTestId('viewer-mode-plan')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('split-view')).toHaveCount(0);
  await page.getByTestId('viewer-mode-split').click();
  await expect(page.getByTestId('split-view')).toBeVisible();
  await page.getByTestId('viewer-mode-3d').click();
  await expect(page.getByTestId('viewer-mode-plan')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('split-view')).toHaveCount(0);

  await page.getByTestId('viewer-gallery').click();
  await expect(page.getByTestId('viewer-gallery-list')).toBeVisible();
  await page.getByTestId('viewer-gallery').click();

  expect(await page.evaluate(() => window.__stabileoActions.autosaveNow())).toBeNull();
  expect(await page.evaluate(() => window.__stabileo.autosaveOutcome())).toBeNull();

  await page.getByTestId('viewer-duplicate').click();
  await expect(viewer).toHaveCount(0);
  await expect(page.getByTestId('pro-ribbon')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/pro$/);
});

test('@smoke the Project tab lists the videos beside the examples, and offers the read-only link', async ({ page }) => {
  await page.goto('/app/pro?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
  await page.getByTestId('pr-project').click();
  await page.getByTestId('pp-videos').click();
  await expect(page.getByTestId('pp-video-list').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('pro-videos-offer')).toHaveCount(0);
  await expect(page.getByTestId('pp-share-viewer')).toBeVisible();
});

for (const [label, width, height] of [['phone', 390, 844], ['tablet', 820, 1180]] as const) {
  test.describe(`@smoke the viewer on a ${label}`, () => {
    test.use({ viewport: { width, height } });

    test('its bar never covers the model or the gallery, and fits the screen', async ({ page }) => {
      await page.goto('/app/pro?view&example=3d-portal-frame&e2e=1');
      await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
      const bar = page.getByTestId('pro-viewer');
      await expect(bar).toBeVisible();
      if (width < 768) {
        await expect(page.getByTestId('viewer-mode-split')).toHaveCount(0);
        await page.getByTestId('viewer-mode-plan').click();
      } else {
        await page.getByTestId('viewer-mode-split').click();
        await expect(page.getByTestId('split-view')).toBeVisible();
      }
      const barBox = (await bar.boundingBox())!;
      const body = (await page.locator('.viewer-mode .app-body').boundingBox())!;
      expect(body.y).toBeGreaterThanOrEqual(barBox.y + barBox.height - 0.5);
      expect(body.y + body.height).toBeLessThanOrEqual(height + 0.5);
      expect(barBox.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      for (const id of ['viewer-mode-3d', 'viewer-gallery', 'viewer-duplicate']) {
        const b = (await page.getByTestId(id).boundingBox())!;
        expect(b.x + b.width, id).toBeLessThanOrEqual(width);
        expect(b.height, id).toBeGreaterThanOrEqual(32);
      }
      await page.getByTestId('viewer-gallery').click();
      const list = (await page.getByTestId('viewer-gallery-list').boundingBox())!;
      expect(list.y).toBeGreaterThanOrEqual(barBox.y + barBox.height - 0.5);
      expect(list.y + list.height).toBeLessThanOrEqual(height + 0.5);
    });
  });
}
