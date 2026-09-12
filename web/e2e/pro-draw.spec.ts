import { test, expect, loadModel } from './fixtures';

/**
 * Drawing in PRO.
 *
 * The viewport has placed a node at the pointer and built a member from two
 * clicks since 3-D existed; Basic's ribbon has armed those tools all along.
 * PRO's ribbon set `currentTool` to exactly two values — `select` and `pan` —
 * so the whole of drawing was unreachable from this mode, and the only way to
 * add a member to an imported frame was to find two node ids in a table and
 * type them.
 *
 * Nothing new is implemented here; what is asserted is that PRO can now reach
 * what was already built, which is why these press the ribbon rather than the
 * store.
 */
test.describe('@smoke PRO — drawing geometry with the pointer', () => {
  test('the Node command arms the node tool and a click adds a node', async ({ pro: page }) => {
    const before = await page.evaluate(() => window.__stabileo.nodeCount());

    await page.getByTestId('pr-stage-model').click();
    const draw = page.getByTestId('pr-cmd-draw-node');
    await expect(draw, 'PRO has a Node command at all').toBeVisible();
    await draw.click();
    await expect(draw, 'and it lights while the tool is armed').toHaveClass(/active/);

    const canvas = page.locator('canvas:not(.axis-gizmo)').first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.55);

    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(before + 1);
  });

  test('the Member command joins two nodes of a loaded model', async ({ pro: page }) => {
    /*
     * On an imported structure, because that is the case this unlocks: adding
     * one brace to a frame that arrived from a DXF used to mean finding two
     * node ids in a table and typing them.
     *
     * Framed first. A member is built by HITTING the nodes, and PRO's grid
     * opens a kilometre wide — nodes a few metres apart are sub-pixel in that
     * view, so the ray misses and the test would be measuring the camera.
     */
    await loadModel(page, 'mat-foundation');
    await page.getByTestId('cam-menu').click();
    await page.locator('.cam-menu .cam-item').first().click();
    await page.waitForTimeout(600);

    const before = await page.evaluate(() => window.__stabileo.elementIds().length);
    await page.getByTestId('pr-stage-model').click();
    const draw = page.getByTestId('pr-cmd-draw-member');
    await draw.click();
    await expect(draw).toHaveClass(/active/);

    /* Through the 3-D camera: `nodeScreenPos` used to answer with the 2D
       canvas transform, which in 3D is a confident wrong number. */
    for (const id of [5, 9]) {
      const p = await page.evaluate((n) => window.__stabileo.nodeScreenPos(n), id);
      expect(p, `node ${id} projects onto the screen`).toBeTruthy();
      await page.mouse.click(p!.x, p!.y);
    }

    await expect
      .poll(() => page.evaluate(() => window.__stabileo.elementIds().length))
      .toBe(before + 1);
  });

  test('drawing does not cover the model with a table', async ({ pro: page }) => {
    /* The panel is where you read a model and the viewport is where you draw
       one. A command that arms the pointer and then opens a table has put the
       reader's attention on the wrong half of the screen. */
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    await expect(page.getByTestId('pro-panel-title')).toBeVisible();
    const before = await page.getByTestId('pro-panel-title').textContent();

    await page.getByTestId('pr-cmd-draw-node').click();
    expect(await page.getByTestId('pro-panel-title').textContent()).toBe(before);
  });
});
