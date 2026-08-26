/**
 * Carrying a 3D model into 2D, and the settings that explain themselves.
 *
 * The conversion has unit tests over a warehouse whose answer is known by
 * hand, and an audit that cuts every 3D model in the library and solves the
 * result. What neither can see is the part the user touches: whether the
 * ribbon asks before throwing a dimension away, whether the cuts on offer are
 * the ones the model actually has, and whether coming back up restores what
 * was there — which is the difference between a round trip and losing an
 * afternoon's modelling.
 */

import { test, expect, loadModel } from './fixtures';

type Page = import('@playwright/test').Page;

async function openBasic(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
}

const count = (page: Page) => page.evaluate(() => window.__stabileo.elementIds().length);

test.describe('switching a 3D model to 2D', () => {
  test.beforeEach(async ({ page }) => {
    await openBasic(page);
    await loadModel(page, '3d-nave-industrial');
  });

  test('asks before throwing the third dimension away', async ({ page }) => {
    await page.getByTestId('rb-cmd-dim').click();
    await expect(page.locator('.s2d')).toBeVisible();
    // And staying in 3D leaves the model exactly as it was.
    const before = await count(page);
    await page.getByTestId('s2d-cancel').click();
    await expect(page.locator('.s2d')).toBeHidden();
    expect(await count(page)).toBe(before);
  });

  test('offers the cuts the model actually has', async ({ page }) => {
    await page.getByTestId('rb-cmd-dim').click();
    // The warehouse has frames every 2.5 m along Y — the cuts are read off
    // the model, so this is the model's own grid, not a guess.
    const chips = page.locator('.s2d-cut');
    await expect(chips.first()).toBeVisible();
    expect(await chips.count()).toBeGreaterThan(3);
    await expect(page.getByTestId('s2d-cut-10')).toBeVisible();
  });

  test('takes one frame, and gives the whole model back', async ({ page }) => {
    const before = await count(page);
    expect(before).toBeGreaterThan(100);

    await page.getByTestId('rb-cmd-dim').click();
    await page.getByTestId('s2d-cut-10').click();
    await page.getByTestId('s2d-apply').click();

    await expect.poll(() => count(page)).toBeLessThan(before);
    const sliced = await count(page);
    expect(sliced).toBeGreaterThan(0);
    // The banner names the cut, because a frame's results read as the whole
    // building's is the mistake worth preventing.
    await expect(page.locator('.simplified-banner')).toContainText('Y = 10');
    // And it names the LOAD the cut left behind, which is the count that has
    // to survive to the standing context rather than stopping at the dialog:
    // a frame short of members looks weaker than it is, and a frame short of
    // LOAD looks stronger — it solves, reports zero, and reads as safe. The
    // warehouse carries load on every frame, so a cut at Y = 10 leaves the
    // rest of it behind and the banner has to say so.
    const droppedLoads = page.getByTestId('s2d-dropped-loads');
    await expect(droppedLoads).toBeVisible();
    expect(Number(await droppedLoads.getAttribute('data-count'))).toBeGreaterThan(0);

    // Back up: the original returns, not the frame in a 3D viewport.
    await page.getByTestId('rb-cmd-dim').click();
    await expect.poll(() => count(page), { timeout: 30_000 }).toBe(before);
  });

  test('flags a cut that brings nothing to stand on', async ({ page }) => {
    await page.getByTestId('rb-cmd-dim').click();
    // Cutting by height takes a roof level: members, and no support under them.
    await page.getByTestId('s2d-plane-xy').click();
    await expect(page.locator('.s2d-cut-flag').first()).toBeVisible();
  });

  test('projects the whole structure when that is what was asked', async ({ page }) => {
    const before = await count(page);
    await page.getByTestId('rb-cmd-dim').click();
    await page.getByTestId('s2d-mode-project').click();
    await page.getByTestId('s2d-apply').click();
    await expect(page.locator('.simplified-banner')).toBeVisible();

    /*
     * Measured against the CUT, not against the original.
     *
     * A projection of this warehouse goes from 633 members to 140, because
     * every frame in the building lands on top of every other and the builder
     * merges what coincides — which is precisely why the projection is the
     * lesser of the two answers for a repetitive structure. What it must
     * still be is bigger than one frame: it is the whole building flattened,
     * not a slice of it, and if the two ever converge the modes have stopped
     * meaning different things.
     */
    const projected = await count(page);
    expect(projected).toBeGreaterThan(0);
    expect(projected).toBeLessThan(before);

    await page.getByTestId('rb-cmd-dim').click();
    await expect.poll(() => count(page), { timeout: 30_000 }).toBe(before);
    await page.getByTestId('rb-cmd-dim').click();
    // Back to slice explicitly: the dialog remembers the mode across
    // openings, which is right for a user repeating a choice and a trap for
    // a test that assumes the default.
    await page.getByTestId('s2d-mode-slice').click();
    await page.getByTestId('s2d-cut-10').click();
    await page.getByTestId('s2d-apply').click();
    await expect.poll(() => count(page)).toBeLessThan(projected);
  });

  test('asks twice before erasing the model', async ({ page }) => {
    const before = await count(page);
    await page.getByTestId('rb-cmd-dim').click();
    await page.getByTestId('s2d-erase').click();
    // Still there: the first press only asks.
    expect(await count(page)).toBe(before);
    await page.getByTestId('s2d-erase-confirm').click();
    await expect.poll(() => count(page)).toBe(0);
  });
});

test.describe('a flat model needs no question', () => {
  test('switches straight down when there is nothing to decide', async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');
    // Already 2D; going up and back down must not interrogate the user.
    await page.getByTestId('rb-cmd-dim').click();   // → 3D
    await page.getByTestId('rb-cmd-dim').click();   // → 2D
    await expect(page.locator('.s2d')).toHaveCount(0);
  });
});

test.describe('settings explain themselves', () => {
  test('a hover explains a control that cannot explain itself', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('rb-settings').click();

    const row = page.locator('.ht-wrap').filter({ hasText: /primary selector|selector principal/i }).first();
    await row.hover();
    const tip = page.locator('.ht-tip');
    // Deliberate pause, not a flicker: these sit in a list a reader scans.
    await expect(tip).toHaveCount(0);
    await expect(tip).toBeVisible({ timeout: 5_000 });

    await page.mouse.move(400, 400);
    await expect(tip).toHaveCount(0);
  });

  test('every setting has one', async ({ page }) => {
    await openBasic(page);
    await page.getByTestId('rb-settings').click();
    // A count rather than a list: the point is that no control was left
    // without an explanation, and the exact number moves with the panel.
    expect(await page.locator('.ht-wrap').count()).toBeGreaterThan(15);
  });
});

test.describe('the heading only appears with something under it', () => {
  test('goes away when both selectors are switched off', async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');
    await page.getByTestId('rb-cmd-solve').click();
    await expect(page.getByTestId('rb-cmd-momentY')).toBeEnabled({ timeout: 60_000 });

    const heading = page.getByText(/change results view|cambiar resultados a visualizar/i);
    await page.getByTestId('rb-cmd-momentY').click();
    await expect(heading).toBeVisible();

    await page.getByTestId('rb-settings').click();
    for (const label of [/secondary selector|selector secundario/i, /primary selector|selector principal/i]) {
      const cb = page.locator('label').filter({ hasText: label }).locator('input').first();
      if (await cb.isChecked()) await cb.uncheck();
    }
    await page.getByTestId('rb-cmd-momentY').click();
    await expect(heading, 'a heading over an empty box reads as a panel that failed to load').toHaveCount(0);
  });
});
