/**
 * The project's design data in one panel: the covers held against CIRSOC 201-2025 Table
 * 20.5.1.3.1, the preset that sets them to it, the steel. Each datum's use is pinned in
 * `store/__tests__/design-data.test.ts`. The reinforcement sheets read them with design off too,
 * so they are edited from the sheets and from the building's general data whatever the setting,
 * and so are the seismic data of the sheets' chapter 18 rows.
 */
import { test, expect, designPlace, loadModel, solveModel, ribbonCmd } from './fixtures';
import { setDesignOption } from './design-options';

test.describe('@smoke design data', () => {
  test('the default covers meet the table, a cover under it is flagged, the CIRSOC preset sets them, it undoes', async ({ pro: page }) => {
    await designPlace(page, 'designData');
    await expect(page.getByTestId('design-data-panel')).toBeVisible();
    await expect(page.getByTestId('design-data-cover-beam')).toHaveValue('30');
    await expect(page.getByTestId('design-data-cover-footing')).toHaveValue('55');
    await expect(page.getByTestId('design-data-under')).toHaveCount(0);
    await page.getByTestId('design-data-cover-beam').fill('25');
    await page.getByTestId('design-data-cover-beam').press('Enter');
    await expect(page.getByTestId('design-data-under')).toBeVisible();
    await page.getByTestId('design-data-cirsoc').click();
    await expect(page.getByTestId('design-data-cover-beam')).toHaveValue('30');
    await expect(page.getByTestId('design-data-cover-footing')).toHaveValue('55');
    await expect(page.getByTestId('design-data-under')).toHaveCount(0);
    await page.getByTestId('design-data-grade').selectOption('ADN 500');
    await expect(page.getByTestId('design-data-fy')).toHaveValue('500');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect(page.getByTestId('design-data-fy')).toHaveValue('420');
    await page.getByTestId('design-data-control').uncheck();
    await expect(page.getByTestId('design-data-under')).toBeVisible();
    await page.getByTestId('design-data-control').check();
    await expect(page.getByTestId('design-data-under')).toHaveCount(0);
  });
});

test.describe('@smoke design data: deflections', () => {
  test('say what beams and slabs carry, the load duration and the sustained share; the creep coefficient is EN 1992\'s only', async ({ pro: page }) => {
    await designPlace(page, 'designData');
    const card = page.getByTestId('design-options-deflection');
    await card.locator('> summary').click();
    await card.getByTestId('dd-defl-supports').selectOption('fragile');
    await expect(page.getByTestId('design-options-deflection-summary')).toContainText('480');
    await card.getByTestId('dd-defl-months').selectOption('12');
    const share = card.getByTestId('dd-defl-sustained');
    await share.fill('0.5');
    await share.dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => window.__stabileo.serializeProject())).toMatch(/"deflection":\{"supports":"fragile","months":12,"sustained":0\.5\}/);
    await expect(card.getByTestId('dd-defl-creep')).toBeDisabled();
    await card.getByTestId('dd-defl-always').check();
    await expect.poll(() => page.evaluate(() => window.__stabileo.serializeProject())).toContain('"always":true');
  });
});

test.describe('@smoke design data with design off', () => {
  test('the sheets and the building edit the covers, the steel and the seismic data the sheets read', async ({ pro: page }) => {
    await page.getByTestId('pro-settings').click();
    await page.getByTestId('cfg-design-in-pro').uncheck();
    await expect(page.getByTestId('pr-stage-design')).toHaveCount(0);
    await loadModel(page, 'rc-design-qa-seismic');
    await solveModel(page);

    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-rcSheets').click();
    const data = page.getByTestId('rc-design-data');
    await data.locator('> summary').click();
    const cover = data.getByTestId('design-data-cover-beam');
    await cover.fill('35');
    await cover.dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => window.__stabileo.serializeProject())).toMatch(/"beam":0\.035\b/);

    await page.getByTestId('rc-design').click();
    await expect(page.getByTestId('rc-open-vertical')).toBeEnabled({ timeout: 120_000 }); // slow-ok: the sheets design every member and combination before the families open
    await setDesignOption(page, 'seismic');
    await expect(page.getByTestId('rc-stale')).toBeVisible();
    await page.getByTestId('rc-redesign').click();
    await expect(page.getByTestId('rc-stale')).toHaveCount(0, { timeout: 120_000 }); // slow-ok: chapter 18 designs every column against the joints' beams again
    await page.getByTestId('rc-open-vertical').click();
    const ws = page.getByTestId('rc-sheets-workspace');
    await ws.getByTestId('rc-row').first().click();
    await expect(ws.getByTestId('rc-checks').first()).toContainText('§18.7.5');
    await page.keyboard.press('Escape');
    const seismic = page.getByTestId('rc-seismic-data');
    const overstrength = seismic.getByTestId('seismic-overstrength');
    await overstrength.fill('1.4');
    await overstrength.dispatchEvent('change');
    await expect.poll(() => page.evaluate(() => window.__stabileo.serializeProject())).toContain('"overstrength":1.4');

    await page.getByTestId('pr-stage-model').click();
    await ribbonCmd(page, 'building');
    await page.getByTestId('building-rebar-grade').selectOption('ADN 500');
    await page.getByTestId('building-general-more').locator('> summary').click();
    await expect(page.getByTestId('building-general-more').getByTestId('design-data-fy')).toHaveValue('500');
    await expect(page.getByTestId('building-general-more').getByTestId('design-data-cover-beam')).toHaveValue('35');
  });
});
