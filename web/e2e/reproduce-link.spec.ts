import { test, expect } from './fixtures';

test.describe('@smoke checking an exported report', () => {
  test('PRO: a quiet link under the report, not a button beside Save and Open', async ({ pro: page }) => {
    await page.getByTestId('pr-project').click();
    const file = page.getByTestId('pp-save').locator('xpath=ancestor::div[contains(@class,"pp-grid")][1]');
    await expect(file.getByTestId('pp-reproduce')).toHaveCount(0);
    const link = page.getByTestId('pp-reproduce');
    await link.scrollIntoViewIfNeeded();
    await expect(link).toHaveText(/Check an exported report|Verificar un reporte exportado/);
    await link.click();
    await expect(page.getByTestId('reproduce-dialog')).toBeVisible();
  });

  test('Basic: the same link in the report group opens the same dialog', async ({ page }) => {
    await page.goto('/app/basic?e2e=1');
    await page.getByTestId('hdr-project').click();
    const link = page.getByTestId('open-reproduce');
    await link.scrollIntoViewIfNeeded();
    await expect(link).toHaveText(/Check an exported report|Verificar un reporte exportado/);
    await link.click();
    await expect(page.getByTestId('reproduce-dialog')).toBeVisible();
  });
});
