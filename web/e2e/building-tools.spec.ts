/**
 * Building on the grid in PRO: the levels and the grid inside the panel, columns and beams between
 * axes each from its own tool, then slabs in the bays, each a declared physical element and each one
 * undo step. The arithmetic is pinned in
 * `model/building/__tests__/build-on-grid.test.ts`; this checks the panel drives it.
 */
import { test, expect, ribbonCmd, placeFrameFromGrid } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('@smoke building on the grid', () => {
  test('without a grid it opens on the grid; with one, a frame and its slabs become physical elements', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'building');
    // The general data first, then the levels and the grid: the other tools wait for it.
    await expect(page.getByTestId('building-general')).toBeVisible();
    await expect(page.getByTestId('building-tab-levels')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('building-tab-columns')).toBeDisabled();

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

    // 2 × 2 intersections, one storey: 4 columns, then 4 beams.
    await expect(page.getByTestId('building-tab-columns')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('building-columns-place')).toContainText('4');
    // Stated with the placement: buckling factors and a pinned head.
    await page.getByTestId('building-col-k-strong').fill('1.2');
    await page.getByTestId('building-col-k-weak').fill('1.5');
    await page.getByTestId('building-col-pinned-head').check();
    await page.getByTestId('building-columns-place').click();
    await expect(page.getByTestId('building-result')).toContainText('4');
    const statements = await page.evaluate(() => window.__stabileo.elementIds().map((id) => window.__stabileo.memberStatement(id)));
    expect(statements).toHaveLength(4);
    for (const st of statements) {
      expect(st).toMatchObject({ kStrong: 1.2, kWeak: 1.5 });
      expect(st!.releaseJ?.my || st!.releaseI?.my).toBe(true);
    }
    await page.getByTestId('building-tab-beams').click();
    await expect(page.getByTestId('building-beams-place')).toContainText('4');
    await page.getByTestId('building-beams-place').click();
    const census = () => page.evaluate(() => window.__stabileo.modelCensus());
    expect((await census()).elements).toBe(8);

    // The slab waits for its mesh: one shell, the beams whole.
    await page.getByTestId('building-tab-slabs').click();
    await expect(page.getByTestId('building-slab-mesh-solve')).toBeChecked();
    await page.getByTestId('building-place-slabs').click();
    await expect(page.getByTestId('building-result')).toContainText(/1 element/);
    expect((await census()).elements).toBe(8);
    await expect(page.getByTestId('building-slabs-waiting')).toBeVisible();

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

    // The slab undoes on its own.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    expect((await census()).elements).toBe(8);

    // Placed again and solved: the analysis meshes it (the beams cut where the mesh meets them),
    // and it goes back to one shell per panel on request.
    await ribbonCmd(page, 'building');
    await page.getByTestId('building-tab-slabs').click();
    await page.getByTestId('building-place-slabs').click();
    await page.evaluate(async () => { await window.__stabileoActions.solve(); });
    await expect.poll(async () => (await census()).elements).toBeGreaterThan(8);
    await expect(page.getByTestId('building-slabs-simplify')).toBeVisible();
    await page.getByTestId('building-slabs-simplify').click();
    expect((await census()).elements).toBe(8);
    await expect(page.getByTestId('building-slabs-waiting')).toBeVisible();
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
    await placeFrameFromGrid(page, { levelTo: 'N1' });
    expect((await census()).elements).toBe(8);
    await page.getByTestId('building-tab-tools').click();
    await page.getByTestId('building-copy-to-N2').check();
    await page.getByTestId('building-copy-run').click();
    await expect(page.getByTestId('building-result')).toContainText('8');
    expect((await census()).elements).toBe(16);

    await page.getByTestId('building-diaphragms').click();
    await expect(page.getByTestId('building-result')).toContainText('2');

    await page.getByTestId('building-place-ramp').click();
    await expect(page.getByTestId('building-result')).toContainText(/1 element/);

    // Drawing a brace, from the beams tool, arms the member tool with the kind chosen.
    await page.getByTestId('building-tab-beams').click();
    await page.getByTestId('building-draw-brace').click();
    await page.getByTestId('building-beams-draw').click();
    await expect(page.getByTestId('pro-draw-bar')).toHaveAttribute('data-tool', 'element');
    await expect(page.getByTestId('drawn-kind-select')).toHaveValue('brace');
  });
});

