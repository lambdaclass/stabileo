import { test, expect } from './fixtures';

/**
 * What the top bar says, and where a drawing mode is entered.
 *
 * ── The three things this pins ─────────────────────────────────────
 *
 *  · Exactly one command in the bar is lit, and it is the panel on screen.
 *    Select and Pan used to sit there as well, and the pointer is always in
 *    SOME mode — so Move looked switched on forever while the panel showed
 *    something else entirely.
 *
 *  · A command opens its panel and does NOT arm a tool. It used to do both,
 *    which meant opening the Nodes table to read a coordinate left the next
 *    click on the model placing a node.
 *
 *  · The panel carries the button that arms it, and a second press disarms.
 */
test.describe('@smoke PRO — one lit button, and drawing from the panel', () => {
  test('the pointer modes are not in the top bar at all', async ({ pro: page }) => {
    await expect(page.getByTestId('pr-select'), 'Select is the panel now').toHaveCount(0);
    await expect(page.getByTestId('pr-pan'), 'Pan lives on the model').toHaveCount(0);
  });

  test('what a selection picks up is a panel, like Basic', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-selection').click();
    await expect(page.locator('.sel-panel')).toBeVisible();
    /* Shells are offered here and not in Basic: PRO is where plates live. */
    await expect(page.locator('.sel-panel').getByText(/placas|plates|shells/i).first()).toBeVisible();
  });

  test('opening a table does not arm a tool', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    for (const cmd of ['nodes', 'elements', 'supports', 'loads', 'shells']) {
      await page.getByTestId(`pr-cmd-${cmd}`).click();
      expect(await page.evaluate(() => window.__stabileo.currentTool()), cmd).toBe('select');
    }
  });

  test('the panel arms it, and a second press puts it back', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();

    const draw = page.getByTestId('draw-node');
    await expect(draw).toBeVisible();
    await expect(draw).toHaveAttribute('aria-pressed', 'false');

    await draw.click();
    await expect(draw).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.__stabileo.currentTool())).toBe('node');

    await draw.click();
    expect(await page.evaluate(() => window.__stabileo.currentTool()),
      'a control that can only be switched on makes the reader hunt for the way out').toBe('select');
  });

  test('every drawing panel has one, naming what it draws', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    for (const [cmd, tid, tool] of [
      ['nodes', 'draw-node', 'node'],
      ['elements', 'draw-element', 'element'],
      ['supports', 'draw-support', 'support'],
      ['loads', 'draw-load', 'load'],
    ] as const) {
      await page.getByTestId(`pr-cmd-${cmd}`).click();
      await page.getByTestId(tid).click();
      expect(await page.evaluate(() => window.__stabileo.currentTool()), cmd).toBe(tool);
      await page.getByTestId(tid).click();
    }
  });
});

test.describe('@smoke PRO — plates are one creator', () => {
  test('three corners make a triangle and four make a quad, from one form', async ({ pro: page }) => {
    /*
     * There were two creators, "Plate (DKT triangle)" and "Quad (MITC4)".
     * Those are element FORMULATIONS, and a reader drawing a slab starts from
     * the corners — how many there are already decides which applies.
     */
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-shells').click();

    const add = page.getByTestId('shell-add');
    await expect(add, 'nothing picked yet').toBeDisabled();

    await page.getByTestId('shell-node-0').fill('1');
    await page.getByTestId('shell-node-1').fill('2');
    await page.getByTestId('shell-node-2').fill('3');
    await expect(add, 'three corners is a triangle').toBeEnabled();

    /* The curved option appears only where it can mean anything: three points
       are coplanar by definition. */
    await expect(page.getByTestId('quad-curved')).toHaveCount(0);
    await page.getByTestId('shell-node-3').fill('4');
    await expect(page.getByTestId('quad-curved')).toHaveCount(1);
  });
});
