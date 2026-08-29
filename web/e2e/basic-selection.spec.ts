/**
 * Selecting things in Basic, and the legend that comes with a colour map.
 *
 * ── Why this file exists ───────────────────────────────────────────
 *
 * Both features below were reported broken by a user and then verified by
 * hand, which is how they were broken in the first place: the geometry has
 * unit tests, and the geometry was never the problem. What failed was the
 * wiring around it — a drag in Supports mode that never started, a legend
 * whose numbers came from a picture that had been replaced.
 *
 * Neither of those is visible to a type checker or to a test that imports a
 * module. They need a real canvas, a real drag, and a real ribbon.
 *
 * ── The line this file draws ───────────────────────────────────────
 *
 * Hooks load and solve — the starting position. Every selection below is a
 * drag with the mouse and every result change is a click on the ribbon,
 * because those are the thing under test.
 */

import { test, expect, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

async function openBasic(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), {
      timeout: 60_000,
      message: 'real WASM solver must be initialised (not the Vite stub)',
    })
    .toBe(true);
}

/**
 * Arm the select pointer.
 *
 * It opens in pan, so a drag moves the view and selects nothing — which is
 * also the first reason a hand check of this feature can come back empty and
 * look like a bug in the selection.
 */
async function armSelect(page: Page) {
  const btn = page.getByTestId('pointer-mode');
  if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
}

/**
 * A crossing drag over most of the canvas: right to left, so it takes what it
 * touches.
 *
 * Aimed at the model's canvas explicitly. `canvas` alone also matches the 3D
 * axis gizmo, which comes first in the document and is 80 px square — a drag
 * inside it selects nothing and looks like a broken viewport.
 */
async function sweepAll(page: Page) {
  const box = await page.locator('canvas:not(.axis-gizmo)').first().boundingBox();
  if (!box) throw new Error('no canvas');
  const x1 = box.x + box.width * 0.9, x2 = box.x + box.width * 0.1;
  const y1 = box.y + box.height * 0.9, y2 = box.y + box.height * 0.1;
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 5 });
  await page.mouse.move(x2, y2, { steps: 5 });
  await page.mouse.up();
}

const picked = (page: Page) => page.evaluate(() => window.__stabileo.selectionByKind());

test.describe('box select in Basic 2D', () => {
  test.beforeEach(async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');
    await armSelect(page);
  });

  test('a drag takes members, and only members', async ({ page }) => {
    await sweepAll(page);
    const got = await picked(page);
    expect(got.elements.length, 'members').toBeGreaterThan(0);
    // Not their end nodes: see the delete test below for why that matters.
    expect(got.nodes, 'nodes must not come along').toHaveLength(0);
  });

  /**
   * The reported behaviour: sweeping the members of a frame and pressing
   * Delete removed the whole model — nodes, supports and the loads standing
   * on those nodes. What is highlighted has to be what Delete removes, and
   * the highlight said "these bars".
   */
  test('deleting a member selection leaves the nodes and supports standing', async ({ page }) => {
    const before = await page.evaluate(() => ({
      elements: window.__stabileo.elementIds().length,
      nodes: window.__stabileo.nodeCount(),
      supports: window.__stabileo.supportCount(),
    }));
    expect(before.supports).toBeGreaterThan(0);

    await sweepAll(page);
    expect((await picked(page)).elements.length).toBeGreaterThan(0);
    await page.keyboard.press('Delete');

    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length))
      .toBeLessThan(before.elements);
    const after = await page.evaluate(() => ({
      nodes: window.__stabileo.nodeCount(),
      supports: window.__stabileo.supportCount(),
    }));
    expect(after.nodes, 'the nodes stay').toBe(before.nodes);
    expect(after.supports, 'and so do the supports on them').toBe(before.supports);
  });

  /** Wanting both is what the multi-kind switch is for. */
  test('with nodes armed too, Delete takes both', async ({ page }) => {
    const before = await page.evaluate(() => window.__stabileo.nodeCount());
    await page.getByTestId('rb-cmd-select').click();
    await page.getByTestId('multi-kind').check();
    const nodesItem = page.getByTestId('select-mode-nodes');
    if ((await nodesItem.getAttribute('aria-pressed')) !== 'true') await nodesItem.click();

    await sweepAll(page);
    const got = await picked(page);
    expect(got.elements.length).toBeGreaterThan(0);
    expect(got.nodes.length).toBeGreaterThan(0);

    await page.keyboard.press('Delete');
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount()))
      .toBeLessThan(before);
  });

  /**
   * The reported bug: three of the four filters drew no rectangle at all,
   * because the drag was only ever started from the Elements branch.
   */
  for (const kind of ['nodes', 'supports', 'loads'] as const) {
    test(`a drag takes ${kind} when that is what is being selected`, async ({ page }) => {
      await page.getByTestId('rb-cmd-select').click();
      await page.getByTestId(`select-mode-${kind}`).click();
      await sweepAll(page);
      expect((await picked(page))[kind].length, kind).toBeGreaterThan(0);
    });
  }

  /**
   * Multi-kind, which is the whole reason the filter became a set: one sweep
   * that answers "this bay, with its supports and its loads".
   */
  test('one drag takes every kind at once when multi is on', async ({ page }) => {
    await page.getByTestId('rb-cmd-select').click();
    await page.getByTestId('multi-kind').check();
    for (const k of ['nodes', 'supports', 'loads']) {
      const item = page.getByTestId(`select-mode-${k}`);
      if ((await item.getAttribute('aria-pressed')) !== 'true') await item.click();
    }
    await sweepAll(page);

    const got = await picked(page);
    for (const k of ['elements', 'nodes', 'supports', 'loads'] as const) {
      expect(got[k].length, k).toBeGreaterThan(0);
    }
  });

  test('multi is off to begin with, so a click keeps one meaning', async ({ page }) => {
    await page.getByTestId('rb-cmd-select').click();
    await expect(page.getByTestId('multi-kind')).not.toBeChecked();
  });
});

