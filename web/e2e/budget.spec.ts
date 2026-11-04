/**
 * Takeoff and budget in the design desk, on a concrete frame: the items measured, a price base
 * created and its prices imported, the total, and the FIEBDC-3 file downloaded. The arithmetic
 * is pinned in `engine/budget/__tests__/budget.test.ts` and `store/__tests__/budget.test.ts`.
 */
import { test, expect, loadModel, solveModel, openDeskStage, deskTab } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@slow budget', () => {
  test('a frame measured, priced from an imported base, exported to BC3', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await openDeskStage(page);
    await deskTab(page, 'budget');
    const b = page.getByTestId('budget-editor');
    await expect(b.getByTestId('budget-table').locator('tbody tr')).not.toHaveCount(0);
    const code = (await b.locator('[data-testid^="budget-line-HOR."]').first().getAttribute('data-testid'))!.replace('budget-line-', '');
    await b.getByTestId('budget-new-name').fill('Base 1');
    await b.getByTestId('budget-new-location').fill('Rosario');
    await b.getByTestId('budget-new-save').click();
    await b.getByTestId('budget-csv').fill(`${code};120000`);
    await b.getByTestId('budget-import').click();
    await expect(b.getByTestId('budget-note')).toContainText(/1 (prices read|precios leídos)/);
    await expect(b.getByTestId('budget-direct')).not.toHaveText(/^0[,.]00$/);
    const download = page.waitForEvent('download');
    await b.getByTestId('budget-bc3-out').click();
    expect((await download).suggestedFilename()).toMatch(/\.bc3$/);
    expect(errors).toEqual([]);
  });
});
