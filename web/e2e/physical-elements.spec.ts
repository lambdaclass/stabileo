/**
 * The physical elements of a model: recognised, listed, corrected.
 */
import { test, expect, loadModel, ribbonCmd } from './fixtures';

test.describe('@smoke physical elements', () => {
  test('recognise lists columns and beams, and a corrected kind is declared', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'physical');
    await expect(page.getByTestId('physical-panel')).toBeVisible();
    await page.getByTestId('physical-recognize').click();
    // A proposal first: nothing is applied until it is accepted.
    await expect(page.getByTestId('recognition-review')).toBeVisible();
    await expect(page.getByTestId('physical-table')).toHaveCount(0);
    await page.getByTestId('recognition-apply').click();
    await expect(page.getByTestId('recognition-outcome')).toBeVisible();
    const table = page.getByTestId('physical-table');
    await expect(table).toBeVisible();
    await expect(page.getByTestId('physical-filter-column')).toBeVisible();
    await expect(page.getByTestId('physical-filter-beam')).toBeVisible();
    // Correct one element's kind: it becomes declared.
    const firstKind = table.locator('select[data-testid^="physical-kind-"]').first();
    await firstKind.selectOption('brace');
    await expect(table.getByText(/declared|declarado/).first()).toBeVisible();
  });

  test('accepted by kind with an exception; a second reading of the same model changes nothing', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'physical');
    await page.getByTestId('physical-recognize').click();
    // Columns not accepted as a kind, but one of them accepted as an exception.
    await page.getByTestId('recognition-kind-column').uncheck();
    const firstColumn = page.locator('[data-testid^="recognition-row-"]').filter({ hasText: /Column|Columna/ }).first();
    await firstColumn.locator('input[type="checkbox"]').check();
    await page.getByTestId('recognition-apply').click();
    await expect(page.getByTestId('physical-filter-column')).toContainText('(1)');
    // The rest of the columns, then nothing left to change.
    await page.getByTestId('physical-recognize').click();
    await page.getByTestId('recognition-apply').click();
    await page.getByTestId('physical-recognize').click();
    await expect(page.getByTestId('recognition-nothing')).toBeVisible();
    const ids = await page.locator('[data-testid^="physical-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    await page.getByTestId('recognition-close').click();
    expect(await page.locator('[data-testid^="physical-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))).toEqual(ids);
  });
});
