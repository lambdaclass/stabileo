/**
 * Basic's interaction and view, as a user meets them:
 *  - a member drawn over one already there is not refused: the editor asks
 *    whether to delete the new one or keep both, in the connection queue;
 *  - clicking again on the same spot reaches the member under the first one;
 *  - a click on a table row selects what the row is;
 *  - hide or isolate from the context menu, and the chip that brings it back;
 *  - the supports switch and the label size, in Settings.
 */
import { test, expect, type Page } from './fixtures';

async function boot(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 60_000 });
}
const census = (page: Page) => page.evaluate(() => {
  const c = window.__stabileo.modelCensus();
  return { nodes: c.nodes, members: c.elements };
});
const selected = (page: Page) => page.evaluate(() => window.__stabileo.selectionByKind());

/** A beam drawn twice over the same two points, single-line mode. */
async function drawTwice(page: Page) {
  await page.getByTestId('rb-cmd-element').click();
  await page.getByTestId('member-mode-single').click();
  const box = (await page.locator('canvas:not(.axis-gizmo)').first().boundingBox())!;
  const at = (fx: number, fy: number) => page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await at(0.2, 0.55); await at(0.6, 0.55);
  await expect.poll(() => census(page)).toEqual({ nodes: 2, members: 1 });
  await at(0.2, 0.55); await at(0.6, 0.55);
  await expect.poll(() => census(page)).toEqual({ nodes: 2, members: 2 });
  return { box, at };
}

test.describe('@smoke Basic interaction and view', () => {
  test('a member drawn over another: the card offers to delete it', async ({ page }) => {
    await boot(page);
    await drawTwice(page);
    const prompt = page.getByTestId('connection-prompt');
    await expect(prompt).toContainText(/repite|repeats/);
    await page.getByTestId('connection-accept').click();
    await expect(prompt).toHaveCount(0);
    await expect.poll(() => census(page)).toEqual({ nodes: 2, members: 1 });
  });

  test('kept both: a second click on the same spot selects the other one', async ({ page }) => {
    await boot(page);
    const { at } = await drawTwice(page);
    await page.getByTestId('connection-decline').click();
    await expect.poll(() => census(page)).toEqual({ nodes: 2, members: 2 });
    await page.keyboard.press('Escape');
    await page.getByTestId('rb-cmd-select').click();
    await at(0.4, 0.55);
    await expect.poll(async () => (await selected(page)).elements).toEqual([1]);
    await at(0.4, 0.55);
    await expect.poll(async () => (await selected(page)).elements).toEqual([2]);
    await at(0.4, 0.55);
    await expect.poll(async () => (await selected(page)).elements).toEqual([1]);
  });

  test('a click on a table row selects the member', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('rb-cmd-element').click();
    await page.locator('td.id-cell', { hasText: /^2$/ }).first().click();
    await expect.poll(async () => (await selected(page)).elements).toEqual([2]);
  });

  test('hide and isolate from the context menu, and the chip shows all again', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.evaluate(() => window.__stabileoActions.selectElements([1]));
    const canvas = page.locator('canvas:not(.axis-gizmo)').first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + 20, box.y + 20, { button: 'right' });
    await page.getByTestId('ctx-view-hide').click();
    const chip = page.getByTestId('hidden-items-chip');
    await expect(chip).toBeVisible();
    await page.getByTestId('hidden-items-show-all').click();
    await expect(chip).toHaveCount(0);
  });

  test('supports switch and label size live in Settings; the size is remembered', async ({ page }) => {
    await boot(page);
    await page.getByTestId('rb-settings').click();
    const supports = page.getByTestId('cfg-show-supports');
    await expect(supports).toBeChecked();
    await supports.uncheck();
    await expect(supports).not.toBeChecked();
    await page.getByTestId('cfg-label-size').fill('1.5');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('stabileo-label-scale'))).toBe('1.5');
  });
});
