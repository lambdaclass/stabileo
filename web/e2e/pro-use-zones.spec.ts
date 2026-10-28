import { test, expect, loadModel } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

/*
 * A use zone from the interface, on the portal's top plate (nodes 5-6-8-7): the plate written on
 * its outline and meshed; the zone picked as its nodes, told its use from the table, its live
 * load planned and written once; the map shown; saved and opened.
 */
const loads = (page: import('@playwright/test').Page) => page.evaluate(() => window.__stabileo.modelCensus().loads);

test('@smoke a zone told its use loads the plate under it, once', async ({ pro: page }) => {
  await loadModel(page, '3d-portal-frame');
  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-shells').click();
  await page.getByTestId('write-plate').click();
  await page.getByTestId('write-corners-outline').click();
  await page.getByTestId('plate-outline-nodes').fill('5, 6, 8, 7');
  await page.getByTestId('write-plate-card-submit').click();
  await expect(page.getByTestId('plate-panel')).toBeVisible();
  await page.getByTestId('plate-mesh-open').click();
  await page.getByTestId('plate-mesh-apply').click();
  await expect.poll(async () => (await page.evaluate(() => window.__stabileo.plates()))[0]?.status).toBe('current');

  await page.getByTestId('pr-cmd-loads').click();
  await page.getByTestId('load-tab-floor').click();
  await page.evaluate(() => window.__stabileoActions.selectNodes([5, 6, 8, 7]));
  await page.getByTestId('lz-name').fill('Oficina');
  await page.getByTestId('lz-add').click();
  const row = page.getByTestId('use-zone-Oficina');
  await expect(row).toBeVisible();
  await expect(row).toContainText(/unassigned/);

  const before = await loads(page);
  await page.getByTestId('use-zone-use-Oficina').selectOption('oficina');
  await expect(row).toContainText(/assigned/);
  await page.getByTestId('use-zones-plan').click();
  await expect(page.getByTestId('use-zones-plan-dialog')).toContainText('2.5');
  await page.getByTestId('use-zones-plan-apply').click();
  await expect(page.getByTestId('use-zones-plan-result')).toBeVisible();
  await expect.poll(() => loads(page)).toBeGreaterThan(before);
  // Planned again: nothing left to do.
  await page.keyboard.press('Escape');
  await page.getByTestId('use-zones-plan').click();
  await expect(page.getByTestId('use-zones-plan-empty')).toBeVisible();
  await page.keyboard.press('Escape');

  // The map over the floor, by state.
  await page.getByTestId('use-zone-map').selectOption('status');

  const text = await page.evaluate(() => window.__stabileo.serializeProject());
  const n = await loads(page);
  await page.evaluate((t) => window.__stabileoActions.loadProject(JSON.parse(t)), text);
  await expect(page.getByTestId('use-zone-Oficina')).toBeVisible();
  expect(await loads(page)).toBe(n);
});
