/**
 * The physical elements of a model: read off it by themselves, listed, corrected.
 */
import { test, expect, loadModel, ribbonCmd } from './fixtures';

test.describe('@smoke physical elements', () => {
  test('are read off the model with nothing to press: columns and beams listed, a corrected kind declared and kept', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'physical');
    await expect(page.getByTestId('physical-panel')).toBeVisible();
    await expect(page.getByTestId('physical-recognize')).toHaveCount(0);
    const table = page.getByTestId('physical-table');
    await expect(table).toBeVisible();
    await expect(page.getByTestId('physical-filter-column')).toBeVisible();
    await expect(page.getByTestId('physical-filter-beam')).toBeVisible();
    await expect(page.getByTestId('physical-pending')).toHaveCount(0);
    const rows = await page.locator('[data-testid^="physical-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    // Correct one element's kind: it becomes declared, and reading the model again leaves it so.
    const firstKind = table.locator('select[data-testid^="physical-kind-"]').first();
    const id = (await firstKind.getAttribute('data-testid'))!.replace('physical-kind-', '');
    await firstKind.selectOption('brace');
    await expect(page.getByTestId(`physical-row-${id}`)).toContainText(/declared|declarado/);
    // An edit where it was (a node moved onto itself) reads the model again.
    await page.evaluate(() => { const [n] = window.__stabileo.nodeIds(); const p = window.__stabileo.nodePosition(n!)!; window.__stabileoActions.moveNode(n!, p.x, p.y, p.z); });
    await expect(page.getByTestId(`physical-kind-${id}`)).toHaveValue('brace');
    expect(await page.locator('[data-testid^="physical-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual(rows);
  });
});
