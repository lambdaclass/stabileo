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
    await page.getByTestId('write-node').click();
    const add = async (x: number, y: number, z: number) => {
      await page.getByTestId('write-node-x').fill(String(x));
      await page.getByTestId('write-node-y').fill(String(y));
      await page.getByTestId('write-node-z').fill(String(z));
      await page.getByTestId('write-node-card-submit').click();
    };
    await add(-5, 0, 0);
    await add(0, 0, 5);
    await add(5, 0, 0);
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

  test('the curved option appears once there are four corners to curve', async ({ pro: page }) => {
    /* Three points are coplanar by definition, so a triangle is never a
       cáscara — the control is offered where it can mean something. */
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-shells').click();
    await page.getByTestId('write-plate').click();
    await page.getByTestId('write-corners-3').click();
    for (let i = 0; i < 3; i++) await page.getByTestId(`shell-node-${i}`).fill(String(i + 1));
    await expect(page.getByTestId('quad-curved')).toHaveCount(0);
    await page.getByTestId('write-corners-4').click();
    for (let i = 0; i < 4; i++) await page.getByTestId(`shell-node-${i}`).fill(String(i + 1));
    await expect(page.getByTestId('quad-curved')).toHaveCount(1);
  });

  test('an arc picked whole shows one local-axis triad, a segment picked alone its own', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    await page.getByTestId('write-node').click();
    const add = async (x: number, y: number, z: number) => {
      await page.getByTestId('write-node-x').fill(String(x));
      await page.getByTestId('write-node-y').fill(String(y));
      await page.getByTestId('write-node-z').fill(String(z));
      await page.getByTestId('write-node-card-submit').click();
    };
    await add(-5, 0, 0);
    await add(0, 0, 5);
    await add(5, 0, 0);
    await page.getByTestId('pr-cmd-elements').click();
    await page.getByTestId('pro-arc-toggle').click();
    await page.getByTestId('arc-start').fill('1');
    await page.getByTestId('arc-through').fill('2');
    await page.getByTestId('arc-end').fill('3');
    await page.getByTestId('arc-segments').fill('8');
    await page.getByTestId('arc-create').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(8);

    // A point on the second segment, between its two nodes on screen.
    const ids = await page.evaluate(() => window.__stabileo.elementIds());
    const ends = (await page.evaluate((id) => window.__stabileo.elementEnds(id), ids[1]!))!;
    const [a, b] = await Promise.all([ends.i, ends.j].map((n) => page.evaluate((x) => window.__stabileo.nodeScreenPos(x), n)));
    const at = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };

    await page.getByTestId('pr-select').click();
    await page.getByTestId('member-pick-piece').click();
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => page.evaluate(() => window.__stabileo.selection().length)).toBe(8);
    await expect.poll(() => page.evaluate(() => window.__stabileo.localAxesTriads())).toBe(1);

    await page.getByTestId('member-pick-segment').click();
    await page.mouse.click(10, 300);
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => page.evaluate(() => window.__stabileo.selection().length)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__stabileo.localAxesTriads())).toBe(1);
  });

  test('an arc keeps its load along the curve, its segments and its piece through save and open', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    await page.getByTestId('write-node').click();
    for (const [x, z] of [[-5, 0], [0, 5], [5, 0]] as const) {
      await page.getByTestId('write-node-x').fill(String(x));
      await page.getByTestId('write-node-y').fill('0');
      await page.getByTestId('write-node-z').fill(String(z));
      await page.getByTestId('write-node-card-submit').click();
    }
    await page.getByTestId('pr-cmd-elements').click();
    await page.getByTestId('pro-arc-toggle').click();
    await page.getByTestId('arc-start').fill('1');
    await page.getByTestId('arc-through').fill('2');
    await page.getByTestId('arc-end').fill('3');
    await page.getByTestId('arc-segments').fill('8');
    await page.getByTestId('arc-create').click();
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(8);

    // The whole piece selected, its panel open: a load of 2 kN/m along the arc, downward.
    await page.evaluate(() => window.__stabileoActions.selectElements(window.__stabileo.elementIds()));
    const panel = page.getByTestId('piece-panel');
    await expect(panel).toBeVisible();
    await panel.getByTestId('piece-load-q').fill('2');
    await panel.getByTestId('piece-load-q').press('Tab');
    await panel.getByTestId('piece-load-add').click();
    await expect(panel.locator('.pc-row').filter({ hasText: '2' }).first()).toBeVisible();
    const before = await page.evaluate(() => window.__stabileo.modelCensus());

    const file = JSON.parse(await page.evaluate(() => window.__stabileo.serializeProject()));
    expect(await page.evaluate((f) => window.__stabileoActions.loadProject(f), file)).toBe(true);
    expect(await page.evaluate(() => window.__stabileo.modelCensus())).toEqual(before);

    await page.evaluate(() => window.__stabileoActions.selectElements(window.__stabileo.elementIds()));
    await expect(page.getByTestId('piece-panel')).toBeVisible();
    await expect(page.getByTestId('piece-segments')).toHaveValue('8');
    await expect(page.getByTestId('piece-panel').locator('.pc-row').filter({ hasText: /2/ }).first()).toBeVisible();
  });
});
