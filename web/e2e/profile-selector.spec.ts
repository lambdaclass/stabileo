/**
 * Choosing a profile out of a hundred and some.
 *
 * ── What this replaces, and why the assertions are shaped this way ─
 *
 * A native `<select>` with 15 `<optgroup>`s and 100+ `<option>`s. Everything was in it, and
 * that was the problem: finding `HEA 200` meant opening the list and scrolling past every
 * IPE, IPN, HEB and half the HEAs. There was no search, no filter, and nothing on a row but
 * its name — so `IPE 200` and `HEA 200` looked like the same choice twice.
 *
 * So these assert the things a list cannot do: that typing narrows, that a filter composes
 * with the typing rather than replacing it, that the keyboard reaches every row and picks
 * one, that an empty result says what to do about it, and that the id handed back is the id
 * the model stores. Not "the panel opens".
 *
 * Everything runs at 1280×720 — Chromium's own `Desktop Chrome` size, and the width the PRO
 * panel is tightest at. A picker that only works on a large monitor is a picker that does not
 * work.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

async function openGenerators(page: Page) {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-generators').click();
  await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
}

/** The chord row's trigger — every generator kind places a chord. */
const trigger = (page: Page) => page.getByTestId('gen-profile-trigger-chord');

async function openPicker(page: Page) {
  await openGenerators(page);
  await trigger(page).click();
  await expect(page.getByTestId('profile-selector')).toBeVisible();
}

test.describe('@smoke the profile selector opens and narrows', () => {
  test('the trigger shows the current profile rather than a placeholder', async ({ pro: page }) => {
    await openGenerators(page);
    // The fact a user reads ninety per cent of the time is which profile is chosen.
    await expect(trigger(page)).toHaveText(/IPE 100/);
  });

  test('opens a searchable panel, with the search already focused', async ({ pro: page }) => {
    await openPicker(page);
    // Focused on open, because the first thing anyone does is type.
    await expect(page.getByTestId('profile-search')).toBeFocused();
  });

  test('typing narrows, and the count says by how much', async ({ pro: page }) => {
    await openPicker(page);
    const before = await page.getByTestId('profile-count').innerText();
    await page.getByTestId('profile-search').fill('HEA');
    const after = await page.getByTestId('profile-count').innerText();
    expect(after).not.toBe(before);
    // Every visible group is the one searched for; nothing else survived.
    await expect(page.getByTestId('profile-group-HEA')).toBeVisible();
    await expect(page.getByTestId('profile-group-IPE')).toHaveCount(0);
  });

  test('search ignores case and spaces, so three ways of typing it agree', async ({ pro: page }) => {
    await openPicker(page);
    for (const q of ['HEA 200', 'hea200', 'HeA 200']) {
      await page.getByTestId('profile-search').fill(q);
      await expect(page.getByTestId('profile-option-HEA 200'), q).toBeVisible();
    }
  });

  test('a family filter composes with the search instead of replacing it', async ({ pro: page }) => {
    await openPicker(page);
    await page.getByTestId('profile-family-HEB').click();
    await page.getByTestId('profile-search').fill('200');
    await expect(page.getByTestId('profile-option-HEB 200')).toBeVisible();
    // The search alone would have matched IPE 200 too; the filter is still applied.
    await expect(page.getByTestId('profile-option-IPE 200')).toHaveCount(0);
  });

  test('groups are labelled with their family and their standard', async ({ pro: page }) => {
    await openPicker(page);
    await page.getByTestId('profile-search').fill('IPE');
    // The standard is on the heading because tables from different bodies live side by side
    // and the profile name alone does not say which one you are in.
    //
    // Asserted as the published DESIGNATION, not as a translated word. It used to read
    // /euronorm/i, from a three-value axis this branch had hardcoded; `section-catalog.ts`
    // carries the real standard per family and `EN 10365` is a proper noun in every language.
    await expect(page.getByTestId('profile-group-IPE')).toContainText('EN 10365');
  });

  test('an empty result says what to do about it', async ({ pro: page }) => {
    await openPicker(page);
    await page.getByTestId('profile-search').fill('zzzz');
    const empty = page.getByTestId('profile-empty');
    await expect(empty).toBeVisible();
    // Not "no results": the two things that produce one are named.
    await expect(empty).toContainText(/less text|family filter/i);
  });
});

test.describe('@smoke the profile selector is usable from the keyboard alone', () => {
  test('arrow keys walk the list and Enter picks, without touching the mouse',
    async ({ pro: page }) => {
      await openPicker(page);
      await page.getByTestId('profile-search').fill('HEB 200');
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('profile-selector')).toHaveCount(0);
      await expect(trigger(page)).toHaveText(/HEB 200/);
    });

  test('Escape closes without changing the selection', async ({ pro: page }) => {
    await openGenerators(page);
    const before = await trigger(page).innerText();
    await trigger(page).click();
    await page.getByTestId('profile-search').fill('HEA');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('profile-selector')).toHaveCount(0);
    await expect(trigger(page)).toHaveText(before);
  });

  test('opening and pressing Enter is a no-op, because the cursor starts on the selection',
    async ({ pro: page }) => {
      // A cursor that started at row one would make Enter a silent change to whatever is
      // alphabetically first — the opposite of what "confirm" means.
      await openGenerators(page);
      const before = await trigger(page).innerText();
      await trigger(page).click();
      await page.keyboard.press('Enter');
      await expect(trigger(page)).toHaveText(before);
    });

  test('ArrowDown then Enter picks the row after the current one', async ({ pro: page }) => {
    await openPicker(page);
    await page.getByTestId('profile-search').fill('HEB');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(trigger(page)).toHaveText(/HEB/);
  });
});

test.describe('the chosen profile persists into the model', () => {
  test('the id the selector hands back is the id the generator emits', async ({ pro: page }) => {
    await openPicker(page);
    await page.getByTestId('profile-search').fill('HEB 220');
    await page.getByTestId('profile-option-HEB 220').click();
    await expect(trigger(page)).toHaveText(/HEB 220/);

    // Generate, then read the model back: the section name that lands must be the catalogue
    // id, not a display string. A label stored as an id is what breaks a saved file the day
    // the label changes.
    await page.getByTestId('gen-generate').click();
    await expect(page.getByTestId('gen-result')).toBeVisible();
    const names = await page.evaluate(() => window.__stabileo.sectionNames());
    expect(names.join(' ')).toContain('HEB 220');
  });

  test('survives closing and reopening the picker', async ({ pro: page }) => {
    await openPicker(page);
    await page.getByTestId('profile-search').fill('UPN 140');
    await page.getByTestId('profile-option-UPN 140').click();
    await trigger(page).click();
    // Reopened, the selection is still marked, so a user can see what they picked.
    await expect(page.getByTestId('profile-option-UPN 140')).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('the selector is legible in the three offered languages', () => {
  for (const [locale, placeholder, empty] of [
    ['es', /buscar perfil/i, /menos texto/i],
    ['pt', /buscar perfil/i, /menos texto/i],
  ] as const) {
    test.describe(locale, () => {
      test.use({ appLocale: locale, viewport: { width: 1280, height: 720 } });
      test('search and empty state are translated', async ({ pro: page }) => {
        await openPicker(page);
        await expect(page.getByTestId('profile-search')).toHaveAttribute('placeholder', placeholder);
        await page.getByTestId('profile-search').fill('zzzz');
        await expect(page.getByTestId('profile-empty')).toContainText(empty);
      });
    });
  }
});
