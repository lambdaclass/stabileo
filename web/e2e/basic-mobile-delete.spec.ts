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
    // The beam of the portal, at the middle of its span: where it is drawn, not
    // at a fixed fraction of the canvas, which moves with the framing. The
    // sheet that opens with the tool shortens the canvas and the model is
    // framed again into what is left.
    const beamOnScreen = () => page.evaluate(() => {
      const h = window.__stabileo;
      for (const id of h.elementIds()) {
        const ends = h.elementEnds(id);
        const a = ends && h.nodeScreenPos(ends.i), b = ends && h.nodeScreenPos(ends.j);
        if (a && b && Math.abs(a.y - b.y) < 1) return { x: (a.x + b.x) / 2, y: a.y };
      }
      return null;
    });
    // The fit for the taller canvas holds still for a while before the reframe
    // lands (a debounce), so no wait tells which position is final: tap where
    // the beam is now, and again where it is then, until it is selected.
    await expect.poll(async () => {
      const p = await beamOnScreen();
      if (!p || p.y <= box.y || p.y >= box.y + box.height) return 0;
      await page.touchscreen.tap(p.x, p.y);
      return page.getByTestId('selection-delete').count();
    }, { intervals: [400] }).toBeGreaterThan(0);
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
