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
  test('Move and Select sit beside undo and redo', async ({ pro: page }) => {
    /* They are about the POINTER, not about the model: every stage selects,
       so filing Select under MODEL claimed it was a step of building one. */
    await expect(page.getByTestId('pr-pan')).toBeVisible();
    await expect(page.getByTestId('pr-select')).toBeVisible();
    await expect(page.getByTestId('pr-cmd-selection'), 'and not in the Model stage').toHaveCount(0);
  });

  test('Select opens the panel, and lights only while that panel is showing',
    async ({ pro: page }) => {
      const select = page.getByTestId('pr-select');
      await select.click();
      await expect(page.locator('.sel-panel')).toBeVisible();
      await expect(select).toHaveAttribute('aria-pressed', 'true');
      /* Shells are offered here and not in Basic: PRO is where plates live. */
      await expect(page.locator('.sel-panel').getByText(/placas|plates|shells/i).first()).toBeVisible();

      /*
       * Going to another panel takes the paint off — and leaves the pointer
       * SELECTING, because nothing has asked it to draw. The tool changes
       * only when a "Draw …" button says so.
       */
      await page.getByTestId('pr-stage-model').click();
      await page.getByTestId('pr-cmd-nodes').click();
      await expect(select).toHaveAttribute('aria-pressed', 'false');
      expect(await page.evaluate(() => window.__stabileo.currentTool())).toBe('select');
    });

  test('Move arms the pan tool and says so', async ({ pro: page }) => {
    await page.getByTestId('pr-pan').click();
    expect(await page.evaluate(() => window.__stabileo.currentTool())).toBe('pan');
    /* And Select is the way back, from anywhere. */
    await page.getByTestId('pr-select').click();
    expect(await page.evaluate(() => window.__stabileo.currentTool())).toBe('select');
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

    /* One button uses the mouse and it is at the top, like every other
       panel; the form's own button only ever adds what the boxes hold. */
    await expect(page.getByTestId('draw-plate')).toBeVisible();
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
