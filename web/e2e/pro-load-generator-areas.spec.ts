import { test, expect, loadModel } from './fixtures';

/*
 * The regulation load generator puts area loads where the structure carries them: by the
 * tributary area of the panels its beams close, with the roof's own dead load and roof live
 * load Lr, and as one undo step.
 */
async function openDialog(page: import('@playwright/test').Page) {
  await loadModel(page, 'rc-design-qa-8');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  await page.getByTestId('pro-auto-loads-btn').click();
  await expect(page.getByTestId('dead-picker')).toBeVisible();
}

test.describe('@smoke area loads by tributary area, the roof apart', () => {
  test('by panels, with a maintenance roof: an Lr case, the derivation says how, one undo', async ({ pro: page }) => {
    await openDialog(page);
    await expect(page.getByTestId('al-gravity-mode')).toHaveValue('panels');
    await expect(page.getByTestId('al-roof')).toBeChecked();
    await expect(page.getByTestId('al-roof-use')).toHaveValue('maintenance');
    await expect(page.getByTestId('al-roof-lr')).toContainText(/Lr 0\.\d\d–0\.\d\d kN\/m²/);
    const before = await page.evaluate(() => window.__stabileo.modelCensus());
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-preview')).toContainText(/tributary area/i);
    await page.getByTestId('al-apply').click();
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names).toEqual(expect.arrayContaining(['Roof live']));
    const after = await page.evaluate(() => window.__stabileo.modelCensus());
    expect(after.loads).toBeGreaterThan(before.loads);
    // The whole application is one step back.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => page.evaluate(() => window.__stabileo.modelCensus().loads)).toBe(before.loads);
    expect((await page.evaluate(() => window.__stabileo.modelCensus())).combinations).toBe(before.combinations);
  });

  test('the uniform width is still there, and a roof with an occupancy carries L', async ({ pro: page }) => {
    await openDialog(page);
    await page.getByTestId('al-gravity-mode').selectOption('width');
    await page.getByTestId('al-roof-use').selectOption('occupancy');
    await page.getByTestId('al-roof-occupancy').selectOption('azotea_privada');
    await page.getByTestId('al-preview-btn').click();
    await page.getByTestId('al-apply').click();
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names).not.toContain('Roof live');
  });
});
