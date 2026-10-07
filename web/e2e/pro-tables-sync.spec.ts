import { test, expect, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

/** The x of the model's first node, which is the table's first row. */
const firstX = (page: Page) => page.evaluate(() => (window.__stabileo.entityData('setting', 'nodes') as Array<[number, { x: number }]>)[0]![1].x);

/*
 * The PRO nodes and members tables are views of the model: a change made anywhere else (here,
 * an undo) shows in their rows, and leaving a cell untouched writes nothing back.
 */
test.describe('@smoke the tables follow the model, and an untouched cell writes nothing', () => {
  test('nodes: an undone move stays undone after a cell of its row loses the focus', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    const x = page.locator('.pro-nodes-table input[data-col="x"]').first();
    const before = await x.inputValue();
    await x.fill(String(Number(before) + 1));
    await x.press('Tab');
    await expect.poll(() => firstX(page)).toBe(Number(before) + 1);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => firstX(page)).toBe(Number(before));
    await expect(x).toHaveValue(before);
    await x.focus();
    await x.blur();
    expect(await firstX(page)).toBe(Number(before));
  });

  test('a pasted coordinate with thousands grouped is read whole, not cut at the comma', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-nodes').click();
    const x = page.locator('.pro-nodes-table input[data-col="x"]').first();
    await x.fill('1,234.5');
    await x.press('Tab');
    await expect.poll(() => firstX(page)).toBe(1234.5);
  });
});
