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
  // The physical elements are already read; the walls, one element a storey, are meshed for the sheets.
  await expect(page.getByTestId('rc-recognize')).toHaveCount(0);
  await page.getByTestId('rc-mesh-walls').click();
  await expect(page.getByTestId('rc-mesh-walls')).toHaveCount(0, { timeout: 120_000 });

  await expect(page.getByTestId('rc-open-beam')).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByTestId('rc-open-column')).toBeEnabled();
  await expect(page.getByTestId('rc-open-slab')).toBeEnabled();
  await expect(page.getByTestId('rc-open-wall')).toBeEnabled();
  await expect(page.getByTestId('rc-panel-code').getByTestId('rc-code-select')).toHaveValue('cirsoc201-2025');

  await page.getByTestId('rc-open-beam').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  await expect(ws).toBeVisible();
  await expect(ws.getByTestId('rc-code').getByTestId('rc-code-select')).toHaveValue('cirsoc201-2025');
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

  // The code is switched from the sheets themselves: every family is designed again to it, and the choice is the project's.
  const picker = ws.getByTestId('rc-code').getByTestId('rc-code-select');
  for (const [code, clause] of [['en1992-1-1', '9.2.1.3, 6.1'], ['bs-en1992-1-1', '9.2.1.3, 6.1'], ['ts500-2000', '7.1, 7.3'], ['aci318-19', '§9.7.3, §22.2']] as const) {
    await picker.selectOption(code);
    await ws.getByTestId('rc-tab-beam').click();
    await expect(ws.getByTestId('rc-row').first()).toBeVisible();
    await ws.getByTestId('rc-row').first().click();
    await expect(ws.getByTestId('rc-checks').first()).toContainText(clause);
    await ws.getByTestId('rc-tab-column').click();
    await expect(ws.getByTestId('rc-row').first()).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('rc-panel-code').getByTestId('rc-code-select')).toHaveValue('aci318-19');
});
