import { test, expect, loadModel, solveModel } from './fixtures';

/**
 * Reinforcement by sheets on the seven-storey concrete example: solved, its physical members
 * recognised (walls meshed by a second solve), every family has rows and the beams and columns their
 * sections, the core's ground-floor walls are failed for resting on one node, a continuous beam's run
 * adopted short fails and says why, going back to the proposal makes it verify again, and a span
 * opens into its checks by combination.
 */
test.use({ appLocale: 'es' });

test('@slow the reinforcement sheets design beams, columns, slabs and walls of a solved building', async ({ pro: page }) => {
  await loadModel(page, 'pro-edificio-7p');
  await solveModel(page);

  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-rcSheets').click();
  await expect(page.getByTestId('rc-sheets-panel')).toBeVisible();
  await page.getByTestId('rc-recognize').click();

  await expect(page.getByTestId('rc-open-beam')).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByTestId('rc-open-column')).toBeEnabled();
  await expect(page.getByTestId('rc-open-slab')).toBeEnabled();
  await expect(page.getByTestId('rc-open-wall')).toBeEnabled();
  await expect(page.getByTestId('rc-panel-code')).toContainText('CIRSOC 201-2025');

  await page.getByTestId('rc-open-beam').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  await expect(ws).toBeVisible();
  await expect(ws.getByTestId('rc-code')).toContainText('CIRSOC 201-2025');
  const first = ws.getByTestId('rc-row').first();
  await expect(first).toContainText('Verifica');

  await first.click();
  await expect(ws.getByTestId('rc-line-svg')).toBeVisible();
  await expect(ws.getByTestId('rc-schedule')).toBeVisible();
  await expect(ws.getByTestId('rc-section').first()).toContainText('V1-1 · i');
  await expect(ws.getByTestId('rc-section').first().locator('circle').first()).toBeVisible();
  const editor = ws.getByTestId('rc-line-editor');
  await editor.getByRole('spinbutton', { name: 'Cantidad' }).first().fill('2');
  await editor.getByRole('combobox', { name: 'Diámetro' }).first().selectOption('10');
  await expect(ws.getByTestId('rc-row').first()).toContainText('No verifica');
  await expect(ws.getByTestId('rc-checks').first()).toContainText('✗');

  await editor.getByRole('button', { name: 'Volver a la propuesta' }).click();
  await expect(ws.getByTestId('rc-row').first()).not.toContainText('No verifica');

  await ws.getByTestId('rc-span-toggle').first().click();
  await ws.locator('summary', { hasText: 'Por combinación' }).first().click();
  await expect(ws.getByTestId('rc-combos').first()).toBeVisible();

  await ws.getByTestId('rc-tab-column').click();
  await expect(ws.getByTestId('rc-table-column')).toBeVisible();
  await ws.getByTestId('rc-row').first().click();
  await expect(ws.getByTestId('rc-section')).toHaveCount(1);
  await expect(ws.getByTestId('rc-section').locator('circle').first()).toBeVisible();
  await ws.getByTestId('rc-tab-slab').click();
  await expect(ws.getByTestId('rc-table-slab')).toBeVisible();
  await ws.getByTestId('rc-tab-wall').click();
  await expect(ws.getByTestId('rc-table-wall')).toBeVisible();
  // The example's core stands on the corner column alone: its ground-floor walls rest on one node each.
  const ground = ws.getByTestId('rc-row').filter({ hasText: 'N0' });
  await expect(ground).toHaveCount(3);
  await expect(ground.first()).toContainText('No verifica');
  await ground.first().click();
  await expect(ws.getByTestId('rc-checks').first()).toContainText('La base del tabique apoya en toda su longitud');
  await expect(ws.getByTestId('rc-row').filter({ hasText: 'N1' }).first()).toContainText('Verifica');
});
