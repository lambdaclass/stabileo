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
    await page.getByTestId('write-node').click();
    for (const [x, y, z] of N) {
      await page.getByTestId('write-node-x').fill(String(x));
      await page.getByTestId('write-node-y').fill(String(y));
      await page.getByTestId('write-node-z').fill(String(z));
      await page.getByTestId('write-node-card-submit').click();
    }
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(4);

    // ── 2. Members, by clicking those nodes ─────────────────────────
    await page.getByTestId('pr-cmd-elements').click();
    /* The ribbon opens the table; the panel arms the tool. */
    await page.getByTestId('draw-element').click();
    expect(await page.evaluate(() => window.__stabileo.currentTool())).toBe('element');

    await page.getByTestId('cam-menu').click();
    await page.locator('.cam-menu .cam-item').first().click();
    await page.waitForTimeout(500);

    /* The drawing bar changes height with the tool (a member's has more to say than a
       support's), and the viewport follows it a frame later: read the node where it has
       settled, not where it was mid-resize. */
    const click = async (id: number) => {
      const at = () => page.evaluate((n) => window.__stabileo.nodeScreenPos(n), id);
      let p = await at();
      for (let k = 0; k < 20; k++) {
        await page.waitForTimeout(50);
        const q = await at();
        if (p && q && Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5) break;
        p = q;
      }
      expect(p, `node ${id} is on screen`).toBeTruthy();
      await page.mouse.click(p!.x, p!.y);
    };
    /*
     * One continuous chain: 1 → 4 → 3 → 2, which is a portal drawn the way a
     * reader draws one. The tool CHAINS — after closing a member it takes the
     * next click as the start of the following one — so clicking the pairs
     * (1,4) (4,3) (3,2) would place five members, not three. That is the
     * right behaviour for drawing a polyline and the wrong way to write this.
     */
    for (const id of [1, 4, 3, 2] as const) await click(id);
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.elementIds().length))
      .toBe(3);

    // ── 3. Supports, on the two feet ────────────────────────────────
    await page.getByTestId('pr-cmd-supports').click();
    await page.getByTestId('write-support').click();
    await page.getByTestId('load-target-by').selectOption('ids');
    await page.getByTestId('load-target-ids').fill('1, 2');
    await expect(page.getByTestId('load-target-count')).toContainText('2');
    await page.getByTestId('write-support-card-submit').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.supportCount())).toBe(2);

    // ── 4. It solves ────────────────────────────────────────────────
    /* Nothing here has left the model in a state the analysis refuses, which
       is the half of "intuitive" that a screenshot cannot show. */
    await page.getByTestId('pr-stage-analyse').click();
    await expect(page.getByTestId('pr-cmd-solve')).toBeEnabled();
  });

  test('moving between tables never leaves a tool armed behind you', async ({ pro: page }) => {
    /*
     * Going to Materials to change a section used to leave a node behind on
     * the next click in the model. A ribbon command opens a panel and arms
     * nothing now, so the pointer only leaves Select when the reader says so
     * — and going anywhere else brings it back.
     */
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    await page.getByTestId('draw-node').click();
    expect(await page.evaluate(() => window.__stabileo.currentTool())).toBe('node');

    for (const cmd of ['materials', 'sections', 'specifications', 'elements'] as const) {
      await page.getByTestId(`pr-cmd-${cmd}`).click();
      expect(await page.evaluate(() => window.__stabileo.currentTool()), cmd).toBe('select');
    }
  });
});
