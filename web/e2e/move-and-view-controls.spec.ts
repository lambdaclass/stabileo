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
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 45_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 45_000 })
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
    await page.getByTestId('ws-space').click();
    await page.waitForTimeout(2500);
  }

  test('the view dock holds four, not nine', async ({ page }) => {
    await go3D(page);
    const dock = page.locator('.camera-controls');
    await expect(dock).toHaveClass(/view-dock/);
    const count = await dock.locator('button').count();
    expect(count, 'the pointer mode, fit, home view and the view menu').toBe(4);
    const box = (await dock.boundingBox())!;
    const vp = (await page.locator('.viewport-container').boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - (vp.x + vp.width / 2)), 'centred under the model').toBeLessThan(4);
    expect(vp.y + vp.height - (box.y + box.height), 'at the foot of the viewport').toBeLessThan(40);
  });

  test('the cube opens the view options and a view closes it', async ({ page }) => {
    await go3D(page);

    await page.getByTestId('cam-menu').click();
    const menu = page.getByTestId('cam-menu-pop');
    await expect(menu).toBeVisible();
    /* Fit, three axis views, plan view, clipping, measure, the build animation. */
    expect(await menu.locator('.cam-item').count()).toBeGreaterThanOrEqual(8);

    await menu.locator('.cam-item').first().click();
    await expect(menu, 'picking a view is done once, so the menu closes')
      .toHaveCount(0);
  });

  test('the bars are drawn as lines or with their sections, one choice of two', async ({ page }) => {
    await go3D(page);
    await page.getByTestId('cam-menu').click();
    const menu = page.getByTestId('cam-menu-pop');
    await expect(menu.getByTestId('cam-bars-lines')).toBeVisible();
    await expect(menu.getByText(/physical geometry|geometr[ií]a f[ií]sica|thick bar|barras gruesas/i)).toHaveCount(0);
    await menu.getByTestId('cam-bars-sections').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.renderMode3D())).toBe('sections');
    await expect(menu.getByTestId('cam-bars-sections')).toHaveAttribute('aria-checked', 'true');
    await expect(menu.getByTestId('cam-bars-lines')).toHaveAttribute('aria-checked', 'false');
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

  test('the menu backdrop paints nothing', async ({ page }) => {
    await go3D(page);
    await page.getByTestId('cam-menu').click();
    await expect(page.getByTestId('cam-menu-pop')).toBeVisible();

    /*
     * The backdrop that closes the menu is a full-screen BUTTON inside
     * `.camera-controls`, and a leftover `:hover` rule from the old stack
     * still matched it — so moving the pointer off the menu painted
     * rgba(40, 60, 100, 0.95) over the entire application and the whole
     * model went blue.
     */
    await page.mouse.move(400, 500);
    await page.waitForTimeout(300);
    const bg = await page.locator('.cam-backdrop')
      .evaluate((n) => getComputedStyle(n).backgroundColor);
    expect(bg, 'a backdrop that closes must not also paint').toBe('rgba(0, 0, 0, 0)');
  });

  test('a plan view keeps the world’s up axis', async ({ page }) => {
    await go3D(page);

    const before = await page.evaluate(() => window.__stabileo.cameraState());
    expect(before!.up.map(Math.round)).toEqual([0, 0, 1]);

    await page.getByTestId('cam-menu').click();
    await page.getByTestId('cam-menu-pop').locator('.cam-item', { hasText: /superior|top/i })
      .first().click();
    await page.waitForTimeout(600);

    /*
     * The plan used to swap `camera.up` to Y, because a camera looking
     * straight down cannot use the vertical as up. True — and it did not do
     * what it looked like it did: OrbitControls derives its orbit axis from
     * `object.up` ONCE, in its constructor, so the assignment changed how the
     * camera was oriented and nothing about how dragging rotates. Screen-up
     * and orbit axis disagreed, and the first drag rolled the model over.
     */
    const plan = await page.evaluate(() => window.__stabileo.cameraState());
    expect(plan!.up.map(Math.round), 'still Z-up').toEqual([0, 0, 1]);

    /*
     * And it stops just short of straight down. Exactly at the pole the
     * azimuth is undefined, which is what made the first drag spin.
     */
    expect(plan!.polarDeg, 'looking down').toBeLessThan(5);
    expect(plan!.polarDeg, 'but not from the pole itself').toBeGreaterThan(0.2);
  });

  test('in the plan view the floor follows the drag and stops with it', async ({ page }) => {
    await go3D(page);
    await page.getByTestId('cam-menu').click();
    await page.getByTestId('nav-plan-view').click();
    const box = (await page.locator('canvas').first().boundingBox())!;
    await page.mouse.click(box.x + 30, box.y + box.height - 30);
    await expect(page.getByTestId('cam-menu-pop')).toHaveCount(0);
    await page.waitForTimeout(600);

    const start = await page.evaluate(() => window.__stabileo.cameraState());
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    const released = await page.evaluate(() => window.__stabileo.cameraState());
    await page.waitForTimeout(600);
    const later = await page.evaluate(() => window.__stabileo.cameraState());

    expect(Math.hypot(released!.target[0] - start!.target[0], released!.target[1] - start!.target[1]), 'the drag slid the view').toBeGreaterThan(0.1);
    expect(released!.target[2], 'over the floor, not up or down').toBeCloseTo(start!.target[2], 6);
    expect(later!.target, 'and it stopped where the pointer stopped').toEqual(released!.target);
    expect(later!.polarDeg, 'still from above').toBeLessThan(5);
  });

  test('orbiting from a plan view rotates about the same axis as anywhere else',
    async ({ page }) => {
      await go3D(page);
      await page.getByTestId('cam-menu').click();
      await page.getByTestId('cam-menu-pop').locator('.cam-item', { hasText: /superior|top/i })
        .first().click();
      await page.waitForTimeout(600);

      const box = (await page.locator('canvas').first().boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 - 50, { steps: 14 });
      await page.mouse.up();
      await page.waitForTimeout(600);

      const after = await page.evaluate(() => window.__stabileo.cameraState());
      expect(after!.up.map(Math.round), 'the axis did not change under the drag')
        .toEqual([0, 0, 1]);
      expect(after!.polarDeg, 'and the drag actually moved the camera')
        .toBeGreaterThan(5);
    });
});
