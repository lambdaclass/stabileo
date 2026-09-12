import { test, expect } from './fixtures';

/**
 * Curved members and curved shells, which PRO could not draw.
 *
 * ── The two different findings behind this ─────────────────────────
 *
 * A CURVED SHELL was fully supported and had no control. The model has
 * carried `curved` since shells existed and the solver reads it — a curved
 * quad goes to the engine as a degenerated continuum rather than a flat
 * MITC4 — and the only way to set the flag was to import a spreadsheet.
 *
 * A CURVED MEMBER did not exist at all: no arc, no curve, nothing in the
 * model or the types. The solver has straight frame elements and no curved
 * beam, so the arc is MATERIALISED as a chain of them, which is what every
 * commercial package does and what lets diagrams, verification and detailing
 * keep working unchanged.
 */
test.describe('@smoke PRO — curved geometry', () => {
  test('an arc through three nodes becomes members that lie ON the curve', async ({ pro: page }) => {
    /* A half-circle of radius 5 in the XZ plane: springing at (±5, 0, 0) and
       over the top at (0, 0, 5), which is an arch. */
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();

    // Three nodes by coordinate — the flow this panel exists for.
    const add = async (x: number, y: number, z: number) => {
      await page.getByTestId('pro-add-node').click();
      const row = page.locator('.pro-nodes-table tbody tr').last();
      await row.locator('input[data-col="x"]').fill(String(x));
      await row.locator('input[data-col="y"]').fill(String(y));
      await row.locator('input[data-col="z"]').fill(String(z));
      await row.locator('input[data-col="z"]').blur();
    };
    await add(-5, 0, 0);
    await add(0, 0, 5);
    await add(5, 0, 0);
    await page.getByTestId('pro-apply-nodes').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(3);

    await page.getByTestId('pr-cmd-elements').click();
    await page.getByTestId('pro-arc-toggle').click();
    await page.getByTestId('arc-start').fill('1');
    await page.getByTestId('arc-through').fill('2');
    await page.getByTestId('arc-end').fill('3');
    await page.getByTestId('arc-segments').fill('8');

    /* The panel states the geometry AND how far the chain falls inside the
       arc, so "is eight enough" is a number rather than a feeling. */
    await expect(page.getByTestId('arc-note')).toContainText('R = 5.000');

    await page.getByTestId('arc-create').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(8);

    /*
     * Nine nodes, not ten. The arc passes THROUGH the middle point by
     * construction, so eight segments put a generated point exactly on the
     * node that defined it — and two nodes in one place analyse as two
     * nodes: the arch would be cut at its crown, the solve would succeed,
     * and nothing on screen would say so. The crown node is reused.
     */
    expect(await page.evaluate(() => window.__stabileo.nodeCount()),
      'three picked, six made, and the crown reused rather than doubled').toBe(9);
  });

  test('a quad out of plane is offered the curved shell it needs', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-shells').click();
    await expect(page.getByTestId('quad-curved'), 'the control exists at all').toHaveCount(1);
  });
});
