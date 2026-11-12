import { test, expect, loadModel, alSection } from './fixtures';

/**
 * The load generator by code family: the dialog's code selector binds a whole family at once
 * (basis, imposed loads, wind, snow, seismic), and each pane then asks for that code's own inputs.
 */
async function openDialog(page: import('@playwright/test').Page) {
  await loadModel(page, 'rc-design-qa-8');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  await page.getByTestId('pro-auto-loads-btn').click();
  await expect(page.getByTestId('dead-picker')).toBeVisible();
}

test.describe('@smoke loads by code family', () => {
  test('Eurocodes: EN 1991-1-4 wind and EN 1998-1 seismic from their own inputs, combined by EN 1990', async ({ pro: page }) => {
    await openDialog(page);
    await page.getByTestId('al-family').selectOption('eurocode');
    await expect(page.getByTestId('al-family-error')).toHaveCount(0);

    await alSection(page, 'live');
    await expect(page.getByTestId('al-occupancy').locator('option')).toContainText([/Category B|offices/i]);
    await page.getByTestId('al-occupancy').selectOption('ec-B');

    await alSection(page, 'wind');
    await page.getByTestId('al-enable-wind').check();
    await page.getByTestId('ec-wind-vb0').fill('26');
    await page.getByTestId('ec-wind-terrain').selectOption('III');
    await expect(page.getByTestId('al-nav-wind')).toContainText('vb,0 26');

    await alSection(page, 'seismic');
    await page.getByTestId('al-enable-seismic').check();
    await page.getByTestId('ec-seismic-agr').fill('0.25');
    await page.getByTestId('ec-seismic-ground').selectOption('C');
    await page.getByTestId('ec-seismic-q').fill('3.9');
    await expect(page.getByTestId('al-nav-seismic')).toContainText('agR 0.25');

    const before = (await page.evaluate(() => window.__stabileo.modelCensus())).combinations;
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-apply')).toBeEnabled({ timeout: 45_000 });
    await expect(page.getByTestId('al-preview')).toContainText('EN 1990');
    await page.getByTestId('al-apply').click();
    await expect(page.getByTestId('al-apply')).toHaveCount(0, { timeout: 45_000 });

    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names.some((n) => /^Wind /.test(n))).toBe(true);
    expect(names.some((n) => /^(Seismic|Earthquake)/.test(n))).toBe(true);
    expect((await page.evaluate(() => window.__stabileo.modelCensus())).combinations).toBeGreaterThan(before);

    await page.getByTestId('pro-auto-loads-btn').click();
    await expect(page.getByTestId('al-family')).toHaveValue('eurocode');
    await alSection(page, 'wind');
    await expect(page.getByTestId('ec-wind-vb0')).toHaveValue('26');
    await expect(page.getByTestId('ec-wind-terrain')).toHaveValue('III');
  });

  test('the roof pane follows the family: CIRSOC weighs heavy and light roofs, TS 498 and the Eurocodes do not', async ({ pro: page }) => {
    await openDialog(page);
    await alSection(page, 'roof');
    await page.getByTestId('al-roof').check();
    await page.getByTestId('al-roof-use').selectOption('maintenance');
    await expect(page.getByTestId('al-roof-weight')).toBeVisible();
    await expect(page.getByTestId('al-roof-lr')).toContainText('–');

    await page.getByTestId('al-family').selectOption('eurocode');
    await alSection(page, 'roof');
    await expect(page.getByTestId('al-roof-weight')).toHaveCount(0);
    await expect(page.getByTestId('al-roof-lr')).toHaveText(/^Lr 0\.40\b/);

    await page.getByTestId('al-family').selectOption('turkey');
    await expect(page.getByTestId('al-family-error')).toHaveCount(0);
    await alSection(page, 'roof');
    await expect(page.getByTestId('al-roof-weight')).toHaveCount(0);
    await page.getByTestId('al-roof-use').selectOption('occupancy');
    await expect(page.getByTestId('al-roof-occupancy').locator('option')).toHaveCount(2);

    await page.getByTestId('al-family').selectOption('cirsoc');
    await alSection(page, 'roof');
    await page.getByTestId('al-roof-use').selectOption('maintenance');
    await expect(page.getByTestId('al-roof-weight')).toBeVisible();
  });

  test('no pane of another family shows CIRSOC: each lists its own occupancies, dead load and rules', async ({ pro: page }) => {
    await openDialog(page);
    const own: Record<string, RegExp> = { eurocode: /^A · /, uk: /^A1 · /, us: /^Access floor/, turkey: /./ };
    for (const family of ['eurocode', 'uk', 'us', 'turkey'] as const) {
      await page.getByTestId('al-family').selectOption(family);
      await expect(page.getByTestId('al-family-error')).toHaveCount(0);
      for (const section of ['dead', 'live', 'roof', 'wind', 'snow', 'seismic', 'special', 'applying', 'combos'] as const) {
        await alSection(page, section);
        const pane = page.locator('.al-pane');
        await expect(pane, `${family} · ${section}`).not.toContainText(/CIRSOC|INPRES|Tabla|Table 3\.1|Table 4\.1/);
      }
      await alSection(page, 'dead');
      await expect(page.getByTestId('dead-picker')).toHaveCount(0);
      await alSection(page, 'live');
      const options = await page.getByTestId('al-occupancy').locator('option').allTextContents();
      expect(options.length, family).toBeGreaterThan(1);
      expect(options.some((o) => own[family]!.test(o)), `${family}: ${options[0]}`).toBe(true);
      // CIRSOC 101 Tabla 4.1's dwellings row is not among them.
      expect(options.some((o) => o.startsWith('Dwellings — rooms generally'))).toBe(false);
    }
  });
});
