/**
 * The drawing set as a list: a kind duplicated with another scale, a new kind added, the display
 * and the title block template set, and the set kept as a template and applied to another
 * project. The builder's rules are pinned in `store/__tests__/sheet-set-template.test.ts`.
 */
import { test, expect, designAll, loadModel, openDocumentsStage, openSheetsPlace } from './fixtures';

test.use({ viewport: { width: 1400, height: 900 } });

test.describe('@slow the drawing set as a list', () => {
  test('arranged, kept as a template and applied to another project', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openSheetsPlace(page, { setup: true });
    const panel = page.getByTestId('sheets-panel');
    await panel.scrollIntoViewIfNeeded();

    await page.getByTestId('sheets-entries').locator('summary').click();
    // The formwork twice: the copy at 1:50.
    await page.getByTestId('sheets-entry-dup-formwork').click();
    await page.getByTestId('sheets-entry-formwork-2').locator('button.name').click();
    await page.getByTestId('sheets-entry-scale-formwork-2').selectOption('50');
    await page.getByTestId('sheets-entry-label-formwork-2').fill('Encofrado a 1:50');
    await page.getByTestId('sheets-entry-label-formwork-2').press('Enter');
    // The setting-out, added at the end.
    await page.getByTestId('sheets-entry-kind').selectOption('setout');
    await page.getByTestId('sheets-entry-add').click();
    await expect(page.getByTestId('sheets-entry-setout')).toBeVisible();
    // Colour by diameter and a title block line.
    await page.getByTestId('sheets-display').locator('summary').click();
    await page.getByTestId('sheets-color-dia').check();
    await page.getByTestId('sheets-title-block').locator('summary').click();
    await page.getByTestId('sheets-tb-expediente').fill('EX-7');
    await page.getByTestId('sheets-tb-expediente').press('Enter');

    await page.getByTestId('sheets-build').click();
    await expect(page.getByTestId('sheets-count')).toBeVisible();
    const list = page.getByTestId('sheets-list');
    await expect(list).toContainText(/Encofrado a 1:50/);
    await expect(list).toContainText(/Replanteo de columnas|Column setting-out/);

    // Kept as a template, and applied to another project.
    await page.getByTestId('sheets-templates').locator('summary').click();
    await page.getByTestId('sheets-tpl-name').fill('Estudio');
    await page.getByTestId('sheets-tpl-save').click();
    const entries = await page.getByTestId('sheets-entries').locator('li').count();

    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openSheetsPlace(page, { setup: true });
    await page.getByTestId('sheets-panel').scrollIntoViewIfNeeded();
    // The drawings place stays mounted across the new project: its folds keep their state.
    const unfold = async (id: string) => {
      const d = page.getByTestId(id);
      if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator('summary').first().click();
    };
    await unfold('sheets-templates');
    await page.getByTestId('sheets-tpl-apply-Estudio').click();
    await unfold('sheets-entries');
    await expect(page.getByTestId('sheets-entries').locator('li')).toHaveCount(entries);
    await page.getByTestId('sheets-build').click();
    await expect(page.getByTestId('sheets-list')).toContainText(/Encofrado a 1:50/);
    expect(errors).toEqual([]);
  });

  test('a drawing given another scale and placed by hand keeps both when the set is laid out again', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await openSheetsPlace(page, { setup: true });
    await page.getByTestId('sheets-panel').scrollIntoViewIfNeeded();
    await page.getByTestId('sheets-build').click();
    await expect(page.getByTestId('sheets-count')).toBeVisible();
    // A formwork sheet: a plan, with a scale to change (a table has none).
    const formwork = () => page.getByTestId('sheets-list').locator('li', { hasText: /encofrado|Formwork/i }).first().locator('button.pick');
    await formwork().click();
    const composer = page.getByTestId('sheets-composer');
    await composer.locator('summary').click();
    await page.getByTestId('sheets-composer-scale').selectOption('200');
    await page.getByTestId('sheets-composer-x').fill('40');
    await page.getByTestId('sheets-composer-place').click();
    await expect(page.getByTestId('sheets-preview')).toContainText('1:200');
    // Laid out again: the adjustments are applied again.
    await page.getByTestId('sheets-build').click();
    await formwork().click();
    await expect(page.getByTestId('sheets-preview')).toContainText('1:200');
    await expect(page.getByTestId('sheets-composer').locator('summary')).toContainText(/ajustes|adjusted/);
    // Only the chosen sheet is exported.
    await page.getByTestId('sheets-choose-E-02').check();
    await expect(page.getByTestId('sheets-count')).toContainText(/1 elegida|1 chosen/);
  });
});
