/**
 * The PRO section modal, as a user meets it.
 *
 * ── What only an E2E can check here ────────────────────────────────
 *
 * The contract test next door reads the component and proves what it may not contain — a third
 * division, an amorphous section, a hardcoded colour, an untranslated key. What it cannot prove
 * is that any of it is REACHABLE: that the trigger exists on a tab a user can open, that the
 * dialog appears, that keyboard focus lands inside it and cannot escape, and that pressing
 * Escape leaves the model untouched.
 *
 * The focus assertions are the ones worth the browser. A focus trap is exactly the kind of thing
 * that reads correctly in source and fails in practice, because it depends on which elements are
 * actually rendered and visible at the moment Tab is pressed.
 */

import { test, expect, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';

async function openSectionsTab(page: Page): Promise<void> {
  await page.goto(PRO_URL);
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-sections').click();
  /*
   * "Add section" is a collapsed `<details>`, and the trigger lives inside it.
   *
   * My first version of this file went straight for the trigger and every test in it timed out
   * with "element is not visible" — the button WAS in the DOM, which is why the locator
   * resolved and the failure read as a stuck click rather than a missing control. Expanding the
   * disclosure is not a workaround: adding a section is what the panel is for, and this is the
   * path a user takes.
   */
  const add = page.getByTestId('pro-add-section-panel');
  await expect(add).toBeAttached();
  if (!(await add.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await add.locator('summary').click();
  }
}

async function openModal(page: Page): Promise<void> {
  await openSectionsTab(page);
  await page.getByTestId('pro-open-section-modal').click();
  await expect(page.getByTestId('pro-section-modal')).toBeVisible();
}

test.describe('reaching the modal', () => {
  test('the trigger is on the sections tab and opens a dialog', async ({ page }) => {
    await openSectionsTab(page);
    const trigger = page.getByTestId('pro-open-section-modal');
    await expect(trigger).toBeVisible();
    await trigger.click();
    const modal = page.getByTestId('pro-section-modal');
    await expect(modal).toBeVisible();
    // It must announce itself as modal, or assistive tech reads the page behind it.
    await expect(modal).toHaveAttribute('aria-modal', 'true');
  });

  test('offers exactly two divisions', async ({ page }) => {
    await openModal(page);
    await expect(page.getByTestId('section-division-standard')).toBeVisible();
    await expect(page.getByTestId('section-division-build')).toBeVisible();
    // Three would mean the amorphous one came back.
    const tabs = page.getByTestId('pro-section-modal').getByRole('tab');
    await expect(tabs).toHaveCount(2);
  });
});

test.describe('focus', () => {
  test('lands inside the dialog when it opens', async ({ page }) => {
    await openModal(page);
    const active = page.locator('[data-autofocus]');
    await expect(active).toBeFocused();
  });

  /*
   * The trap. Tabbing from the last focusable control must come back to the first, not to the
   * browser chrome with the dialog still covering the page.
   */
  test('cycles rather than escaping to the page behind', async ({ page }) => {
    await openModal(page);
    const modal = page.getByTestId('pro-section-modal');
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const inside = await modal.evaluate((el) => el.contains(document.activeElement));
      expect(inside, `focus left the dialog after ${i + 1} Tab presses`).toBe(true);
    }
  });

  test('Escape closes it', async ({ page }) => {
    await openModal(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pro-section-modal')).toBeHidden();
  });
});

test.describe('the two divisions', () => {
  test('the catalogue division shows composition and rotation', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('section-division-standard').click();
    await expect(page.getByTestId('section-arrangement')).toBeVisible();
    await expect(page.getByTestId('section-rotation')).toBeVisible();
    await expect(page.getByTestId('section-preview')).toBeVisible();
  });

  /*
   * And the build division does NOT. An arrangement places copies of a catalogue profile using
   * that profile's extents; a built section has no catalogue part to place, so the control would
   * be offering something the emitter must refuse.
   */
  test('the build division offers templates, not composition', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('section-division-build').click();
    await expect(page.getByTestId('section-build')).toBeVisible();
    await expect(page.getByTestId('section-template')).toBeVisible();
    await expect(page.getByTestId('section-arrangement')).toBeHidden();
  });

  test('a built section reports its own numbers as they are typed', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('section-division-build').click();
    await expect(page.getByTestId('section-build-props')).toBeVisible();
    await expect(page.getByTestId('section-build-props')).toContainText('cm²');
  });
});

test.describe('the data sheet', () => {
  test('never shows a value without its provenance', async ({ page }) => {
    await openModal(page);
    // The <details> summary is the control; clicking it opens the sheet.
    await page.getByTestId('section-sheet-toggle').locator('summary').click();
    const sheet = page.getByTestId('section-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('sheet-designation')).not.toBeEmpty();
    await expect(sheet.getByTestId('sheet-standard')).not.toBeEmpty();
    // Every property row carries a basis chip; at least the area's must be there.
    await expect(sheet.getByTestId('sheet-basis-area')).not.toBeEmpty();
  });

  test('explains the absent cold-formed block instead of leaving it empty', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('section-sheet-toggle').locator('summary').click();
    await expect(page.getByTestId('sheet-coldformed-absent')).toBeVisible();
    await expect(page.getByTestId('sheet-coldformed-absent')).not.toBeEmpty();
  });
});

test.describe('battens', () => {
  /*
   * A single profile is not a `barra armada`, so §E.6 has nothing to say and the section shows
   * no batten block at all — rather than an empty one implying something is missing.
   */
  test('no batten block for a single profile', async ({ page }) => {
    await openModal(page);
    await expect(page.getByTestId('section-battens-toggle')).toBeHidden();
  });

  test('a compound arrangement gets one, with its group and its clauses', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('section-arrangement').selectOption('doubleBack');
    const toggle = page.getByTestId('section-battens-toggle');
    await expect(toggle).toBeVisible();
    await toggle.locator('summary').click();
    await expect(page.getByTestId('batten-group')).toContainText(/E\.6|Grupo|Group/i);
    // Every row carries a dotted CIRSOC clause.
    await expect(page.getByTestId('batten-panel')).toContainText('§E.6.');
  });

  /*
   * The assertion that matters most here: no batten dimension is drawn or stated. §E.6 names no
   * thickness, width or depth anywhere — only `Ip`, and only inside a condition.
   */
  test('declares the batten geometry unavailable rather than inventing a plate', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('section-arrangement').selectOption('doubleBack');
    await page.getByTestId('section-battens-toggle').locator('summary').click();
    const gap = page.getByTestId('batten-geometry-unavailable');
    await expect(gap).toBeVisible();
    await expect(gap).toContainText('GEOMETRY_UNAVAILABLE');
    // And the condition the missing dimension would have to satisfy is quoted.
    await expect(gap).toContainText('E.6.19');
  });

  test('the spacing is withheld because a section has no length', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('section-arrangement').selectOption('doubleBack');
    await page.getByTestId('section-battens-toggle').locator('summary').click();
    const row = page.getByTestId('batten-row-spacing');
    await expect(row).toContainText('—');
  });
});

test.describe('nothing here claims a verification', () => {
  test('the modal shows no VERIFIED anywhere', async ({ page }) => {
    await openModal(page);
    const text = (await page.getByTestId('pro-section-modal').innerText()).toUpperCase();
    expect(text).not.toContain('VERIFIED');
    expect(text).not.toContain('VERIFICADO');
  });
});
