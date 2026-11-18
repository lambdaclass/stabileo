import { test, expect, loadModel, solveModel } from './fixtures';

test.use({ appLocale: 'es' });

test('@slow the sheets\' bars in 3D: every element, one row\'s from the workspace, and off again', async ({ pro: page }) => {
  test.setTimeout(240_000);
  await loadModel(page, 'pro-edificio-7p');
  await solveModel(page);
  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-rcSheets').click();
  await expect(page.getByTestId('rc-design')).toBeEnabled({ timeout: 120_000 });
  await page.getByTestId('rc-design').click();
  await expect(page.getByTestId('rc-open-beam')).toBeEnabled({ timeout: 60_000 });

  const panel = page.getByTestId('rc-rebar-3d');
  await panel.getByTestId('rc-rebar-3d-toggle').check();
  const count = async () => Number((await panel.getByTestId('rc-rebar-3d-count').textContent())!.replace(/\D/g, ''));
  await expect.poll(count).toBeGreaterThan(10_000);
  const everything = await count();
  await panel.getByTestId('rc-rebar-3d-slab').uncheck();
  await expect.poll(count).toBeLessThan(everything);
  await panel.getByTestId('rc-rebar-3d-slab').check();

  await page.getByTestId('rc-open-beam').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  const row = ws.getByTestId('rc-row').first();
  const name = (await row.locator('td.nm').evaluate((td) => td.firstChild?.textContent ?? '')).trim();
  await row.click();
  await ws.getByTestId('rc-view-3d').click();
  await expect(ws).toHaveCount(0);
  await expect(panel.getByTestId('rc-rebar-3d-row')).toContainText(name);
  await expect.poll(count).toBeLessThan(everything);
  await expect.poll(count).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath('rebar-3d-row.png') });

  await panel.getByTestId('rc-rebar-3d-all').click();
  await expect.poll(count).toBe(everything);
  await panel.getByTestId('rc-rebar-3d-toggle').uncheck();
  await expect(panel.getByTestId('rc-rebar-3d-count')).toHaveCount(0);
});
