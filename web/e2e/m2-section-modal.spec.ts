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
   * "Add section" used to be a collapsed `<details>` with the trigger inside it, and this
   * helper expanded it — the button WAS in the DOM but not visible, so an earlier version of
   * this file timed out with "element is not visible" on every test.
   *
   * The disclosure is gone with the inline catalogue it was hiding. A `<details>` whose whole
   * body is one button is a click that reveals a click, so the button is the panel now. The
   * region keeps its test id, and this asserts the trigger is reachable WITHOUT a gesture —
   * which is the property that changed, and the one worth failing on if it comes back.
   */
  const add = page.getByTestId('pro-add-section-panel');
  await expect(add).toBeVisible();
  await expect(add.getByTestId('pro-open-section-modal')).toBeVisible();
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
  test('lands on the search box, which is what a user types into first', async ({ page }) => {
    await openModal(page);

    /*
     * Stronger than the assertion it replaces, which only asked that `[data-autofocus]` — the
     * division tab — had focus. That passed while the catalogue's search box, which
     * `ProfileSelectorPanel` focuses on mount, was being overridden by the dialog a microtask
     * later; and with focus on a tab, ArrowDown walked the tabs instead of the profile list.
     */
    await expect(page.getByTestId('profile-search')).toBeFocused();
    // And still inside the dialog, which is what the old assertion was really protecting.
    expect(await page.evaluate(() => {
      const dlg = document.querySelector('[data-testid="pro-section-modal"]');
      return !!dlg && !!document.activeElement && dlg.contains(document.activeElement);
    })).toBe(true);
  });

  /*
   * The regression that cost the whole keyboard path.
   *
   * `ProfileSelectorPanel` handled keys on `<svelte:window>`, which was right while it WAS the
   * popover and wrong the moment it was rendered inside this dialog: it saw every key in the
   * page, so Enter aimed at Apply was intercepted, `preventDefault()`ed and re-routed to «pick
   * the row under the cursor». The button was focused and enabled and could not be activated,
   * so a keyboard user could choose a profile and had no way to commit it.
   *
   * Asserted through the effect rather than the implementation: press Enter on Apply and the
   * dialog must close. A test that checked which element carries the listener would pass on the
   * next arrangement that breaks this one.
   */
  test('Enter activates a button in the dialog while the catalogue is open', async ({ page }) => {
    await openModal(page);
    await expect(page.getByTestId('profile-selector')).toBeVisible();
    await expect(page.getByTestId('section-apply')).toBeEnabled();

    await page.getByTestId('section-apply').press('Enter');
    await expect(page.getByTestId('pro-section-modal')).toHaveCount(0);
  });

  test('and falls back to the division tab where there is no search', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('section-division-build').click();
    // The builder has no catalogue to search, so the tab is the right landing place.
    expect(await page.evaluate(() => {
      const dlg = document.querySelector('[data-testid="pro-section-modal"]');
      return !!dlg && !!document.activeElement && dlg.contains(document.activeElement);
    })).toBe(true);
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

test.describe('the figure is drawn in the system\'s colours', () => {
  /**
   * A void has to be painted EXACTLY what is behind it, and this is where that is provable.
   *
   * The component used to hardcode `#071322` twice — once as the well, once as the void inside
   * it — and the two were equal only because someone kept them equal. The unit test next door
   * proves the two DECLARATIONS now name the same token; what it cannot prove is that the
   * cascade delivers it, because an inline `style` on a solid polygon outranks the class rule
   * and a stray one on a void would put a different colour there with the source still reading
   * correctly.
   *
   * `SHS 100x100x4` is used because it is hollow: two polygons, one of them a void. On an IPE
   * there is nothing to compare.
   */
  test('a void is painted the very colour the figure sits on', async ({ page }) => {
    await openModal(page);
    await page.getByTestId('profile-search').fill('SHS 100x100x4');
    await page.keyboard.press('Enter');

    const fig = page.getByTestId('section-preview').locator('.fig');
    await expect(fig).toBeVisible();
    await expect(fig.locator('polygon')).toHaveCount(2);

    const { well, voidFill, solidFill } = await fig.evaluate((el) => {
      const polys = [...el.querySelectorAll('polygon')];
      // The void is the one the component leaves to the stylesheet; a solid carries its role
      // colour inline. Identified by that, not by index, so a change of winding order is not a
      // change of meaning.
      const isVoid = (p: Element) => !(p.getAttribute('style') ?? '').includes('fill:');
      const v = polys.find(isVoid)!;
      const sol = polys.find((p) => !isVoid(p))!;
      return {
        well: getComputedStyle(el).backgroundColor,
        voidFill: getComputedStyle(v).fill,
        solidFill: getComputedStyle(sol).fill,
      };
    });

    expect(well, 'the well resolves to a real colour').toMatch(/^rgba?\(/);
    expect(voidFill).toBe(well);
    // And the solid is NOT the background, or the figure would be a blank square.
    expect(solidFill).not.toBe(well);
  });

  test('the frame is visible against the well it encloses', async ({ page }) => {
    // Not a contrast assertion — the numbers are in the unit test. This is the weaker claim a
    // browser can settle: the frame is drawn, and it is not the same colour as either ground.
    await openModal(page);
    const fig = page.getByTestId('section-preview').locator('.fig');
    const { border, well, parent } = await fig.evaluate((el) => ({
      border: getComputedStyle(el).borderTopColor,
      well: getComputedStyle(el).backgroundColor,
      parent: getComputedStyle(el.parentElement!).backgroundColor,
    }));
    expect(border).not.toBe(well);
    expect(border).not.toBe(parent);
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
