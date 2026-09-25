/**
 * The structural grid in PRO: axes typed as bays, levels as storey heights, columns and beams laid
 * between axes as one undo step, and a grid read off an example. The arithmetic is pinned in
 * `model/__tests__/grid.test.ts`; this checks the panel drives it.
 */
import { test, expect } from './fixtures';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('@smoke structural grid', () => {
  test('bays and heights become a grid, and a frame between axes undoes in one step', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-bays-x').fill('6; 7,5');
    await page.getByTestId('grid-generate-x').click();
    await page.getByTestId('grid-bays-y').fill('5');
    await page.getByTestId('grid-generate-y').click();
    await page.getByTestId('grid-heights').fill('3; 3');
    await page.getByTestId('grid-generate-levels').click();
    await expect(page.getByTestId('grid-axis-3')).toBeVisible();
    await expect(page.getByTestId('grid-axis-B')).toBeVisible();
    await expect(page.getByTestId('grid-level-N2')).toBeVisible();

    // 3 × 2 intersections, two storeys: 12 columns, 2 × (4 + 3) beams.
    await expect(page.getByTestId('grid-frame-create')).toContainText('26');
    await page.getByTestId('grid-frame-create').click();
    await expect(page.getByTestId('grid-frame-report')).toContainText('26');
    const census = () => page.evaluate(() => window.__stabileo.modelCensus());
    expect((await census()).elements).toBe(26);
    expect((await census()).nodes).toBe(18);

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    expect((await census()).elements).toBe(0);
    // The grid itself is still there: it was a step of its own.
    await expect(page.getByTestId('grid-axis-3')).toBeVisible();

    await page.getByTestId('grid-activate-N1').check();
    expect(await page.evaluate(() => window.__stabileo.nodeCreateZ())).toBe(3);
  });

  test('a floor load on a level goes to its beams by tributary area', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-bays-x').fill('6; 7,5');
    await page.getByTestId('grid-generate-x').click();
    await page.getByTestId('grid-bays-y').fill('5');
    await page.getByTestId('grid-generate-y').click();
    await page.getByTestId('grid-heights').fill('3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('grid-frame-create').click();

    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('load-tab-floor').click();
    await page.getByTestId('fl-target').selectOption({ label: 'N1' });
    await page.getByTestId('fl-q').fill('5');
    // Two panels, 13.5 × 5 m: 5 kN/m² × 67.5 m².
    await expect(page.getByTestId('fl-summary')).toContainText('2 panels');
    await expect(page.getByTestId('fl-summary')).toContainText('337.5 kN');
    const before = await page.evaluate(() => window.__stabileo.modelCensus().loads);
    await page.getByTestId('fl-apply').click();
    await expect(page.getByTestId('fl-applied')).toBeVisible();
    expect(await page.evaluate(() => window.__stabileo.modelCensus().loads)).toBeGreaterThan(before);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    expect(await page.evaluate(() => window.__stabileo.modelCensus().loads)).toBe(before);
  });

  test('a grid is read off an example', async ({ pro: page }) => {
    await page.evaluate(async () => { await window.__stabileoActions.loadExample('3d-portal-frame'); });
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-from-model').click();
    await expect(page.getByTestId('grid-dir-x').locator('tbody tr').first()).toBeVisible();
    await expect(page.getByTestId('grid-level-N1')).toBeVisible();
  });
});
