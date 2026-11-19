import { dwellingFloorLoads, expectGeneratedSeismicCarriers, expectLoadGenerationRefusal, loadSeismicFloor, openSeismicLoadGenerator } from './load-generator-inputs';
import { test, expect, loadModel, alSection } from './fixtures';

async function openDialog(page: import('@playwright/test').Page) {
  await loadModel(page, 'rc-design-qa-8');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-loads').click();
  await page.getByTestId('pro-auto-loads-btn').click();
  await expect(page.getByTestId('dead-picker')).toBeVisible();
}

test.describe('@smoke area loads by tributary area, the roof apart', () => {
  test('a maintenance roof refuses; dwelling panels apply with a derivation and one undo', async ({ pro: page }) => {
    await openDialog(page);
    await alSection(page, 'applying');
    await expect(page.getByTestId('al-gravity-mode')).toHaveValue('panels');
    await alSection(page, 'roof');
    await expect(page.getByTestId('al-roof')).toBeChecked();
    await expect(page.getByTestId('al-roof-use')).toHaveValue('maintenance');
    await expect(page.getByTestId('al-roof-lr')).toContainText(/Lr 0\.\d\d–0\.\d\d kN\/m²/);
    const before = await page.evaluate(() => window.__stabileo.modelCensus());
    await expectLoadGenerationRefusal(page, /concentrated roof actions/);
    await dwellingFloorLoads(page);
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-preview')).toContainText(/tributary area/i);
    await page.getByTestId('al-apply').click();
    await expect(page.getByTestId('al-apply')).toHaveCount(0, { timeout: 45_000 });
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names).not.toContain('Roof live');
    const after = await page.evaluate(() => window.__stabileo.modelCensus());
    expect(after.loads).toBeGreaterThan(before.loads);
    // The whole application is one step back.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => page.evaluate(() => window.__stabileo.modelCensus().loads)).toBe(before.loads);
    expect((await page.evaluate(() => window.__stabileo.modelCensus())).combinations).toBe(before.combinations);
  });

  test('an occupied roof refuses; dwelling floors still accept a uniform width', async ({ pro: page }) => {
    await openDialog(page);
    await alSection(page, 'applying');
    await page.getByTestId('al-gravity-mode').selectOption('width');
    await alSection(page, 'roof');
    await page.getByTestId('al-roof-use').selectOption('occupancy');
    await page.getByTestId('al-roof-occupancy').selectOption('azotea_privada');
    await expectLoadGenerationRefusal(page, /concentrated roof actions/);
    await dwellingFloorLoads(page);
    await page.getByTestId('al-preview-btn').click();
    await page.getByTestId('al-apply').click();
    await expect(page.getByTestId('al-apply')).toHaveCount(0, { timeout: 45_000 });
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names).not.toContain('Roof live');
  });
});

test.describe('@smoke torsion of edge beams under one-sided slab load (#1401)', () => {
  test('the preview names the edge beams for a torsion check', async ({ pro: page }) => {
    await openDialog(page);
    await dwellingFloorLoads(page);
    await page.getByTestId('al-preview-btn').click();
    const box = page.getByTestId('al-assumptions');
    await expect(box).toContainText('Torsion from one-sided slab load is not included');
    await expect(box).toContainText(/Check these edge beams for torsion: \d+(, \d+)*\./);
    await page.getByTestId('al-derivation').locator('summary').click();
    await expect(page.getByTestId('al-derivation')).toContainText('Torsion from one-sided slab load is not included');
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    test(`readable at ${viewport.width} px`, async ({ pro: page }) => {
      await page.setViewportSize(viewport);
      if (viewport.width < 600) {
        await loadModel(page, 'rc-design-qa-8');
        await page.keyboard.press('Escape');
        await page.getByRole('navigation').getByRole('button', { name: 'PRO' }).click();
        await page.getByRole('button', { name: 'Loads', exact: true }).click();
        await page.getByTestId('pro-auto-loads-btn').click();
      } else {
        await openDialog(page);
      }
      await dwellingFloorLoads(page);
      await page.getByTestId('al-preview-btn').click();
      const item = page.getByTestId('al-assumptions').locator('li', { hasText: 'edge beams' });
      await item.scrollIntoViewIfNeeded();
      const r = (await item.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(viewport.width);
      expect(await item.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await item.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(10);
      await page.screenshot({ path: test.info().outputPath(`edge-beam-advisory-${viewport.width}.png`) });
    });
  }
});

test.describe('@smoke seismic generation', () => {
  test('refuses modal response-spectrum load generation and links the issue', async ({ pro: page }) => {
    await loadSeismicFloor(page);
    await openSeismicLoadGenerator(page);
    await dwellingFloorLoads(page);
    await page.getByTestId('al-seismic-method-select').selectOption('modal');
    await page.getByTestId('al-seismic-torsion').selectOption('medium');
    await expect(page.getByTestId('al-seismic-vertical')).toBeChecked();
    await expectLoadGenerationRefusal(page, /Modal seismic load generation is unavailable until the modal force distribution is corrected\. Use the static method\./, 2319);
    await page.getByTestId('al-seismic-method-select').selectOption('static');
    await page.getByTestId('al-preview-btn').click();
    await expect(page.getByTestId('al-preview')).toContainText(/Vertical component/);
    await page.getByTestId('al-apply').click();
    await expect(page.getByTestId('al-apply')).toHaveCount(0, { timeout: 45_000 });
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names.filter((n) => /^Seismic X \(\+5 % eccentricity\)|^Seismic X \(−5 % eccentricity\)/.test(n))).toHaveLength(2);
    await expectGeneratedSeismicCarriers(page);
  });

  test('static generation refuses eccentric floor mass on frame members', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await openSeismicLoadGenerator(page);
    await dwellingFloorLoads(page);
    await page.getByTestId('al-seismic-method-select').selectOption('static');
    await expectLoadGenerationRefusal(page, /Seismic loading refused at 3[.]2 m[.] The floor tributary region requires eccentric member loads/);
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
    await dwellingFloorLoads(page);
    await page.getByTestId('al-preview-btn').click();
    await page.getByTestId('al-apply').click();
    await expect(page.getByTestId('al-apply')).toHaveCount(0, { timeout: 45_000 });
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names.some((n) => /free roof, case A/.test(n))).toBe(true);
  });
});

test.describe('@smoke T, H and F from the dialog', () => {
  test('a temperature change makes its T cases, one for each sense (§2.3.4)', async ({ pro: page }) => {
    await openDialog(page);
    await alSection(page, 'special');
    await page.getByTestId('al-thermal').check();
    await page.getByTestId('al-thermal-dt').fill('25');
    await dwellingFloorLoads(page);
    await page.getByTestId('al-preview-btn').click();
    await page.getByTestId('al-apply').click();
    await expect(page.getByTestId('al-apply')).toHaveCount(0, { timeout: 45_000 });
    const names = await page.evaluate(() => window.__stabileo.loadCaseNames());
    expect(names).toContain('Temperature');
    expect(names).toContain('Temperature (−ΔT)');
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
    await dwellingFloorLoads(page);
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
    await dwellingFloorLoads(page);
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
