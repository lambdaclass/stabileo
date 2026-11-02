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

  await page.getByTestId('viewer-mode-split').click();
  await expect(page.getByTestId('split-view')).toBeVisible();
  await page.getByTestId('viewer-mode-3d').click();
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
