/**
 * An IFC file comes into PRO as a building: its classes mapped to kinds of element, slabs and
 * walls meshed as shells, storeys as levels. The reading is pinned in
 * `lib/ifc/__tests__/ifc-surfaces.test.ts`; this checks the dialog drives it.
 */
import { test, expect, ribbonCmd } from './fixtures';
import { BUILDING_IFC } from '../src/lib/ifc/__tests__/building-ifc';

test.describe('@smoke IFC import', () => {
  test('classes become elements, a class left out stays out, storeys become levels', async ({ pro: page }) => {
    await page.locator('input[type=file][accept=".ifc"]').setInputFiles({ name: 'building.ifc', mimeType: 'application/octet-stream', buffer: Buffer.from(BUILDING_IFC) });
    await expect(page.getByTestId('ifc-classes')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('ifc-class-IfcWall')).toHaveValue('wall');
    // What comes in, drawn before it does, by the kind each class becomes.
    const preview = page.getByTestId('ifc-preview-3d');
    await expect(preview.locator('polygon')).toHaveCount(2);
    await expect(preview.locator('figcaption')).not.toContainText(/left out|no se importa|não é importado/);
    await page.getByTestId('ifc-class-IfcWall').selectOption('ignore');
    await expect(preview.locator('polygon.k-ignore')).toHaveCount(1);
    await page.getByTestId('ifc-replace').click();
    const census = () => page.evaluate(() => window.__stabileo.modelCensus());
    expect((await census()).elements).toBeGreaterThan(0);

    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'physical');
    await expect(page.getByTestId('physical-filter-column')).toContainText('1');
    await expect(page.getByTestId('physical-filter-slab')).toContainText('1');
    await expect(page.getByTestId('physical-filter-wall')).toHaveCount(0);
    await page.getByTestId('pr-cmd-grid').click();
    await expect(page.getByTestId('grid-level-P1')).toBeVisible();
  });
});
