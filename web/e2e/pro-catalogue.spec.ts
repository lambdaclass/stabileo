/**
 * PRO 10/10: the catalogue as a table of every column, the dimensioned drawing, the HE M and
 * unequal-leg families, and a company's own sections from a CSV.
 */
import { test, expect, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

async function sectionsTab(page: Page) {
  await page.goto(PRO_URL);
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-sections').click();
}

test.describe('@smoke PRO catalogue', () => {
  test('the table sorts by a column and picks a HE M', async ({ page }) => {
    await sectionsTab(page);
    await page.getByTestId('pro-open-section-modal').click();
    await page.getByTestId('browse-mode-table').click();
    await expect(page.getByTestId('profile-table-browser')).toBeVisible();
    await page.getByTestId('profile-table-family-HEM').click();
    await page.getByTestId('profile-table-family-IPE').click();
    await expect(page.getByTestId('profile-table-row')).toHaveCount(24);
    await page.getByTestId('profile-table-sort-iy').click();
    await page.getByTestId('profile-table-sort-iy').click();
    await expect(page.getByTestId('profile-table-row').first()).toContainText('HEM 1000');
    await page.getByTestId('profile-table-row').first().click();
    await expect(page.getByTestId('section-current')).toHaveText('HEM 1000');
    await page.getByTestId('section-dims-toggle').locator('summary').click();
    await expect(page.getByTestId('dim-h')).toHaveText('1008');
    await expect(page.getByTestId('dim-tw')).toContainText('21');
  });

  test('an unequal angle is in the list', async ({ page }) => {
    await sectionsTab(page);
    await page.getByTestId('pro-open-section-modal').click();
    await page.getByTestId('profile-search').fill('L 200x100x12');
    await expect(page.getByTestId('profile-option-L 200x100x12')).toBeVisible();
  });

  test('sections from a CSV, with a refused row reported by line', async ({ page }) => {
    await sectionsTab(page);
    const csv = 'name;shape;h;b;tw;tf;t\nVS 400;I;400;200;8;12,5;\nTubo;RHS;100;50;;;3\nMalo;Z;100;50;;;2\n';
    await page.getByTestId('pro-sections-csv').setInputFiles({ name: 'mine.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByTestId('pro-sections-csv-report')).toContainText('2');
    await expect(page.getByTestId('pro-sections-csv-report')).toContainText('4');
    const names = await page.evaluate(() => (window.__stabileo.entityData('setting', 'sections') as Array<[number, { name: string }]>).map(([, s]) => s.name));
    expect(names).toEqual(expect.arrayContaining(['VS 400', 'Tubo']));
  });
});
