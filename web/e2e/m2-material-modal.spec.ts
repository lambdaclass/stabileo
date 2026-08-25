/**
 * The PRO material selector, as a user meets it.
 *
 * The unit tests prove the conversion — that a grade id travels with a choice, that an
 * aluminium preset is classified as aluminium rather than steel, that every property row
 * carries its authority. What they cannot prove is that the dialog is reachable, that focus
 * behaves, and that the sheet actually renders the three standards apart.
 */

import { test, expect, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';

async function openMaterialsTab(page: Page): Promise<void> {
  await page.goto(PRO_URL);
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-materials').click();
  // "Add material" is a collapsed `<details>`, and the trigger lives inside it.
  const add = page.getByTestId('pro-add-material-panel');
  await expect(add).toBeAttached();
  if (!(await add.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await add.locator('summary').click();
  }
}

async function openModal(page: Page): Promise<void> {
  await openMaterialsTab(page);
  await page.getByTestId('pro-open-material-modal').click();
  await expect(page.getByTestId('pro-material-modal')).toBeVisible();
}

test.describe('reaching the modal', () => {
  test('the trigger is on the materials tab and opens a dialog', async ({ page }) => {
    await openMaterialsTab(page);
    await expect(page.getByTestId('pro-open-material-modal')).toBeVisible();
    await page.getByTestId('pro-open-material-modal').click();
    const modal = page.getByTestId('pro-material-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-modal', 'true');
  });

  /*
   * The property is that focus is INSIDE the dialog, not that it is on one particular element.
   *
   * My first version asserted `[data-autofocus]` was focused and failed: on a metal category
   * the body is `GradePickerPanel`, which focuses its own search box on mount — and that is the
   * better place for focus to be, since it is the control a user reaches for. Pinning the
   * element would have meant either weakening the panel or accepting a worse landing spot.
   */
  test('focus lands inside and cannot escape', async ({ page }) => {
    const modal = page.getByTestId('pro-material-modal');
    await openModal(page);
    expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const inside = await modal.evaluate((el) => el.contains(document.activeElement));
      expect(inside, `focus left the dialog after ${i + 1} Tab presses`).toBe(true);
    }
  });

  test('Escape closes it', async ({ page }) => {
    await openModal(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pro-material-modal')).toBeHidden();
  });
});

/**
 * The modal has two bodies, because the two halves of the catalogue are two data models.
 *
 * A metal is described by a `GradeEntry` — thickness bands with the design code that tabulates
 * them, a family, a design-code filter, the pairing against what mills roll. Concrete and
 * timber have none of that; they are described by the catalogue row itself. So the metals get
 * `GradePickerPanel`, which already does all of it and is pinned by M1's own checklist, and the
 * non-metals get the preset list.
 *
 * My first version of this file assumed one body and failed five ways the moment the metal
 * branch landed — every assertion reached for `material-list` on the steel tab, where the grade
 * panel is. The app was right; the spec had not caught up.
 */
test.describe('the axes PRO adds', () => {
  test('offers every material category, not only the metals', async ({ page }) => {
    await openModal(page);
    for (const c of ['acero', 'conformado', 'inox', 'aluminio', 'hormigon', 'madera']) {
      await expect(page.getByTestId(`material-cat-${c}`)).toBeVisible();
    }
  });

  test('a metal category shows the grade panel, with its own filters', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('material-cat-acero').click();
    await expect(page.getByTestId('grade-list')).toBeVisible();
    await expect(page.getByTestId('grade-search')).toBeVisible();
    await expect(page.getByTestId('grade-region-AR')).toBeVisible();
    // And exactly one search box: the modal hides its own where the panel brings a better one.
    await expect(page.getByTestId('material-search')).toHaveCount(0);
  });

  test('a non-metal category shows the preset list', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('material-cat-hormigon').click();
    await expect(page.getByTestId('material-list')).toBeVisible();
    await expect(page.getByTestId('grade-list')).toHaveCount(0);
  });

  test('filters by origin on the non-metal list', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('material-cat-hormigon').click();
    await expect(page.getByTestId('material-region-AR')).toBeVisible();
    const before = await page.getByTestId('material-list').locator('button.row').count();
    await page.getByTestId('material-region-AR').click();
    const after = await page.getByTestId('material-list').locator('button.row').count();
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeGreaterThan(0);
  });

  test('search narrows the non-metal list', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('material-cat-hormigon').click();
    const before = await page.getByTestId('material-list').locator('button.row').count();
    await page.getByTestId('material-search').fill('H-25');
    const after = await page.getByTestId('material-list').locator('button.row').count();
    expect(after).toBeLessThan(before);
  });
});

test.describe('the data sheet, on the non-metal branch', () => {
  /*
   * The metals have the grade panel's own card, which M1's §1.11 already pins down to the band
   * standard. This sheet is the one the presets get, and its job is the same: no number without
   * its authority.
   */
  async function openConcrete(page: Page): Promise<void> {
    await openModal(page);
    await page.getByTestId('material-cat-hormigon').click();
    await expect(page.getByTestId('material-sheet')).toBeVisible();
  }

  test('shows the grade id, which is what makes a material classifiable', async ({ page }) => {
    await openConcrete(page);
    await expect(page.getByTestId('msheet-grade-id')).not.toHaveText('—');
  });

  test('every property row carries its authority', async ({ page }) => {
    await openConcrete(page);
    for (const key of ['e', 'nu', 'rho']) {
      await expect(page.getByTestId(`msheet-basis-${key}`)).not.toBeEmpty();
    }
  });

  /*
   * Concrete is identified but not described by the metal grade database. The sheet must say
   * which of the two it is, rather than showing an empty card.
   */
  test('says its grade lives outside the metal database', async ({ page }) => {
    await openConcrete(page);
    await expect(page.getByTestId('msheet-limitations')).toBeVisible();
    await expect(page.getByTestId('msheet-bands-absent')).toBeVisible();
  });
});

test.describe('choosing does not verify', () => {
  test('the caveat is present and no VERIFIED appears', async ({ page }) => {
    await openModal(page);
    await expect(page.getByTestId('material-caveat')).not.toBeEmpty();
    const text = (await page.getByTestId('pro-material-modal').innerText()).toUpperCase();
    expect(text).not.toContain('VERIFIED');
    expect(text).not.toContain('VERIFICADO');
  });
});
