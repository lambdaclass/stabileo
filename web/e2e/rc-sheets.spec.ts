import { test, expect, loadModel, solveModel } from './fixtures';

/**
 * Reinforcement by sheets on the seven-storey concrete example: solved, its physical members
 * recognised, every family has rows, a beam's bars adopted short fail and the row says why in its
 * step by step, and going back to the proposal makes it verify again.
 */
test.use({ appLocale: 'es' });

test('@slow the reinforcement sheets design beams, columns and slabs of a solved building', async ({ pro: page }) => {
  await loadModel(page, 'pro-edificio-7p');
  await solveModel(page);

  await page.getByTestId('pr-stage-analyse').click();
  await page.getByTestId('pr-cmd-rcSheets').click();
  await expect(page.getByTestId('rc-sheets-panel')).toBeVisible();
  await page.getByTestId('rc-recognize').click();

  await expect(page.getByTestId('rc-open-beam')).toBeEnabled();
  await expect(page.getByTestId('rc-open-column')).toBeEnabled();
  await expect(page.getByTestId('rc-open-slab')).toBeEnabled();

  await page.getByTestId('rc-open-beam').click();
  const ws = page.getByTestId('rc-sheets-workspace');
  await expect(ws).toBeVisible();
  const first = ws.getByTestId('rc-row').first();
  await expect(first).toContainText('Verifica');

  await first.click();
  const editor = ws.getByTestId('rc-editor');
  await editor.getByRole('spinbutton', { name: 'Cantidad' }).first().fill('1');
  await editor.getByRole('spinbutton', { name: 'Cantidad' }).first().press('Tab');
  await expect(ws.getByTestId('rc-row').first()).toContainText('No verifica');
  await expect(ws.getByTestId('rc-steps')).toContainText('✗');

  await editor.getByRole('button', { name: 'Volver a la propuesta' }).click();
  await expect(ws.getByTestId('rc-row').first()).toContainText('Verifica');
  await expect(ws.getByTestId('rc-row').first()).not.toContainText('No verifica');

  await ws.getByTestId('rc-tab-column').click();
  await expect(ws.getByTestId('rc-table-column')).toBeVisible();
  await ws.getByTestId('rc-tab-slab').click();
  await expect(ws.getByTestId('rc-table-slab')).toBeVisible();
});
