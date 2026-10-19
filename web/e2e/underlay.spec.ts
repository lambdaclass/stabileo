/**
 * A DXF plan laid at a level as a background drawing: its layers chosen, saved with the project and
 * undone. Reading and capture are pinned in `model/__tests__/underlay.test.ts`.
 */
import { test, expect } from './fixtures';
import { simplePlanDxf } from '../src/lib/cad/__tests__/dxf-fixture';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('@smoke background drawing', () => {
  test('a DXF plan is laid at a level and undone', async ({ pro: page }) => {
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-grid').click();
    await page.getByTestId('grid-heights').fill('3; 3');
    await page.getByTestId('grid-generate-levels').click();
    await page.getByTestId('underlay-file').setInputFiles({ name: 'plan.dxf', mimeType: 'application/dxf', buffer: Buffer.from(simplePlanDxf()) });
    await expect(page.getByTestId('underlay-setup')).toBeVisible();
    await page.getByTestId('underlay-unit').selectOption('m');
    await page.getByTestId('underlay-level').selectOption({ label: 'N1' });
    await page.getByTestId('underlay-lay').click();
    await expect(page.getByTestId('underlay-note')).toBeVisible();
    await expect(page.getByTestId('underlay-row-plan')).toBeVisible();
    // Nothing structural came in: it is a drawing.
    expect((await page.evaluate(() => window.__stabileo.modelCensus())).nodes).toBe(0);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(page.getByTestId('underlay-row-plan')).toHaveCount(0);
  });
});
