import { test, expect, type Page } from '@playwright/test';

/**
 * Educational as a panel inside Basic.
 *
 * It stopped being a separate application: same model, same solver, same
 * canvas, with a panel that turns an exercise into a sequence of questions.
 * That move is what this suite is about, and the thing it mostly checks is
 * the thing the move introduced — that the panel now opens on top of SOMEONE
 * ELSE'S WORK.
 *
 * In Education proper the canvas was always the exercise's, so `loadExercise`
 * clearing the model was harmless. Inside Basic the model on screen may be an
 * hour of drawing, and replacing it without a way back is not a feature, it
 * is a data-loss bug. So the model is borrowed and handed back, which is the
 * same thing `switchAppMode` does between modes — and the cases below are the
 * ways out of an exercise, each of which has to return it.
 */

const BASIC = '/app/basic?e2e=1';

async function bootBasic(page: Page) {
  /*
   * Cleared ONCE, not on every navigation. `addInitScript` runs on each one,
   * so a bare `localStorage.clear()` here also wipes the setting between the
   * act and the reload that is supposed to prove it was remembered — the
   * harness would be failing the test, not the app.
   */
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('e2e-storage-cleared')) {
        localStorage.clear();
        sessionStorage.setItem('e2e-storage-cleared', '1');
      }
    } catch { /* private mode */ }
  });
  await page.goto(BASIC);
  await expect(page.getByTestId('ribbon')).toBeVisible();
}

/** Switch the setting that puts Educational in Basic. */
async function setEducational(page: Page, on: boolean) {
  await page.getByTestId('rb-settings').click();
  const box = page.getByTestId('cfg-edu-in-basic');
  await expect(box).toBeVisible();
  if (await box.isChecked() !== on) await box.setChecked(on);
}

/** Draw something, so there is work for an exercise to displace. */
async function drawTwoNodes(page: Page) {
  const before = await page.evaluate(() => window.__stabileo.nodeCount());
  await page.getByTestId('rb-cmd-node').click();
  const canvas = page.locator('.viewport-container canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.nodeCount()))
    .toBe(before + 2);
  return page.evaluate(() => window.__stabileo.nodeCount());
}

/*
 * The exercise's own "← Volver", which is in the panel's topbar — NOT the
 * step-level back inside `.exercise-view`, which walks the questions and
 * leaves the exercise loaded. Matching by role inside the view found that one.
 */
async function leaveExercise(page: Page) {
  await page.locator('.edu-back-btn').click();
}

async function openFirstExercise(page: Page) {
  /* Only if it is not already open: the ribbon command TOGGLES its panel, like
     every other command, so pressing it again after ← Volver would close it. */
  if (await page.locator('.edu-panel').count() === 0) {
    await page.getByTestId('rb-cmd-edu').click();
  }
  const card = page.locator('.exercise-card').first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator('.exercise-view')).toBeVisible();
}

test.describe('@smoke Educational inside Basic — the way in', () => {
  test('it is off by default, and nothing in the ribbon mentions it', async ({ page }) => {
    await bootBasic(page);
    await expect(page.getByTestId('rb-cmd-edu')).toHaveCount(0);
    await expect(page.locator('.rb-group[data-group="edu"]')).toHaveCount(0);
  });

  test('switching it on adds one group at the end, named for what it holds', async ({ page }) => {
    await bootBasic(page);
    await setEducational(page, true);

    const group = page.locator('.rb-group[data-group="edu"]');
    await expect(group).toHaveCount(1);
    /*
     * The group says where you are and the command says what you get. Both
     * read "Modo Educativo" at first, so the ribbon said the same words twice
     * and neither named a destination — and "mode" became the wrong noun the
     * moment this stopped being one.
     */
    await expect(group.locator('.rb-group-label')).toHaveText(/educational|educativo/i);
    await expect(group.locator('.rb-group-label')).not.toHaveText(/mode|modo/i);
    await expect(page.getByTestId('rb-cmd-edu')).toHaveText(/exercises|ejercicios|exercícios/i);
  });

  test('the choice is remembered, because it is about how you work', async ({ page }) => {
    await bootBasic(page);
    await setEducational(page, true);
    await page.reload();
    await expect(page.getByTestId('rb-cmd-edu')).toBeVisible();
  });

  test('the mode switcher no longer offers it, and its address still opens', async ({ page }) => {
    await bootBasic(page);
    // Two modes in the toggle, not three: it is not a third place to be.
    await expect(page.locator('.mode-toggle button')).toHaveCount(2);
    await expect(page.locator('.mode-toggle')).not.toHaveText(/educaç|educat/i);

    // The destination survives the way in being removed — handed-out links are links.
    await page.goto('/app/education?e2e=1');
    await expect(page.locator('.edu-panel')).toBeVisible();
  });
});

test.describe('@smoke Educational inside Basic — the model it borrows', () => {
  test('an exercise does not destroy the work it opens on top of', async ({ page }) => {
    await bootBasic(page);
    await setEducational(page, true);
    const drawn = await drawTwoNodes(page);

    await openFirstExercise(page);
    // The exercise took the canvas — that is what an exercise is.
    const during = await page.evaluate(() => window.__stabileo.nodeCount());
    expect(during).toBeGreaterThan(0);

    // ← Volver: the work comes back, not an empty canvas.
    await leaveExercise(page);
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.nodeCount()))
      .toBe(drawn);
  });

  test('switching the setting off with an exercise open gives the work back', async ({ page }) => {
    await bootBasic(page);
    await setEducational(page, true);
    const drawn = await drawTwoNodes(page);
    await openFirstExercise(page);

    await setEducational(page, false);

    // The ribbon group is gone, the panel is not left showing a destination
    // the ribbon cannot name, and the model is the reader's again.
    await expect(page.getByTestId('rb-cmd-edu')).toHaveCount(0);
    await expect(page.locator('.edu-panel')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.nodeCount()))
      .toBe(drawn);
  });

  test('moving between exercises keeps the ONE model that was borrowed', async ({ page }) => {
    await bootBasic(page);
    await setEducational(page, true);
    const drawn = await drawTwoNodes(page);

    await openFirstExercise(page);
    await leaveExercise(page);
    await expect(page.locator('.exercise-card').first()).toBeVisible();
    await openFirstExercise(page);
    await leaveExercise(page);

    /* The second exercise must not have overwritten the snapshot with the
       first one's structure — that is why the borrow happens once. */
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.nodeCount()))
      .toBe(drawn);
  });

  test('an empty canvas stays empty — nothing is invented to give back', async ({ page }) => {
    await bootBasic(page);
    await setEducational(page, true);
    await openFirstExercise(page);
    await leaveExercise(page);
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.nodeCount()))
      .toBe(0);
  });
});
