/**
 * The cards that open on a double-click, and the promise they make.
 *
 * ── The audit this came from ───────────────────────────────────────
 *
 * "que no pueda pasar que un cambio ahí no se refleje en los datos del
 * modelo." It could, and it did. `ElementEditor` assigned straight onto the
 * element object — `elem.materialId = …`, `elem.releaseI = …` — which changes
 * the data and tells nothing:
 *
 *   `modelVersion` never moved, so everything keyed on it went on believing
 *   the model was the one that had been analysed;
 *   the mutation hook never fired;
 *   the elements map was never reassigned, so the canvas had no reason to
 *   redraw;
 *   and the results were never cleared, so the numbers on screen still
 *   described the member's old section.
 *
 * `NodeEditor` did it correctly, through `updateNode`, which is what made the
 * difference visible at all. The member editor goes through a store method
 * now, and these tests watch the three observable consequences rather than
 * the assignment: the version moves, the results go, and the change is still
 * there when the card is reopened.
 */

import { test, expect, type Page } from '@playwright/test';
import { loadModel } from './fixtures';

async function openBasic(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stabileo-lang', 'es');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  });
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
}

/** Double-click the middle of the member between nodes 1 and 2. */
async function openMember(page: Page) {
  const a = await page.evaluate(() => window.__stabileo.nodeScreenPos(1));
  const b = await page.evaluate(() => window.__stabileo.nodeScreenPos(2));
  await page.mouse.dblclick((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
  await expect(page.getByTestId('element-editor')).toBeVisible();
}

test.describe('@smoke editing a member by double-click', () => {
  test.beforeEach(async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');
    await page.getByTestId('rb-cmd-solve').click();
    await expect(page.getByTestId('rb-cmd-stress')).toBeEnabled({ timeout: 60_000 });
    /* Double-click only opens an editor under the select pointer. */
    await page.getByTestId('rb-cmd-select').click();
  });

  test('a change reaches the model, and takes the stale results with it', async ({ page }) => {
    const versionBefore = await page.evaluate(() => window.__stabileo.modelVersion());

    await openMember(page);
    await page.getByTestId('release-i').selectOption('slideX');
    await page.getByTestId('element-editor-ok').click();
    await page.waitForTimeout(500);

    const versionAfter = await page.evaluate(() => window.__stabileo.modelVersion());
    expect(versionAfter, 'the model says it changed').toBeGreaterThan(versionBefore);

    /*
     * The results described a member with a rigid end. Leaving them on screen
     * beside a member that now has a slider is the failure mode this audit
     * was asked about, and the one nobody would notice.
     */
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.viewportPick().hasResults))
      .toBe(false);
  });

  test('and the change is still there when the card is reopened', async ({ page }) => {
    await openMember(page);
    await page.getByTestId('release-j').selectOption('hingeSlideZ');
    await page.getByTestId('release-axis-j').selectOption('local');
    await page.getByTestId('element-editor-ok').click();
    await page.waitForTimeout(400);

    await openMember(page);
    await expect(page.getByTestId('release-j')).toHaveValue('hingeSlideZ');
    await expect(page.getByTestId('release-axis-j')).toHaveValue('local');
  });

  test('Cancel changes nothing', async ({ page }) => {
    const versionBefore = await page.evaluate(() => window.__stabileo.modelVersion());

    await openMember(page);
    await page.getByTestId('release-i').selectOption('hinge');
    await page.getByRole('button', { name: /Cancelar|Cancel/ }).click();
    await page.waitForTimeout(400);

    expect(await page.evaluate(() => window.__stabileo.modelVersion())).toBe(versionBefore);
    await openMember(page);
    await expect(page.getByTestId('release-i')).toHaveValue('none');
  });

  test('an axis only appears where there is a slide to orient', async ({ page }) => {
    await openMember(page);

    /* A hinge releases rotation; there is no direction to measure it against. */
    await page.getByTestId('release-i').selectOption('hinge');
    await expect(page.getByTestId('release-axis-i')).toHaveCount(0);

    await page.getByTestId('release-i').selectOption('slideX');
    await expect(page.getByTestId('release-axis-i')).toBeVisible();

    /*
     * The combined entry exists because the model can express it and the old
     * pair of independent controls could reach it. A dropdown offering only
     * one or the other would drop it the first time such a model was opened
     * and saved.
     */
    await page.getByTestId('release-i').selectOption('hingeSlideX');
    await expect(page.getByTestId('release-axis-i')).toBeVisible();
  });

  test('the card can be pushed out of the way', async ({ page }) => {
    await openMember(page);
    const card = page.getByTestId('element-editor');
    const before = (await card.boundingBox())!;

    /*
     * It opens over the thing you just double-clicked, which is the part of
     * the model you now cannot see. Dragging by the title bar is the answer;
     * dragging by the whole card would fight every field inside it.
     */
    const head = (await page.getByTestId('element-editor-head').boundingBox())!;
    await page.mouse.move(head.x + 40, head.y + head.height / 2);
    await page.mouse.down();
    await page.mouse.move(head.x - 120, head.y + 100, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = (await card.boundingBox())!;
    expect(Math.abs(after.x - before.x), 'moved sideways').toBeGreaterThan(60);
    expect(after.y, 'and down').toBeGreaterThan(before.y + 40);
  });
});

test.describe('@smoke editing a node by double-click', () => {
  test('a coordinate change reaches the model and clears the results', async ({ page }) => {
    await openBasic(page);
    await loadModel(page, 'two-story-frame');
    await page.getByTestId('rb-cmd-solve').click();
    await expect(page.getByTestId('rb-cmd-stress')).toBeEnabled({ timeout: 60_000 });
    await page.getByTestId('rb-cmd-select').click();

    const at = await page.evaluate(() => window.__stabileo.nodeScreenPos(2));
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(page.getByTestId('node-editor')).toBeVisible();

    const x = page.getByTestId('node-editor-x');
    const was = Number(await x.inputValue());
    await x.fill(String(was + 0.5));
    await page.getByTestId('node-editor-ok').click();
    await page.waitForTimeout(500);

    await expect
      .poll(() => page.evaluate(() => window.__stabileo.viewportPick().hasResults))
      .toBe(false);

    /* And the node is where it was put. */
    await page.mouse.dblclick(
      (await page.evaluate(() => window.__stabileo.nodeScreenPos(2)))!.x,
      (await page.evaluate(() => window.__stabileo.nodeScreenPos(2)))!.y,
    );
    await expect(page.getByTestId('node-editor-x')).toHaveValue(String((was + 0.5).toFixed(3)));
  });
});
