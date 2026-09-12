/**
 * Moving things, and the two buttons that sit over the model.
 *
 * ── Why Move is a ribbon command again ─────────────────────────────
 *
 * Pan and Select were taken OUT of the ribbon deliberately: every other
 * command there opens a panel, so the highlight means "this is what the panel
 * is showing", and a pointer mode shows nothing — after a solve, a lit
 * diagram and a lit Select both claimed to be the current activity.
 *
 * This command does open a panel, so the rule holds, and the panel earns its
 * place: a drag can move the VIEW or it can move the MODEL. The second used
 * to live inside the Node tool's create-mode, where the same gesture placed a
 * new node whenever the press missed an existing one. That is the behaviour
 * these tests pin: in `moveNodes`, a drag that starts off a node does nothing
 * at all.
 */

import { test, expect, type Page } from '@playwright/test';
import { loadModel } from './fixtures';

async function openBasic(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stabileo-lang', 'es');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  });
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
}

test.describe('@smoke moving the view and moving the model', () => {
  test('Move sits to the left of Select and opens its panel', async ({ page }) => {
    await openBasic(page);

    const move = await page.getByTestId('rb-cmd-move').boundingBox();
    const select = await page.getByTestId('rb-cmd-select').boundingBox();
    expect(move!.x, 'Move is the left of the pair').toBeLessThan(select!.x);

    await page.getByTestId('rb-cmd-move').click();
    await expect(page.getByTestId('move-panel')).toBeVisible();
    await expect(page.getByTestId('move-view')).toBeVisible();
    await expect(page.getByTestId('move-nodes')).toBeVisible();
  });

  test('clicking Move or Selection arms the pointer, not just the panel', async ({ page }) => {
    await openBasic(page);

    /*
     * The report: picking Move showed a panel offering to move the view, and
     * dragging panned nothing, because the pointer was still on whatever it
     * had been. A control that describes a mode has to put you in it.
     */
    await page.getByTestId('rb-cmd-select').click();
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.currentTool()))
      .toBe('select');

    await page.getByTestId('rb-cmd-move').click();
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.currentTool()))
      .toBe('pan');

    /*
     * And coming BACK to Move keeps the mode its own panel is showing —
     * dropping a reader who chose "mover nodos" back into panning would undo
     * their choice every time they reopened the panel.
     */
    await page.getByTestId('move-nodes').click();
    await page.getByTestId('rb-cmd-select').click();
    await page.getByTestId('rb-cmd-move').click();
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.currentTool()))
      .toBe('moveNodes');
  });

  test('moving a node carries its members and creates nothing', async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');

    await page.getByTestId('rb-cmd-move').click();
    await page.getByTestId('move-nodes').click();
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.currentTool()))
      .toBe('moveNodes');

    const before = await page.evaluate(() => window.__stabileo.nodeScreenPos(2));
    const nodesBefore = await page.evaluate(() => window.__stabileo.nodeCount());
    const elementsBefore = await page.evaluate(() => window.__stabileo.elementIds().length);

    await page.mouse.move(before!.x, before!.y);
    await page.mouse.down();
    await page.mouse.move(before!.x + 60, before!.y - 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => window.__stabileo.nodeScreenPos(2));
    expect(Math.abs(after!.x - before!.x), 'the node moved').toBeGreaterThan(5);

    /*
     * Members are stored by node ID, so a node that moves takes its bars with
     * it. The count is what proves nothing was relinked or dropped.
     */
    expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(nodesBefore);
    expect(await page.evaluate(() => window.__stabileo.elementIds().length))
      .toBe(elementsBefore);
  });

  test('a drag that starts off a node does nothing', async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');

    await page.getByTestId('rb-cmd-move').click();
    await page.getByTestId('move-nodes').click();

    const anchor = await page.evaluate(() => window.__stabileo.nodeScreenPos(2));
    const nodesBefore = await page.evaluate(() => window.__stabileo.nodeCount());

    /*
     * The defect this mode exists to remove: in the Node tool the same press
     * would have placed a node here.
     */
    await page.mouse.move(anchor!.x + 240, anchor!.y + 160);
    await page.mouse.down();
    await page.mouse.move(anchor!.x + 300, anchor!.y + 200, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(nodesBefore);
  });

  test('moving the view leaves the model where it was', async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');

    await page.getByTestId('rb-cmd-move').click();
    await page.getByTestId('move-view').click();
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.currentTool()))
      .toBe('pan');

    const nodesBefore = await page.evaluate(() => window.__stabileo.nodeCount());
    const anchor = await page.evaluate(() => window.__stabileo.nodeScreenPos(2));

    await page.mouse.move(anchor!.x, anchor!.y);
    await page.mouse.down();
    await page.mouse.move(anchor!.x + 90, anchor!.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    /*
     * The node's SCREEN position follows the pan; what must not change is the
     * model — same nodes, and the same count.
     */
    expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(nodesBefore);
  });
});

test.describe('@smoke the two controls over a 3D model', () => {
  async function go3D(page: Page) {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');
    await page.getByTestId('rb-cmd-dim').click();
    await page.waitForTimeout(2500);
  }

  test('there are two, not nine', async ({ page }) => {
    await go3D(page);
    /*
     * The stack had grown to nine permanently-visible buttons down the side
     * of the only thing the reader came to look at. What stays is the pointer
     * mode, which changes moment to moment; everything about HOW the model is
     * shown went behind one cube.
     */
    const count = await page.locator('.camera-controls button').count();
    expect(count, 'the pointer mode and the view menu').toBe(2);
  });

  test('the cube opens the view options and a view closes it', async ({ page }) => {
    await go3D(page);

    await page.getByTestId('cam-menu').click();
    const menu = page.getByTestId('cam-menu-pop');
    await expect(menu).toBeVisible();
    /* Fit, three axis views, projection, clipping, measure, sections. */
    expect(await menu.locator('.cam-item').count()).toBeGreaterThanOrEqual(8);

    await menu.locator('.cam-item').first().click();
    await expect(menu, 'picking a view is done once, so the menu closes')
      .toHaveCount(0);
  });

  test('a state stays open, because the next choice is usually next door', async ({ page }) => {
    await go3D(page);
    await page.getByTestId('cam-menu').click();

    const clipping = page.getByTestId('cam-menu-pop').locator('.cam-item', {
      hasText: /corte|clipping/i,
    }).first();
    await clipping.click();
    await expect(page.getByTestId('cam-menu-pop')).toBeVisible();
  });

  test('the controls are dressed from the tokens, not the old palette', async ({ page }) => {
    await go3D(page);
    /*
     * These were written against a palette this application no longer uses —
     * #445 borders over rgba(22, 33, 62) — so the camera stack stayed the
     * colour of the old interface while everything around it moved on. The
     * assertion is that the border is NOT that value; which token it lands on
     * is the stylesheet's business.
     */
    const border = await page.getByTestId('cam-menu')
      .evaluate((n) => getComputedStyle(n).borderColor);
    expect(border).not.toBe('rgb(68, 68, 85)');
  });
});
