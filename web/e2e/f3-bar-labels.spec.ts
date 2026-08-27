/**
 * F3a — a bar is named by its mark, and the engine's key stops being the label.
 *
 * The list rendered `bar.id` in a monospace column: `col-61:ties:stirrup:0.000`. That string
 * encodes an owner tag, a generator family, a slot name and a station coordinate — the right
 * thing for a conflict record and the wrong thing for an engineer. The assertion that matters
 * is negative: whatever leads the row, it is not that.
 */

import { test, expect, loadModel, designAll } from './fixtures';
import type { Page } from '@playwright/test';

async function openBarList(page: Page) {
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  /*
   * The disclosure is opened directly rather than through the timeline, and that is worth
   * recording: `cmd-generate-detailing` lives in `DesignToolbar`, which F2 moved inside the
   * DISEÑAR stage — so navigating to DETALLE through the strip closes the stage that holds the
   * command. Opening the section leaves DISEÑAR open, which is how `h1e-refused-state` already
   * reaches it. Where the pipeline commands belong is a real question and it is F3b's.
   */
  await page.getByTestId('detailing-disclosure').locator('> summary').click();
  const generate = page.getByTestId('cmd-generate-detailing');
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect
    .poll(() => page.evaluate(() =>
      (window as unknown as { __stabileo: { detailingAssemblies(): unknown[] } })
        .__stabileo.detailingAssemblies().length), { timeout: 120_000 })
    .toBeGreaterThan(0);
  await page.getByTestId('bar-list').locator('> summary').click();
  await expect(page.getByTestId('bar-list').locator('li').first()).toBeVisible();
}

test.describe('@slow the bar list leads with the mark', () => {
  test.slow();
  test.use({ viewport: { width: 1280, height: 720 } });

  test('no row leads with a technical id', async ({ pro: page }) => {
    await openBarList(page);
    const leads = await page.getByTestId('bar-list').locator('li .bar-mark').allInnerTexts();
    expect(leads.length, 'the list has rows').toBeGreaterThan(0);
    for (const lead of leads) {
      expect(lead.trim(), `"${lead}" leads the row and must not be an engine key`)
        .not.toMatch(/:/);
      expect(lead.trim().length, 'and it is not blank').toBeGreaterThan(0);
    }
  });

  /*
   * Kept, not hidden. Two different people need the two forms, and dropping the key would trade
   * one unusable list for another.
   */
  test('the technical id is still on the row, one level down', async ({ pro: page }) => {
    await openBarList(page);
    const ids = page.getByTestId('bar-list').locator('li code.bar-id');
    expect(await ids.count(), 'every row carries its key').toBeGreaterThan(0);
    expect((await ids.first().innerText()).trim(), 'and it IS the key').toMatch(/:/);
  });

  test('the mark and the key are different things on the same row', async ({ pro: page }) => {
    await openBarList(page);
    const row = page.getByTestId('bar-list').locator('li').first();
    const lead = (await row.locator('.bar-mark').innerText()).trim();
    const key = (await row.locator('code.bar-id').innerText()).trim();
    expect(lead).not.toBe(key);
  });
});