test.describe('the colour scale legend', () => {
  const legend = (page: Page) => page.locator('.cs-legend');

  test.beforeEach(async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');
    // Solved by pressing the command, and waited for by the thing that
    // depends on it: Stress is disabled until there are results, so an
    // enabled Stress IS the signal, with no counter to agree with.
    await page.getByTestId('rb-cmd-solve').click();
    await expect(page.getByTestId('rb-cmd-stress')).toBeEnabled({ timeout: 60_000 });
  });

  /**
   * The reported bug: the legend stayed after the map was replaced by a
   * diagram, labelled with the map's maximum over an unrelated picture.
   */
  test('appears with a colour map and leaves with it', async ({ page }) => {
    await page.getByTestId('rb-cmd-stress').click();
    await expect(legend(page)).toBeVisible();

    await page.getByTestId('rb-cmd-momentY').click();
    await expect(legend(page), 'a bending diagram has no colour scale').toBeHidden();

    await page.getByTestId('rb-cmd-stress').click();
    await expect(legend(page), 'and it comes back with the map').toBeVisible();

    await page.getByTestId('rb-cmd-deformed').click();
    await expect(legend(page)).toBeHidden();
  });

  test('the switch that hides it is only offered while there is one', async ({ page }) => {
    const box = page.getByRole('checkbox', { name: /colour scale|color scale|escala/i });
    await page.getByTestId('rb-cmd-momentY').click();
    await expect(box).toHaveCount(0);

    await page.getByTestId('rb-cmd-stress').click();
    await expect(box).toHaveCount(1);
    await box.uncheck();
    await expect(legend(page)).toBeHidden();
  });
});

/**
 * The tip on the pointer button.
 *
 * Three separate claims, and each one was a correction to how it behaved:
 * it describes the mode you are IN rather than the one a click would give
 * you; the note about where the kinds are chosen belongs to Select alone; and
 * it is a hover tip, not a panel — it used to stick open after a click,
 * because the button keeps focus and the rule was `:focus-within`.
 */
test.describe('the pointer button tip', () => {
  test.beforeEach(async ({ page }) => {
    await openBasic(page);
  });

  test('describes the current mode, and what a click would do', async ({ page }) => {
    const btn = page.getByTestId('pointer-mode');
    const tip = page.locator('.pm-tip');

    await btn.hover();
    await expect(tip).toBeVisible();
    await expect(tip.locator('.pm-tip-mode')).toHaveText(/Pan/);
    await expect(tip.locator('.pm-tip-action')).toHaveText(/Select/);
    // The kind of thing selected is not a setting that applies while panning.
    await expect(tip.locator('.pm-tip-note')).toHaveCount(0);

    await btn.click();
    await expect(tip.locator('.pm-tip-mode')).toHaveText(/Select/);
    await expect(tip.locator('.pm-tip-action')).toHaveText(/Pan/);
    await expect(tip.locator('.pm-tip-note')).toHaveCount(1);
  });

  test('closes when the pointer leaves, even after a click', async ({ page }) => {
    const btn = page.getByTestId('pointer-mode');
    const tip = page.locator('.pm-tip');

    await btn.hover();
    await expect(tip).toBeVisible();
    await btn.click();
    await expect(tip, 'still under the pointer').toBeVisible();

    await page.mouse.move(400, 400);
    await expect(tip, 'the button keeps focus after a click — the tip must not').toBeHidden();
  });
});
