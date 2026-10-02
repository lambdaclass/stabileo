import { test, expect, loadModel, alSection } from './fixtures';

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
    await alSection(page, 'applying');
    await expect(page.getByTestId('al-gravity-mode')).toHaveValue('panels');
    await alSection(page, 'roof');
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
    await alSection(page, 'applying');
    await page.getByTestId('al-gravity-mode').selectOption('width');
    await alSection(page, 'roof');
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
    await alSection(page, 'seismic');
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
    await alSection(page, 'wind');
    await page.getByTestId('al-enable-wind').check();
    await expect(page.getByTestId('al-cladding-table').locator('tbody tr')).not.toHaveCount(0);
    await page.getByTestId('al-wind-kind').selectOption('freeRoof');
    await expect(page.getByTestId('al-cladding')).toHaveCount(0);
    await page.getByTestId('al-preview-btn').click();
    await page.getByTestId('al-apply').click();
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names.some((n) => /free roof, case A/.test(n))).toBe(true);
  });
});

test.describe('@smoke T, H and F from the dialog', () => {
  test('a temperature change makes a T case with its two combinations', async ({ pro: page }) => {
    await openDialog(page);
    await alSection(page, 'special');
    await page.getByTestId('al-thermal').check();
    await page.getByTestId('al-thermal-dt').fill('25');
    await page.getByTestId('al-preview-btn').click();
    await page.getByTestId('al-apply').click();
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names).toContain('Temperature');
  });
});

test.describe('@smoke combination rule templates kept in the browser', () => {
  test('saved from one project, added to another', async ({ pro: page }) => {
    const openRules = async () => {
      await page.getByTestId('pr-stage-model').click();
      await page.getByTestId('pr-cmd-loads').click();
      await page.getByTestId('load-tab-combos').click();
      await page.getByTestId('combo-rules-edit').click();
    };
    await loadModel(page, 'rc-design-qa-8');
    await openRules();
    await page.getByTestId('combo-rule-add').click();
    await page.getByTestId('combo-rule-r1-D').fill('1.4');
    await page.getByTestId('combo-rule-r1-D').press('Tab');
    await page.getByTestId('combo-library-name').fill('Office');
    await page.getByTestId('combo-library-save').click();
    await expect(page.getByTestId('combo-library-item')).toHaveCount(1);
    await page.getByTestId('al-cancel').click();

    await loadModel(page, '3d-portal-frame');
    await openRules();
    await expect(page.getByTestId('combo-library-item')).toContainText('Office');
    await page.getByTestId('combo-library-use').click();
    await expect(page.getByTestId('combo-rules')).toContainText('1.4 D');
  });
});

test.describe('@smoke the generator one section at a time', () => {
  test('each action says what it comes to, and the footer what Apply generates', async ({ pro: page }) => {
    await openDialog(page);
    await expect(page.getByTestId('al-nav-dead')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('al-nav-status-dead')).toContainText('kN/m²');
    await expect(page.getByTestId('al-nav-status-snow')).toHaveText('off');
    await expect(page.getByTestId('al-summary')).not.toContainText(/\bS\b/);
    await alSection(page, 'snow');
    await page.getByTestId('al-enable-snow').check();
    await expect(page.getByTestId('al-nav-status-snow')).toContainText('kN/m²');
    await expect(page.getByTestId('al-summary')).toContainText('S');
    // The preview takes the section's place, and a section chosen from it goes back to editing.
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-preview')).toBeVisible();
    await alSection(page, 'live');
    await expect(page.getByTestId('al-preview')).toHaveCount(0);
    await expect(page.getByTestId('al-live-patterns')).toHaveValue('all');
  });

  test('a parapet and a neighbouring structure drift snow onto the roof', async ({ pro: page }) => {
    await openDialog(page);
    await alSection(page, 'snow');
    await page.getByTestId('al-enable-snow').check();
    await page.getByTestId('al-snow-site').check();
    await page.getByTestId('al-snow-pg').fill('1.5');
    await page.getByTestId('al-snow-parapet').fill('1.2');
    await page.getByTestId('al-snow-parapet').blur();
    await page.getByTestId('al-snow-adjacent-add').click();
    await expect(page.getByTestId('al-snow-adjacent-0')).toBeVisible();
    await page.getByTestId('al-preview-btn').click();
    await page.getByTestId('al-derivation').locator('summary').click();
    await expect(page.getByTestId('al-derivation')).toContainText(/parapet on an edge/);
    await expect(page.getByTestId('al-derivation')).toContainText(/separate structure on \+X/);
  });
});

test.describe('@slow components and cladding above 20 m', () => {
  test('a seven-storey building takes Fig. 5.4-1, with qz at the element height', async ({ pro: page }) => {
    await loadModel(page, 'pro-edificio-7p');
    await page.getByTestId('pr-stage-model').click();
    await page.getByTestId('pr-cmd-loads').click();
    await page.getByTestId('pro-auto-loads-btn').click();
    await alSection(page, 'wind');
    await page.getByTestId('al-enable-wind').check();
    await expect(page.getByTestId('al-cladding')).toContainText(/5\.4-1/);
    await expect(page.getByTestId('al-cladding-z')).toBeVisible();
    // A parapet of 1 m turns zone 3 into zone 2 (note 7).
    const zone = (z: string) => page.getByTestId('al-cladding-table').locator('tbody tr').filter({ hasText: /Roof/ }).filter({ has: page.locator(`td:nth-child(2):text-is("${z}")`) }).locator('td').nth(3);
    const z3 = await zone('3').innerText();
    await page.getByTestId('al-cladding-parapet').check();
    await expect(zone('3')).not.toHaveText(z3);
    await expect(zone('3')).toHaveText(await zone('2').innerText());
  });
});
