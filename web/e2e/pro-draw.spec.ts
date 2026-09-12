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
    const draw = page.getByTestId('pr-cmd-nodes');
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
    const draw = page.getByTestId('pr-cmd-elements');
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

  test('one command gives you the table AND the tool', async ({ pro: page }) => {
    /*
     * These were briefly two groups — Draw with the pointer tools, Tables with
     * the grids — and that split one job into two places. The professional
     * flow is not a choice between them: type the nodes with their
     * coordinates in the panel, then click those nodes to lay members on
     * them. Both halves of that sentence are "Nodes".
     */
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();

    await expect(page.getByTestId('pro-panel-title'), 'the table is showing').toBeVisible();
    expect(await page.evaluate(() => window.__stabileo.currentTool()),
      'and the tool is armed').toBe('node');
  });

  test('a command with no tool of its own returns the pointer to Select', async ({ pro: page }) => {
    /* Otherwise a reader who went to Materials to change a section would
       still be holding the node tool, and the next click on the model would
       leave a node behind. */
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    expect(await page.evaluate(() => window.__stabileo.currentTool())).toBe('node');

    await page.getByTestId('pr-cmd-materials').click();
    expect(await page.evaluate(() => window.__stabileo.currentTool())).toBe('select');
  });
});
