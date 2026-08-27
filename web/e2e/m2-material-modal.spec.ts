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
  /*
   * The trigger is visible, not behind a disclosure.
   *
   * This helper used to open a collapsed `<details>` first — the panel hid an inline picker the
   * height of the tab, and the button that opens this dialog was inside it. With the inline
   * picker gone (B-01) a disclosure would be a click that reveals a button, so the button is the
   * panel. The two lines this helper lost are the measure of the step that was removed.
   */
  await expect(page.getByTestId('pro-add-material-panel')).toBeVisible();
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

/**
 * B-01: the dialog is the only way to add a material, and it lost nothing on the way.
 *
 * The tab used to carry three controls that added a material. Two of them were catalogue paths
 * onto the same conversion, so removing the inline strip cost the user nothing but a poorer view
 * of the same rows. The third — a hand-entered material — was exclusive, so it moved into the
 * dialog as a second division. These tests are the pair: nothing else on the tab adds a
 * material, and the capability that moved still works.
 */
test.describe('one way in', () => {
  test('the tab offers exactly one control that adds a material', async ({ page }) => {
    await openMaterialsTab(page);
    const panel = page.getByTestId('pro-add-material-panel');
    // One button in the region, and it is the one that opens the dialog.
    await expect(panel.locator('button')).toHaveCount(1);
    await expect(panel.getByTestId('pro-open-material-modal')).toBeVisible();
  });

  /*
   * The inline strip and its search are gone from the tab entirely — not merely collapsed. The
   * ids belong to the dialog now, so finding either OUTSIDE the dialog is the regression.
   */
  test('no inline catalogue survives on the tab', async ({ page }) => {
    await openMaterialsTab(page);
    await expect(page.getByTestId('pro-material-modal')).toHaveCount(0);
    await expect(page.getByTestId('material-list')).toHaveCount(0);
    await expect(page.getByTestId('material-search')).toHaveCount(0);
    await expect(page.getByTestId('material-custom')).toHaveCount(0);
    for (const c of ['acero', 'hormigon']) {
      await expect(page.getByTestId(`material-cat-${c}`)).toHaveCount(0);
    }
  });

  test('the count on the tab is what says a material was added', async ({ page }) => {
    await openMaterialsTab(page);
    /*
     * Counted by the per-row aggregate input rather than by `<tr>`, because the empty table
     * renders one row of its own — a `colspan` cell saying there are no materials. Counting
     * rows would report 1 for zero materials and the delta would still be 1, so the test would
     * pass whether or not the material landed.
     */
    const count = () => page.locator('[data-testid^="mat-aggregate-"]').count();
    const before = await count();
    await page.getByTestId('pro-open-material-modal').click();
    await page.getByTestId('material-cat-hormigon').click();
    await page.getByTestId('material-row-0').click();
    await expect(page.getByTestId('pro-material-modal')).toBeHidden();
    expect(await count()).toBe(before + 1);
  });
});

