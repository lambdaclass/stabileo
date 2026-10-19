/**
 * The project's design data in one panel: the covers held against CIRSOC 201-2025 Table
 * 20.5.1.3.1, the preset that sets them to it, the steel. Each datum's use is pinned in
 * `store/__tests__/design-data.test.ts`.
 */
import { test, expect, openClassicDesign } from './fixtures';

test.describe('@smoke design data', () => {
  test('the usual covers are flagged under the table, the CIRSOC preset sets them, it undoes', async ({ pro: page }) => {
    await openClassicDesign(page);
    await page.getByTestId('pr-cmd-designData').click();
    await expect(page.getByTestId('design-data-panel')).toBeVisible();
    await expect(page.getByTestId('design-data-cover-beam')).toHaveValue('25');
    await expect(page.getByTestId('design-data-under')).toBeVisible();
    await page.getByTestId('design-data-cirsoc').click();
    await expect(page.getByTestId('design-data-cover-beam')).toHaveValue('40');
    await expect(page.getByTestId('design-data-cover-footing')).toHaveValue('75');
    await expect(page.getByTestId('design-data-under')).toHaveCount(0);
    await page.getByTestId('design-data-grade').selectOption('ADN 500');
    await expect(page.getByTestId('design-data-fy')).toHaveValue('500');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(page.getByTestId('design-data-fy')).toHaveValue('420');
  });
});
