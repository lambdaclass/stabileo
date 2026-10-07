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
    // The beam of the portal: the level member highest on screen, tapped at its middle. Read from
    // the model's own transform rather than a fraction of the canvas, which moves with the framing.
    const mid = await page.evaluate(() => {
      const s = window.__stabileo;
      let best: { x: number; y: number } | null = null;
      for (const id of s.elementIds()) {
        const e = s.entityData('element', id) as { nodeI: number; nodeJ: number };
        const a = s.nodeScreenPos(e.nodeI), b = s.nodeScreenPos(e.nodeJ);
        if (!a || !b || Math.abs(a.y - b.y) > 2) continue;
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (!best || m.y < best.y) best = m;
      }
      return best;
    });
    expect(mid, 'the beam is on screen').not.toBeNull();
    await page.touchscreen.tap(mid!.x, mid!.y);
    await expect(page.getByTestId('selection-delete')).toBeVisible();
    // Over the model's lower right corner, and no row above the model: the
    // drawing does not move when something is selected.
    const del = (await page.getByTestId('selection-delete').boundingBox())!;
    const canvasNow = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
    expect(canvasNow.y).toBeCloseTo(box.y, 0);
    expect(canvasNow.height).toBeCloseTo(box.height, 0);
    expect(del.x + del.width).toBeGreaterThan(canvasNow.x + canvasNow.width - 60);
    expect(del.y + del.height).toBeGreaterThan(canvasNow.y + canvasNow.height - 70);
    await expect(page.getByTestId('tool-options-bar')).toHaveCount(0);

    await page.getByTestId('selection-delete').tap();
    await expect(page.getByTestId('selection-delete-confirm')).toBeVisible();
    await page.getByTestId('selection-delete-go').tap();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(before - 1);
    await expect(page.getByTestId('selection-delete')).toHaveCount(0);

    await page.getByRole('button', { name: /Deshacer|Undo|Desfazer/ }).first().tap();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(before);
  });

  test('the delete button rises with the sheet', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/app/basic?e2e=1');
    await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('rb-cmd-model').tap();
    await expect(page.getByTestId('dt-tab-nodes')).toBeVisible();
    // Select a member (as the tables do), with the sheet open.
    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    await page.evaluate((id) => window.__stabileoActions.selectElements([id]), ids[0]);
    const del = page.getByTestId('selection-delete');
    await expect(del).toBeVisible();
    const sheetTop = await page.evaluate(() => document.querySelector('[data-testid=dt-tab-nodes]')!.getBoundingClientRect().top);
    const b = (await del.boundingBox())!;
    expect(b.y + b.height).toBeLessThan(sheetTop);
  });
});
