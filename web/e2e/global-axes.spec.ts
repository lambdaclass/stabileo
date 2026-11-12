import { test, expect } from './fixtures';

test('@smoke with Y chosen as up, a node written at Y = 3 is stored three metres up and the tables follow', async ({ pro: page }) => {
  const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
  await page.mouse.click(triad.x + triad.width / 2, triad.y + triad.height / 2);
  const picker = page.getByTestId('axes-picker');
  await picker.getByTestId('axes-up-+Y').click();
  await expect(picker.getByTestId('axes-summary')).toContainText('−Y');
  await picker.getByTestId('axes-done').click();
  await expect(picker).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('stabileo-axes'))).toContain('"up":"+Y"');

  await page.getByTestId('pr-stage-model').click();
  await page.getByTestId('pr-cmd-nodes').click();
  await page.getByTestId('write-node').click();
  await page.getByTestId('write-node-x').fill('2');
  await page.getByTestId('write-node-y').fill('3');
  await page.getByTestId('write-node-z').fill('0');
  await page.getByTestId('write-node-card-submit').click();
  await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(1);
  const id = (await page.evaluate(() => window.__stabileo.nodeIds()))[0];
  const p = await page.evaluate((n) => window.__stabileo.nodePosition(n), id);
  expect({ x: p!.x, y: p!.y + 0, z: p!.z }).toEqual({ x: 2, y: 0, z: 3 });

  const row = page.locator('.pro-nodes-table tbody tr').first();
  await expect(row.locator('input').nth(2)).toHaveValue(/^3/);

  await page.reload();
  await page.waitForFunction(() => !!window.__stabileoActions);
  expect(await page.evaluate(() => localStorage.getItem('stabileo-axes'))).toContain('"up":"+Y"');
});

test('@smoke a drag that starts on the axis triad still orbits, and a click opens the picker', async ({ pro: page }) => {
  const triad = (await page.getByTestId('axes-open-3d').boundingBox())!;
  const before = await page.evaluate(() => window.__stabileo.cameraState());
  await page.mouse.move(triad.x + triad.width / 2, triad.y + triad.height / 2);
  await page.mouse.down();
  await page.mouse.move(triad.x + triad.width / 2 + 150, triad.y + triad.height / 2 - 60, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('axes-picker')).toHaveCount(0);
  const after = await page.evaluate(() => window.__stabileo.cameraState());
  expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
});

test('@smoke Settings links to the axes picker', async ({ pro: page }) => {
  await page.getByTestId('pro-settings').click();
  await expect(page.getByTestId('cfg-axes-summary')).toContainText('Z');
  await page.getByTestId('cfg-axes-open').click();
  await expect(page.getByTestId('axes-picker')).toBeVisible();
  await expect(page.getByTestId('axes-toward-local')).not.toBeChecked();
  await expect(page.getByTestId('axes-diag-body')).toHaveCount(0);
  await page.getByTestId('axes-diag-toggle').click();
  const caption = page.getByTestId('axes-diag-caption');
  const before = await caption.textContent();
  await page.getByTestId('axes-toward-local').check();
  await expect(caption).not.toHaveText(before ?? '');
  await page.getByTestId('axes-toward-local').uncheck();
  await expect(caption).toHaveText(before ?? '');
});

test('@smoke Settings → Set… opens the picker over the app, and an axis edited there is kept', async ({ pro: page }) => {
  await page.getByTestId('pro-settings').click();
  await page.getByTestId('cfg-axes-open').click();
  const picker = page.getByTestId('axes-picker');
  await expect(picker).toBeVisible();
  const overlay = page.locator('.ax-overlay');
  await expect(overlay).toHaveCSS('position', 'fixed');
  const box = (await picker.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  await picker.getByTestId('axes-up-+Y').click();
  await expect(picker.getByTestId('axes-summary')).toContainText('−Y');
  await picker.getByTestId('axes-done').click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByTestId('cfg-axes-summary')).toContainText('Y');
  expect(await page.evaluate(() => localStorage.getItem('stabileo-axes'))).toContain('"up":"+Y"');
});
