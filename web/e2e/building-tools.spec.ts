/**
 * Building on the grid in PRO: columns and beams between axes, then slabs in the bays, each a
 * declared physical element and each one undo step. The arithmetic is pinned in
 * `model/building/__tests__/build-on-grid.test.ts`; this checks the panel drives it.
 */
import { test, expect, ribbonCmd } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('@smoke building on the grid', () => {
  test('without a grid it says so; with one, a frame and its slabs become physical elements', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'building');
    await expect(page.getByTestId('building-no-grid')).toBeVisible();
    await page.getByTestId('building-open-grid').click();

    await page.getByTestId('grid-bays-x').fill('6');
    await page.getByTestId('grid-generate-x').click();
    await page.getByTestId('grid-bays-y').fill('5');
    await page.getByTestId('grid-generate-y').click();
    await page.getByTestId('grid-heights').fill('3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('grid-open-building').click();

    // A new section is made in the sections tab's own dialog.
    await page.getByTestId('building-col-new-section').click();
    await expect(page.getByTestId('pro-section-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pro-section-modal')).toBeHidden();

    // 2 × 2 intersections, one storey: 4 columns and 4 beams.
    await page.getByTestId('grid-frame-create').click();
    await expect(page.getByTestId('building-result')).toContainText('8');
    const census = () => page.evaluate(() => window.__stabileo.modelCensus());
    expect((await census()).elements).toBe(8);

    await page.getByTestId('building-place-slabs').click();
    await expect(page.getByTestId('building-result')).toContainText(/1 element/);
    expect((await census()).elements).toBeGreaterThan(8);

    await ribbonCmd(page, 'physical');
    await expect(page.getByTestId('physical-filter-column')).toContainText('4');
    await expect(page.getByTestId('physical-filter-beam')).toContainText('4');
    await expect(page.getByTestId('physical-filter-slab')).toContainText('1');

    // A floor load on the slab goes onto its shells.
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('load-tab-floor').click();
    await page.getByTestId('fl-target').selectOption({ label: 'Slab · L1' });
    await expect(page.getByTestId('fl-distribution')).toHaveValue('slab');
    const loadsBefore = (await census()).loads;
    await page.getByTestId('fl-apply').click();
    expect((await census()).loads).toBeGreaterThan(loadsBefore);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');

    // The slab undoes on its own: the beams it cut are whole again.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    expect((await census()).elements).toBe(8);
  });

  test('ramp, copy between levels, diaphragms and drawing declared members', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-bays-x').fill('6');
    await page.getByTestId('grid-generate-x').click();
    await page.getByTestId('grid-bays-y').fill('5');
    await page.getByTestId('grid-generate-y').click();
    await page.getByTestId('grid-heights').fill('3; 3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('grid-open-building').click();
    const census = () => page.evaluate(() => window.__stabileo.modelCensus());

    // The frame on the first storey only, then the first floor copied to the second.
    await page.getByTestId('building-level-to').selectOption({ label: 'N1' });
    await page.getByTestId('grid-frame-create').click();
    expect((await census()).elements).toBe(8);
    await page.getByTestId('building-copy-to-N2').check();
    await page.getByTestId('building-copy-run').click();
    await expect(page.getByTestId('building-result')).toContainText('8');
    expect((await census()).elements).toBe(16);

    await page.getByTestId('building-diaphragms').click();
    await expect(page.getByTestId('building-result')).toContainText('2');

    await page.getByTestId('building-place-ramp').click();
    await expect(page.getByTestId('building-result')).toContainText(/1 element/);

    // Drawing a brace arms the member tool with the kind chosen.
    await page.getByTestId('building-draw-brace').click();
    await page.getByTestId('building-draw-start').click();
    await expect(page.getByTestId('pro-draw-bar')).toHaveAttribute('data-tool', 'element');
    await expect(page.getByTestId('drawn-kind-select')).toHaveValue('brace');
  });
});