test.describe('the hand-entry division, which is the capability that moved', () => {
  async function openCustom(page: Page): Promise<void> {
    await openModal(page);
    await page.getByTestId('material-division-custom').click();
    await expect(page.getByTestId('material-custom')).toBeVisible();
  }

  test('the tab strip is there, and reaches the form', async ({ page }) => {
    await openModal(page);
    await expect(page.getByTestId('material-division-catalogue')).toBeVisible();
    await expect(page.getByTestId('material-division-custom')).toBeVisible();
    await page.getByTestId('material-division-custom').click();
    await expect(page.getByTestId('material-custom')).toBeVisible();
    // The catalogue's own filters belong to the catalogue division and go with it.
    await expect(page.getByTestId('material-list')).toHaveCount(0);
    await expect(page.getByTestId('grade-list')).toHaveCount(0);
  });

  test('a filled form adds the material, with the name that was typed', async ({ page }) => {
    await openCustom(page);
    await page.getByTestId('material-custom-name').fill('Acero S275 obra');
    await page.getByTestId('material-custom-e').fill('210000');
    await page.getByTestId('material-custom-nu').fill('0.3');
    await page.getByTestId('material-custom-rho').fill('78.5');
    await page.getByTestId('material-custom-fy').fill('275');
    await expect(page.getByTestId('material-apply')).toBeEnabled();
    await page.getByTestId('material-apply').click();
    await expect(page.getByTestId('pro-material-modal')).toBeHidden();
    await expect(page.locator('.mat-table')).toContainText('Acero S275 obra');
  });

  /*
   * The empty form cannot write, and it says why. A disabled button on its own leaves the user
   * guessing which of five fields is the problem.
   */
  test('refuses an incomplete form and names what is missing', async ({ page }) => {
    await openCustom(page);
    await expect(page.getByTestId('material-apply')).toBeDisabled();
    await expect(page.getByTestId('material-custom-problem')).not.toBeEmpty();
    await page.getByTestId('material-custom-name').fill('X');
    // Still refused: the name alone is not a material.
    await expect(page.getByTestId('material-apply')).toBeDisabled();
  });

  /*
   * The bound this division adds over the form it replaces. `nu = 3` is a negative bulk or shear
   * modulus, and the inline form checked only `isNaN`, so it reached the model.
   */
  test('refuses a Poisson ratio the solver would take and should not', async ({ page }) => {
    await openCustom(page);
    await page.getByTestId('material-custom-name').fill('Imposible');
    await page.getByTestId('material-custom-e').fill('210000');
    await page.getByTestId('material-custom-rho').fill('78.5');
    await page.getByTestId('material-custom-nu').fill('3');
    await expect(page.getByTestId('material-apply')).toBeDisabled();
    await page.getByTestId('material-custom-nu').fill('0.3');
    await expect(page.getByTestId('material-apply')).toBeEnabled();
  });

  /* A decimal comma is what a Spanish keyboard produces, and `parseFloat('0,3')` is `0`. */
  test('reads a decimal comma', async ({ page }) => {
    await openCustom(page);
    await page.getByTestId('material-custom-name').fill('Coma');
    await page.getByTestId('material-custom-e').fill('210000');
    await page.getByTestId('material-custom-rho').fill('78,5');
    await page.getByTestId('material-custom-nu').fill('0,3');
    await expect(page.getByTestId('material-apply')).toBeEnabled();
  });

  /*
   * Focus and the keyboard on the new division, which is the half a division tab is easiest to
   * break: the arrow keys steer the catalogue list, and on a form they belong to the caret.
   */
  /*
   * The arrow keys steer the catalogue LIST. On this division there is no list and they belong to
   * the caret, so the dialog has to stop intercepting them — otherwise Home and the arrows would
   * silently do nothing inside a text field.
   *
   * Focus is NOT asserted to jump to the first field on a division change: the dialog moves focus
   * on the open transition only, which is what the section modal does and what keeps a
   * focus-stealing effect out of both. The user clicks or Tabs in, and from there the keyboard has
   * to behave.
   */
  test('the arrows and Home stay with the caret, not with the list', async ({ page }) => {
    await openCustom(page);
    const name = page.getByTestId('material-custom-name');
    await name.click();
    await expect(name).toBeFocused();
    await name.fill('ABC');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('-');
    await expect(name).toHaveValue('A-BC');
  });

  /* Focus is inside the dialog throughout, which is the property that does hold. */
  test('focus never leaves the dialog on this division', async ({ page }) => {
    await openCustom(page);
    const modal = page.getByTestId('pro-material-modal');
    expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  });

  test('Escape closes it from the form, and focus comes back to the trigger', async ({ page }) => {
    await openCustom(page);
    await page.getByTestId('material-custom-name').click();
    await page.getByTestId('material-custom-name').fill('Algo');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pro-material-modal')).toBeHidden();
    // Restored to whatever opened the dialog — one frame later, hence the retrying expect.
    await expect(page.getByTestId('pro-open-material-modal')).toBeFocused();
  });

  test('focus cannot leave the dialog on this division either', async ({ page }) => {
    await openCustom(page);
    const modal = page.getByTestId('pro-material-modal');
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const inside = await modal.evaluate((el) => el.contains(document.activeElement));
      expect(inside, `focus left the dialog after ${i + 1} Tab presses`).toBe(true);
    }
  });

  /* The form starts blank next time, because the dialog is destroyed on close. */
  test('does not keep the previous draft', async ({ page }) => {
    await openCustom(page);
    await page.getByTestId('material-custom-name').fill('Primero');
    await page.keyboard.press('Escape');
    await page.getByTestId('pro-open-material-modal').click();
    await page.getByTestId('material-division-custom').click();
    await expect(page.getByTestId('material-custom-name')).toHaveValue('');
  });

  /* It states no grade, and says so where the decision is made. */
  test('says a hand-entered material declares no grade', async ({ page }) => {
    await openCustom(page);
    await expect(page.getByTestId('material-custom-caveat')).not.toBeEmpty();
  });
});

/**
 * The non-metals were not collateral damage. B-01 asked for it explicitly, because the inline
 * strip's default category was concrete and the dialog's is steel.
 */
test.describe('the non-metallic materials survive', () => {
  test('concrete and timber are still addable, through the dialog', async ({ page }) => {
    for (const cat of ['hormigon', 'madera']) {
      await openModal(page);
      await page.getByTestId(`material-cat-${cat}`).click();
      await expect(page.getByTestId('material-list')).toBeVisible();
      await expect(page.getByTestId('material-row-0')).toBeVisible();
      const name = await page.getByTestId('material-current').innerText();
      await page.getByTestId('material-apply').click();
      await expect(page.getByTestId('pro-material-modal')).toBeHidden();
      await expect(page.locator('.mat-table')).toContainText(name.trim());
    }
  });
});

/**
 * The generators keep the narrow selector: no hand-entry division, because their `onApply` keeps
 * a grade id and a custom material has none.
 */
test.describe('the generators are unaffected', () => {
  test('their material selector offers no hand-entry division', async ({ page }) => {
    await page.goto(PRO_URL);
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-generators').click();
    await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
    await page.getByTestId('gen-grade-trigger').click();
    await expect(page.getByTestId('pro-material-modal')).toBeVisible();
    await expect(page.getByTestId('material-division-custom')).toHaveCount(0);
    await expect(page.getByTestId('material-division-catalogue')).toHaveCount(0);
  });
});
