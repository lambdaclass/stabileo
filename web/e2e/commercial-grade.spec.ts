/**
 * Choosing a profile brings its steel with it — through the real interface.
 *
 * The rule and the pairing table are covered by unit tests. What those cannot
 * see is the wiring, and the wiring is where this feature failed for months:
 * `commercialGrade` was written, tested, and called from nowhere, so the
 * default never applied; `profileFamily` was not stored on the path Basic
 * actually uses, so the note that depends on it could never fire; and the
 * pairing note itself lived in a panel desktop Basic does not render.
 *
 * Three separate defects, all invisible to a unit test and all obvious the
 * moment someone clicks the thing. So this drives the clicks.
 */

/*
 * `test` comes from ./fixtures, like every other spec here.
 *
 * Importing it straight from @playwright/test gives the runner a SECOND test
 * instance, and the whole suite then fails to load with "did not expect
 * test.describe() to be called here" — but only when more than one spec is
 * collected, so running this file alone passes and CI, which runs `--grep
 * @smoke` across all of them, does not.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function openBasic(page: Page) {
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!(window as never as { __stabileoActions?: unknown }).__stabileoActions, null, { timeout: 60_000 });
  await expect
    .poll(() => page.evaluate(() => (window as never as { __stabileo: { solverReady(): boolean } }).__stabileo.solverReady()), { timeout: 60_000 })
    .toBe(true);
}

async function loadFrame(page: Page) {
  await page.evaluate(() =>
    (window as never as { __stabileoActions: { loadExample(n: string): Promise<void> } })
      .__stabileoActions.loadExample('two-story-frame'));
  await page.waitForTimeout(800);
}

/**
 * Show one tab of the Model data panel.
 *
 * The ribbon carries Materials and Sections as commands but NOT Elements —
 * "Element" there is the drawing tool, a different thing with a nearly
 * identical name. So the panel is opened by whichever route exists and the tab
 * is then picked inside it, which is also what a user does.
 */
async function openTab(page: Page, label: string) {
  await page.evaluate((l) => {
    const cmd = [...document.querySelectorAll('.rb-cmd')]
      .find((e) => e.textContent?.trim() === l) as HTMLElement | undefined;
    if (cmd) { cmd.click(); return; }
    // No ribbon command for this tab: open the data panel, then the tab.
    const dataCmd = [...document.querySelectorAll('.rb-cmd')]
      .find((e) => /model data|^data$/i.test(e.textContent?.trim() ?? '')) as HTMLElement | undefined;
    dataCmd?.click();
  }, label);
  await page.waitForTimeout(400);
  await page.evaluate((l) => {
    const tab = [...document.querySelectorAll('.tabs button')]
      .find((e) => new RegExp(`^${l}`, 'i').test(e.textContent?.trim() ?? '')) as HTMLElement | undefined;
    tab?.click();
  }, label);
  await page.waitForTimeout(400);
}

/** Names in the Materials tab. */
async function materialNames(page: Page): Promise<string[]> {
  await openTab(page, 'Materials');
  return page.$$eval('table input', (els) => els.map((e) => (e as HTMLInputElement).value));
}

/**
 * Open the section picker for one row of the section table.
 *
 * By its button's accessible title, not by coordinates. The first draft of this
 * clicked a measured pixel, which is a test that passes on the machine it was
 * written on and reports a fake defect everywhere else — the row's position
 * depends on the panel's contents, and the panel's contents are the thing
 * under test.
 */
async function openPickerForSection(page: Page, row: number) {
  await openTab(page, 'Sections');
  await page.getByTitle('Change section').nth(row).click();
  await expect(page.locator('.profile-aside')).toBeVisible({ timeout: 10_000 });
}

/**
 * Put a catalogue profile into the section that the columns use.
 *
 * Row index 1 is the concrete section four members share, which is what makes
 * the material reassignment observable.
 */
