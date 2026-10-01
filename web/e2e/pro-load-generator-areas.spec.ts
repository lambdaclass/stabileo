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

test.describe('@smoke the seismic action: modal method, vertical component, torsion', () => {
  test('modal response spectrum from the dialog: modes, the derivation, the eccentric cases', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-design').click();
    await expect(page.getByTestId('design-toolbar')).toBeVisible();
    const d = page.locator('details').filter({ hasText: 'Project regulations' }).first();
    await d.locator('summary').first().click();
    await page.getByTestId('role-select-seismic').selectOption('inpres103-2018');
    await page.getByTestId('pending-review-in-loads').click();
    await page.getByRole('button', { name: /Auto-generate from code/i }).click();
    await page.getByTestId('al-enable-seismic').check();
    await page.getByTestId('al-seismic-method-select').selectOption('modal');
    await page.getByTestId('al-seismic-torsion').selectOption('medium');
    await expect(page.getByTestId('al-seismic-vertical')).toBeChecked();
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-apply-error')).toHaveCount(0);
    await expect(page.getByTestId('al-preview')).toContainText(/Modal response spectrum along X/);
    await expect(page.getByTestId('al-preview')).toContainText(/Vertical component/);
    await page.getByTestId('al-apply').click();
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names.filter((n) => /^Seismic X \(\+5 % eccentricity\)|^Seismic X \(−5 % eccentricity\)/.test(n))).toHaveLength(2);
  });
});

test.describe('@smoke wind on other structures and the cladding table', () => {
  test('a closed building shows the cladding pressures; a free roof makes its own cases', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('pro-auto-loads-btn').click();
    await page.getByTestId('al-enable-wind').check();
    await page.getByTestId('al-cladding').locator('summary').click();
    await expect(page.getByTestId('al-cladding-table').locator('tbody tr')).not.toHaveCount(0);
    await page.getByTestId('al-wind-kind').selectOption('freeRoof');
    await expect(page.getByTestId('al-cladding')).toHaveCount(0);
    await page.getByTestId('al-preview-btn').click();
    await page.getByTestId('al-apply').click();
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names.some((n) => /free roof, case A/.test(n))).toBe(true);
  });
});
