/**
 * Generated structures placed into the model rather than replacing it: at a point with the ghost,
 * regenerated in place from their group, and templates saved and placed again. The geometry is
 * pinned in `structures.test.ts`; regeneration in `generated-structures.test.ts`.
 */
import { test, expect } from './fixtures';
import { insertGenerated, pickGenerator, placeButton } from './generator-helpers';

test.use({ viewport: { width: 1280, height: 800 } });

async function openGenerators(page: import('@playwright/test').Page) {
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-generators').click();
  await pickGenerator(page, 'truss');
}

test.describe('@smoke generators into the model', () => {
  test('a plane frame at a point keeps the model, and regenerates in place', async ({ pro: page }) => {
    await page.evaluate(async () => { await window.__stabileoActions.loadExample('3d-portal-frame'); });
    const census = () => page.evaluate(() => window.__stabileo.modelCensus());
    const before = await census();
    await openGenerators(page);
    await pickGenerator(page, 'planeFrame');
    await page.getByTestId('gen-f-baysX').fill('6; 6');
    await page.getByTestId('gen-f-storeys').fill('3');
    await page.getByTestId('gen-out-atPoint').check();
    await page.getByTestId('gen-x').fill('30');
    // The schema names where the generated axes point: +X, then +Y once turned 90°.
    await expect(page.getByTestId('gen-schema-axes')).toContainText('+X');
    await page.getByTestId('gen-rot').fill('90');
    await expect(page.getByTestId('gen-schema-axes')).toContainText('+Y');
    await expect(page.getByTestId('gen-schema-rot')).toContainText('90');
    await page.getByTestId('gen-rot').fill('0');
    await page.getByTestId('gen-preview-point').click();
    await expect(page.getByTestId('placement-hud')).toBeVisible();
    expect((await census()).elements).toBe(before.elements);
    await page.getByTestId('gen-insert').click();
    await expect(page.getByTestId('gen-out-result')).toBeVisible();
    // 3 columns and 2 beams, added to the portal frame.
    expect((await census()).elements).toBe(before.elements + 5);

    await page.locator('[data-testid^="gen-edit-group-"]').first().click();
    await page.getByTestId('gen-f-baysX').fill('6; 6; 6');
    await page.getByTestId('gen-regenerate').click();
    expect((await census()).elements).toBe(before.elements + 7);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    expect((await census()).elements).toBe(before.elements + 5);
  });

  test('a template saved from the selection is placed again', async ({ pro: page }) => {
    await page.evaluate(async () => {
      await window.__stabileoActions.loadExample('3d-portal-frame');
      window.__stabileoActions.selectElements([1, 2]);
    });
    const census = () => page.evaluate(() => window.__stabileo.modelCensus());
    const before = await census();
    await openGenerators(page);
    // Templates are on the gallery, with the generators.
    await page.getByTestId('gen-back').click();
    await page.getByTestId('tpl-name').fill('Par');
    await page.getByTestId('tpl-save').click();
    await page.getByTestId('tpl-place-Par').click();
    await expect(page.getByTestId('placement-hud')).toBeVisible();
    await page.getByTestId('placement-x').fill('40');
    await page.getByTestId('placement-x').press('Enter');
    await expect(page.getByTestId('placement-hud')).toBeHidden();
    expect((await census()).elements).toBe(before.elements + 2);
  });
});
