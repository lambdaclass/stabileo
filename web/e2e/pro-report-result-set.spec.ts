import { test, expect, loadModel, solveModel } from './fixtures';

test.describe('@smoke the report of a chosen result', () => {
  test('a combination chosen in the report dialog stays chosen when the model is solved again', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await page.getByTestId('pr-project').click();
    await page.getByTestId('pp-export-report').click();
    const select = page.getByTestId('pro-report-dialog').getByTestId('rpt-result-set');
    await expect(select).toHaveValue('envelope');
    const combo = await select.locator('option[value^="combo:"]').last().getAttribute('value');
    expect(combo).toMatch(/^combo:\d+$/);
    await select.selectOption(combo!);
    await solveModel(page);
    await expect(select).toHaveValue(combo!);
  });
});
