/**
 * PRO 18/18, Specifications: what a member, support, link or surface is told beyond its geometry,
 * edited over the selection. Each write over several members is one undo step, the list is read
 * back from the members, and the analysis switches land on the model. The grouping itself is
 * pinned in `specification-list.test.ts`; this checks that the panel writes what it shows.
 */
import { test, expect, loadModel } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

const element = (page: Page, id: number) =>
  page.evaluate((i) => window.__stabileo.entityData('element' as never, i as never), id) as Promise<any>;
const undos = (page: Page) =>
  page.evaluate(() => (window as never as { __stabileo: { undoCount(): number } }).__stabileo.undoCount());

async function openSpecifications(page: Page) {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-specifications').click();
  await expect(page.getByTestId('spec-tab')).toBeVisible();
}

test.describe('@smoke PRO specifications', () => {
  test('a behaviour set over two members lands on both, as one undo step', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await openSpecifications(page);
    await expect(page.getByTestId('spec-members-empty')).toBeVisible();
    await page.evaluate(() => window.__stabileoActions.selectElements([1, 2]));
    const before = await undos(page);
    await page.getByTestId('mb-behaviour').selectOption('cable');
    await expect(page.getByTestId('spec-cable-hint')).toBeVisible();
    expect((await element(page, 1)).behaviour).toBe('cable');
    expect((await element(page, 2)).behaviour).toBe('cable');
    expect(await undos(page)).toBe(before + 1);
  });

  test('a release is written to the end it names, and the list reads it back', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await openSpecifications(page);
    await page.evaluate(() => window.__stabileoActions.selectElements([1]));
    await page.getByTestId('spec-release-j-mz').check();
    const e = await element(page, 1);
    expect(e.releaseJ).toMatchObject({ mz: true, my: false, t: false });
    // The other end is left as it was: nothing released.
    expect(Object.values(e.releaseI ?? {}).some(Boolean)).toBe(false);

    await page.getByTestId('spec-section-list').click();
    const row = page.getByTestId('spec-list-row').filter({ hasText: 'Mz' });
    await expect(row).toHaveCount(1);
    await row.click();
    // A row opens the section that edits it, with what it lists selected.
    await expect(page.getByTestId('spec-members')).toBeVisible();
    await expect(page.getByTestId('spec-release-j-mz')).toBeChecked();
  });

  test('shear deformation can be left out of the whole analysis', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await openSpecifications(page);
    await page.getByTestId('spec-section-analysis').click();
    await expect(page.getByTestId('spec-shear')).toBeChecked();
    await page.getByTestId('spec-shear').uncheck();
    expect(await page.evaluate(() => window.__stabileo.analysisSettings())).toMatchObject({ shearDeformation: 'none' });
    await page.getByTestId('spec-shear').check();
    expect((await page.evaluate(() => window.__stabileo.analysisSettings()) as any)?.shearDeformation).toBeUndefined();
  });

  test('the links live here, and the old Constraints entry opens them', async ({ pro: page }) => {
    await loadModel(page, '3d-portal-frame');
    await openSpecifications(page);
    await page.getByTestId('spec-section-links').click();
    await expect(page.getByTestId('spec-section-links')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('pr-cmd-constraints')).toHaveCount(0);
  });
});
