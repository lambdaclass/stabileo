/**
 * The slab editor's band commands: bars at an angle, the average of what the slab asks over the
 * band and along a line, a band moved, saved. The four layer sheets and their breakdown are pinned
 * in `store/__tests__/slab-layer-plans.test.ts`; the geometry in `slab-bands.test.ts`.
 */
import { test, expect, solveModel, computeDemands, openDeskStage, deskTab, ribbonCmd, placeFrameFromGrid } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('@slow slab bands, bar by bar', () => {
  test('an angled band, its averages, moved and saved', async ({ pro: page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A slab drawn as a physical element on a grid bay (the example models carry shells, not
    // physical slabs, and the strip design reads the physical slab), with a floor load on it.
    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'building');
    await page.getByTestId('grid-bays-x').fill('5');
    await page.getByTestId('grid-generate-x').click();
    await page.getByTestId('grid-bays-y').fill('4');
    await page.getByTestId('grid-generate-y').click();
    await page.getByTestId('grid-heights').fill('3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('grid-open-building').click();
    await placeFrameFromGrid(page);
    await page.getByTestId('building-tab-slabs').click();
    await page.getByTestId('building-place-slabs').click();
    await expect(page.getByTestId('building-result')).toContainText(/1 element/);
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('load-tab-floor').click();
    await page.getByTestId('fl-target').selectOption({ label: 'Slab · L1' });
    await page.getByTestId('fl-apply').click();
    await page.keyboard.press('Escape');
    await solveModel(page);
    await computeDemands(page);
    await openDeskStage(page);
    await deskTab(page, 'slab');
    await expect(page.getByTestId('slab-editor')).toBeVisible();
    const run = page.getByTestId('slab-design-run');
    if (await run.isVisible()) await run.click();
    const row = page.locator('[data-testid^="slab-row-"]').first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.click();
    if ((await page.locator('[data-testid^="slab-band-"][role="button"]').count()) === 0) await page.getByTestId('slab-add-band').click();
    await page.locator('[data-testid^="slab-band-"][role="button"]').first().dispatchEvent('click');
    await expect(page.getByTestId('slab-band-tools')).toBeVisible();
    await page.getByTestId('slab-band-angle').fill('30');
    await page.getByTestId('slab-band-angle').press('Enter');
    await page.getByTestId('slab-average-band').click();
    await expect(page.getByTestId('slab-average-band-result')).toContainText(/cm²\/m|elementos|elements/);
    await page.getByTestId('slab-average-line').click();
    await expect(page.getByTestId('slab-average-line-result')).toContainText(/cm²\/m|elementos|elements/);
    await page.getByTestId('slab-band-move').click();
    await page.getByTestId('slab-save').click();
    expect(errors).toEqual([]);
  });
});
