/**
 * The generator panel's surface: the preview dock, the number inputs, and the two modals.
 *
 * ── What only a browser can settle here ────────────────────────────
 *
 * Every item in this file is a layout or an input-behaviour fact. Whether a docked preview
 * actually stays on screen while the parameters scroll, whether removing the spin arrows also
 * removed the keyboard stepping, whether a row's modal opens with the arrangement the row
 * already had — none of those can be read off a source file, and all of them are the kind of
 * thing that looks right in the markup and is wrong in the viewport.
 *
 * The sizes are the ones the audit runs at, plus the two narrow ones: a panel that works at
 * 1280 and hides Generate at 820 is a panel that fails for anyone on a laptop with the browser
 * at half width.
 */

import { test, expect, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';

async function openGenerators(page: Page): Promise<void> {
  await page.goto(PRO_URL);
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-generators').click();
  await expect(page.getByTestId('pro-generators-panel')).toBeVisible();
}

/** Whether an element's box is inside the viewport, vertically. */
async function fullyVisible(page: Page, testId: string): Promise<boolean> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) return false;
  const h = page.viewportSize()!.height;
  return box.y >= 0 && box.y + box.height <= h + 1;
}

test.describe('the preview dock', () => {
  test('starts docked, with an explicit way to unlock it', async ({ page }) => {
    await openGenerators(page);
    const toggle = page.getByTestId('gen-dock-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('gen-preview')).toBeVisible();
  });

  /*
   * The failure this exists to prevent: the panel used to be one scrolling column, so scrolling
   * to the last parameter carried the drawing and the Generate button off the bottom.
   */
  test('survives scrolling the parameters', async ({ page }) => {
    await openGenerators(page);
    await page.getByTestId('gen-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByTestId('gen-preview')).toBeVisible();
    await expect(page.getByTestId('gen-generate')).toBeVisible();
  });

  test('unlocking returns it to the scrolling flow, and there is still only one of it', async ({ page }) => {
    await openGenerators(page);
    await page.getByTestId('gen-dock-toggle').click();
    await expect(page.getByTestId('gen-dock-toggle')).toHaveAttribute('aria-pressed', 'false');
    // One preview, one Generate — the snippet is rendered in one place or the other, never both.
    await expect(page.getByTestId('gen-preview')).toHaveCount(1);
    await expect(page.getByTestId('gen-generate')).toHaveCount(1);
  });

  for (const [w, h] of [[1280, 720], [1024, 700], [900, 700], [820, 700]] as const) {
    test(`covers neither the controls nor Generate at ${w}×${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openGenerators(page);
      // Generate lives in the dock, so it must be reachable without scrolling at every size.
      expect(await fullyVisible(page, 'gen-generate'), `Generate off screen at ${w}×${h}`).toBe(true);
      // And the parameters must still have room: the kind selector is the first control.
      await expect(page.getByTestId('gen-kind-truss')).toBeVisible();
    });
  }
});

test.describe('number inputs', () => {
  const anyNumber = (page: Page) => page.getByTestId('gen-panels');

  test('keep min, max, step and the spinbutton role', async ({ page }) => {
    await openGenerators(page);
    const input = anyNumber(page);
    await expect(input).toHaveAttribute('type', 'number');
    await expect(input).toHaveAttribute('min', '1');
    await expect(input).toHaveAttribute('step', '1');
    // `type="number"` is what gives the spinbutton role; removing the painted arrows must not
    // have replaced the control with a text box.
    await expect(input).toHaveRole('spinbutton');
  });

  test('still step with the keyboard', async ({ page }) => {
    await openGenerators(page);
    const input = anyNumber(page);
    await input.fill('4');
    await input.press('ArrowUp');
    await expect(input).toHaveValue('5');
    await input.press('ArrowDown');
    await expect(input).toHaveValue('4');
  });

  /*
   * The defect: WebKit draws the spinner INSIDE the box, and these fields are 4–6 rem wide with
   * right-aligned numbers, so the last digit rendered under a pair of arrows.
   *
   * Asserted on `appearance: textfield`, which is the mechanism that actually suppresses it.
   * My first version read `getComputedStyle(el, '::-webkit-inner-spin-button').appearance` and
   * failed — measured, Chromium does not expose that pseudo-element separately at all: it
   * returns the INPUT's own style, `width: 96px` and all. So that assertion was reading the
   * element while claiming to read the arrows.
   */
  test('draw no native arrows over the value', async ({ page }) => {
    await openGenerators(page);
    const appearance = await anyNumber(page).evaluate((el) => getComputedStyle(el).appearance);
    // `auto` is the default and is what paints the spinner.
    expect(appearance).toBe('textfield');
  });

  test('accept a partially typed value without snapping', async ({ page }) => {
    await openGenerators(page);
    const span = page.getByTestId('gen-panels');
    await span.fill('');
    // An empty field is a state a user passes through; it must not become a zero or a NaN.
    await expect(span).toHaveValue('');
  });
});

test.describe('a profile row', () => {
  test('shows the section, its family and its size before anything is opened', async ({ page }) => {
    await openGenerators(page);
    const meta = page.getByTestId('gen-profile-meta-chord');
    await expect(meta).toBeVisible();
    await expect(meta).toContainText('cm²');
  });

  test('opens the PRO section modal, not a second catalogue', async ({ page }) => {
    await openGenerators(page);
    await page.getByTestId('gen-profile-trigger-chord').click();
    await expect(page.getByTestId('pro-section-modal')).toBeVisible();
    // The same two divisions the sections tab has.
    await expect(page.getByTestId('section-division-standard')).toBeVisible();
    await expect(page.getByTestId('section-division-build')).toBeVisible();
  });

  /*
   * The row used to hold arrangement, gap and rotation as three separate controls beside the
   * trigger, so the row and the modal disagreed about what a section is. Now the whole
   * `ProfileSpec` goes in, which is what makes the round trip below possible at all.
   */
  test('carries composition, gap and rotation through the modal', async ({ page }) => {
    await openGenerators(page);
    await page.getByTestId('gen-profile-trigger-chord').click();
    await page.getByTestId('section-arrangement').selectOption('doubleBack');
    await page.getByTestId('section-gap').fill('12');
    await page.getByTestId('section-rotation').selectOption('90');
    await page.getByTestId('section-apply').click();
    await expect(page.getByTestId('pro-section-modal')).toBeHidden();

    // Reopening shows what was applied, rather than resetting to the default.
    await page.getByTestId('gen-profile-trigger-chord').click();
    await expect(page.getByTestId('section-arrangement')).toHaveValue('doubleBack');
    await expect(page.getByTestId('section-gap')).toHaveValue('12');
    await expect(page.getByTestId('section-rotation')).toHaveValue('90');
  });

  test('closes on Escape and gives focus back to the row', async ({ page }) => {
    await openGenerators(page);
    const trigger = page.getByTestId('gen-profile-trigger-chord');
    await trigger.click();
    await expect(page.getByTestId('pro-section-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pro-section-modal')).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('the material row', () => {
  test('opens the same PRO material flow as the materials tab', async ({ page }) => {
    await openGenerators(page);
    await page.getByTestId('gen-grade-trigger').click();
    await expect(page.getByTestId('pro-material-modal')).toBeVisible();
    // Metals only here: a truss emitter cannot build anything out of C25/30.
    await expect(page.getByTestId('material-cat-acero')).toBeVisible();
    await expect(page.getByTestId('material-cat-hormigon')).toHaveCount(0);
  });

  test('the deep grade panel is inside it, not replaced by it', async ({ page }) => {
    await openGenerators(page);
    await page.getByTestId('gen-grade-trigger').click();
    await expect(page.getByTestId('grade-list')).toBeVisible();
    await expect(page.getByTestId('grade-bands')).toBeAttached();
  });

  test('a chosen grade persists on the row', async ({ page }) => {
    await openGenerators(page);
    await page.getByTestId('gen-grade-trigger').click();
    await page.getByTestId('grade-search').fill('F-36');
    await page.getByTestId('grade-list').locator('[data-testid^="grade-option-"]').first().click();
    await expect(page.getByTestId('pro-material-modal')).toBeHidden();
    await expect(page.getByTestId('gen-grade-line')).toContainText('F-36');
  });

  /*
   * A36 stays the default and stays a STATE. It used to be a sentence explaining that the model
   * comes out with a provisional material and declares it as an assumption — accurate, and far
   * too long for a line that is true until the user picks anything.
   */
  test('A36 reads as a short provisional state, not a paragraph', async ({ page }) => {
    await openGenerators(page);
    const line = await page.getByTestId('gen-grade-line').innerText();
    expect(line).toMatch(/A36/);
    expect(line.length, `grade line is ${line.length} characters: ${line}`).toBeLessThan(90);
  });

  test('closes on Escape and gives focus back to the trigger', async ({ page }) => {
    await openGenerators(page);
    const trigger = page.getByTestId('gen-grade-trigger');
    await trigger.click();
    await expect(page.getByTestId('pro-material-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pro-material-modal')).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('the three languages', () => {
  for (const lang of ['es', 'en', 'pt'] as const) {
    test(`renders no raw keys in ${lang}`, async ({ page }) => {
      await page.goto(`${PRO_URL}&lang=${lang}`);
      await page.getByTestId('pr-stage-model').click();
      await page.getByTestId('pr-cmd-generators').click();
      const text = await page.getByTestId('pro-generators-panel').innerText();
      // A missing key renders as its own dotted name.
      expect(text).not.toMatch(/\bgenerator\.[a-z]+\.[a-zA-Z]+/);
      expect(text).not.toMatch(/\bmaterial\.[a-z]+\.[a-zA-Z]+/);
    });
  }
});