async function chooseProfileForSharedSection(page: Page, code: RegExp, rowIndex: number, secRow = 1) {
  await openPickerForSection(page, secRow);
  await page.evaluate((src) => {
    const re = new RegExp(src);
    const btn = [...document.querySelectorAll('.code-btn')]
      .find((e) => re.test(e.textContent ?? '')) as HTMLElement | undefined;
    btn?.click();
  }, code.source);
  await page.waitForTimeout(400);
  await page.locator('.profile-row').nth(rowIndex).click();
  await page.waitForTimeout(800);
}

test.describe('the steel a profile arrives in', () => {
  test.use({ viewport: { width: 1500, height: 1000 } });

  test('@smoke choosing a CIRSOC profile brings F-24 with it', async ({ page }) => {
    await openBasic(page);
    await loadFrame(page);
    expect(await materialNames(page)).not.toContain('F-24');

    await chooseProfileForSharedSection(page, /CIRSOC/, 5);

    // The grade the family is rolled in, created once and shared.
    const after = await materialNames(page);
    expect(after).toContain('F-24');
    expect(after.filter((n) => n === 'F-24')).toHaveLength(1);
  });

  test('it is one undo step, not one per member', async ({ page }) => {
    await openBasic(page);
    await loadFrame(page);
    const undos = () => page.evaluate(() =>
      (window as never as { __stabileo: { undoCount(): number } }).__stabileo.undoCount());
    const before = await undos();

    await chooseProfileForSharedSection(page, /CIRSOC/, 5);

    // Four members change material and the section changes too. Reversing one
    // action must cost one press.
    expect(await undos()).toBe(before + 1);
  });

  test('it does not overwrite a steel that was chosen on purpose', async ({ page }) => {
    await openBasic(page);
    await loadFrame(page);

    // First choice: the members get F-24 from the catalogue.
    await chooseProfileForSharedSection(page, /CIRSOC/, 5);
    expect(await materialNames(page)).toContain('F-24');

    // Second choice on the same section. F-24 came from the catalogue, so it
    // is now a deliberate choice and must survive.
    await chooseProfileForSharedSection(page, /CIRSOC/, 7);
    const after = await materialNames(page);
    expect(after).toContain('F-24');
    expect(after.filter((n) => n === 'F-24')).toHaveLength(1);
  });

  test('@smoke the supply note appears where Basic can actually see it', async ({ page }) => {
    await openBasic(page);
    await loadFrame(page);

    // An IPN and an American steel: buildable, but not what any mill stocks.
    await chooseProfileForSharedSection(page, /CIRSOC/, 5);
    await openTab(page, 'Members');
    await expect(page.locator('.pairing-note')).toHaveCount(0);

    const select = page.locator('table select').first();
    const options = await select.evaluate((el) =>
      [...(el as HTMLSelectElement).options].map((o) => o.text));
    // Make an A992 exist by putting a W in the other section.
    if (!options.some((o) => /A992/.test(o))) {
      await openPickerForSection(page, 2);
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('.code-btn')]
          .find((e) => /AISC/.test(e.textContent ?? '')) as HTMLElement | undefined;
        btn?.click();
      });
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('.series-block button')]
          .find((e) => e.textContent?.trim() === 'W') as HTMLElement | undefined;
        btn?.click();
      });
      await page.waitForTimeout(400);
      await page.locator('.profile-row').nth(2).click();
      await page.waitForTimeout(800);
      await openTab(page, 'Members');
    }

    const opts2 = await page.locator('table select').first().evaluate((el) =>
      [...(el as HTMLSelectElement).options].map((o) => o.text));
    const idx = opts2.findIndex((o) => /A992/.test(o));
    expect(idx, 'an A992 material must exist by now').toBeGreaterThanOrEqual(0);
    await page.locator('table select').first().selectOption({ index: idx });
    await page.waitForTimeout(600);

    // Exactly one note, for the one member that departs from practice.
    await expect(page.locator('.pairing-note')).toHaveCount(1);
    await expect(page.locator('.pairing-note')).toContainText('IPN');
    await expect(page.locator('.pairing-note')).toContainText('F-24');
  });
});
