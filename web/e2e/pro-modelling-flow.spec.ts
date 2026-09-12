import { test, expect } from './fixtures';

/**
 * The flow a professional program is used with, start to finish.
 *
 * Type the nodes with their coordinates in the panel, then click those nodes
 * to lay members and supports on them, then solve. Clicking coordinates onto
 * the canvas is awkward and nobody does it for a real structure; the panel is
 * where geometry is entered and the viewport is where it is connected.
 *
 * This exists because both halves used to be in different ribbon groups, as
 * if they were alternatives — and because the only thing worse than a flow
 * nobody can find is one that breaks halfway through, after the reader has
 * typed twenty coordinates.
 */
const N = [
  [0, 0, 0], [4, 0, 0], [4, 0, 3], [0, 0, 3],
] as const;

test.describe('@smoke PRO — the modelling flow, coordinates first', () => {
  test('type four nodes, connect them, hold them down, and solve', async ({ pro: page }) => {
    test.setTimeout(180_000);

    // ── 1. Nodes, by coordinate, in the panel ───────────────────────
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    for (const [x, y, z] of N) {
      await page.getByTestId('pro-add-node').click();
      const row = page.locator('.pro-nodes-table tbody tr').last();
      await row.locator('input[data-col="x"]').fill(String(x));
      await row.locator('input[data-col="y"]').fill(String(y));
      await row.locator('input[data-col="z"]').fill(String(z));
      await row.locator('input[data-col="z"]').blur();
    }
    await page.getByTestId('pro-apply-nodes').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(4);

    // ── 2. Members, by clicking those nodes ─────────────────────────
    await page.getByTestId('pr-cmd-elements').click();
    expect(await page.evaluate(() => window.__stabileo.currentTool()),
      'the member tool comes with its table').toBe('element');

    await page.getByTestId('cam-menu').click();
    await page.locator('.cam-menu .cam-item').first().click();
    await page.waitForTimeout(500);

    const click = async (id: number) => {
      const p = await page.evaluate((n) => window.__stabileo.nodeScreenPos(n), id);
      expect(p, `node ${id} is on screen`).toBeTruthy();
      await page.mouse.click(p!.x, p!.y);
    };
    /* A portal: column, beam, column. */
    for (const [a, b] of [[1, 4], [4, 3], [3, 2]] as const) {
      await click(a);
      await click(b);
    }
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.elementIds().length))
      .toBe(3);

    // ── 3. Supports, on the two feet ────────────────────────────────
    await page.getByTestId('pr-cmd-supports').click();
    expect(await page.evaluate(() => window.__stabileo.currentTool()),
      'and the support tool with its own').toBe('support');
    for (const id of [1, 2]) await click(id);
    await expect.poll(() => page.evaluate(() => window.__stabileo.supportCount())).toBe(2);

    // ── 4. It solves ────────────────────────────────────────────────
    /* Nothing here has left the model in a state the analysis refuses, which
       is the half of "intuitive" that a screenshot cannot show. */
    await page.getByTestId('pr-stage-analyse').click();
    await expect(page.getByTestId('pr-cmd-solve')).toBeEnabled();
  });

  test('moving between tables never leaves a tool armed behind you', async ({ pro: page }) => {
    /* The failure this prevents: going to Materials to change a section and
       leaving a node behind on the next click in the model. */
    await page.getByTestId('pr-stage-model').click();
    for (const [cmd, tool] of [
      ['nodes', 'node'], ['elements', 'element'], ['supports', 'support'],
      ['loads', 'load'], ['materials', 'select'], ['sections', 'select'],
      ['shells', 'select'], ['constraints', 'select'],
    ] as const) {
      await page.getByTestId(`pr-cmd-${cmd}`).click();
      expect(await page.evaluate(() => window.__stabileo.currentTool()), cmd).toBe(tool);
    }
  });
});
