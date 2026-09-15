import { test, expect } from './fixtures';

/**
 * Tools above, the shared table below — the shape every modelling panel has.
 *
 * PRO drew its own tables: two in the shells panel (one of triangles, one of
 * quads) and another for constraints. That is a second and third set of
 * columns over the same rows, in a mode that already had Basic's table sitting
 * in the codebase. Plates and constraints are the two entities Basic never
 * needed, so they were added to the shared one rather than kept apart.
 *
 * Pinned, because the ribbon has already chosen which entity you are working
 * on: a second row of tabs in the panel would be a second answer to a settled
 * question, and the two could disagree.
 */
test.describe('@smoke PRO — one table, under the tools', () => {
  test('the shells panel lists plates and quads in the shared table', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-shells').click();

    const table = page.locator('.data-table');
    await expect(table, 'the shared table is here').toHaveCount(1);
    await expect(table.locator('.tabs'), 'and it shows no tab strip').toHaveCount(0);
  });

  test('the constraints panel does the same', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-constraints').click();
    await expect(page.locator('.data-table')).toHaveCount(1);
    await expect(page.locator('.data-table .tabs')).toHaveCount(0);
  });

  test('a plate drawn from the tools appears in the table under them', async ({ pro: page }) => {
    /* The point of putting them in one panel: what you just made shows up
       where the model is listed, without going anywhere. */
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    await page.getByTestId('draw-node').click();

    const canvas = page.locator('canvas:not(.axis-gizmo)').first();
    const box = (await canvas.boundingBox())!;
    for (const [fx, fy] of [[0.3, 0.4], [0.6, 0.4], [0.6, 0.62]] as const) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    }
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(3);

    await page.getByTestId('pr-cmd-shells').click();
    for (let i = 0; i < 3; i++) await page.getByTestId(`shell-node-${i}`).fill(String(i + 1));
    await page.getByTestId('shell-add').click();

    /* Three corners made a triangle — the table says so in its own row. */
    await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.data-table tbody tr').first()).toContainText('3');
  });
});
