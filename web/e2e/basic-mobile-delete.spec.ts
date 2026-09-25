/**
 * Deleting on a phone, which has no Delete key.
 *
 * A selection could be made with a tap and never removed. The delete button
 * appears beside the selection read-out only while something is selected,
 * asks first — naming what it will take — and leaves the step undoable.
 */
import { test, expect } from './fixtures';

test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

test.describe('@smoke deleting on a phone', () => {
  test('select a member, confirm, it is gone — and undo brings it back', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.evaluate(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')));
    await expect(page.getByTestId('selection-delete')).toHaveCount(0);

    await page.getByTestId('rb-cmd-select').tap();
    const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    const before = await page.evaluate(() => window.__stabileo.elementIds().length);
    // The beam of the portal, at the top of the framed model.
    for (const fy of [0.405, 0.39, 0.42, 0.37, 0.44]) {
      await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * fy);
      if (await page.getByTestId('selection-delete').count()) break;
    }
    await expect(page.getByTestId('selection-delete')).toBeVisible();

    await page.getByTestId('selection-delete').tap();
    await expect(page.getByTestId('selection-delete-confirm')).toBeVisible();
    await page.getByTestId('selection-delete-go').tap();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(before - 1);
    await expect(page.getByTestId('selection-delete')).toHaveCount(0);

    await page.getByRole('button', { name: /Deshacer|Undo|Desfazer/ }).first().tap();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(before);
  });
});
